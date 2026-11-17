// Narrador de la pantalla VS: reune los datos del partido, arma el texto (introNarration.js)
// y lo convierte en voz (ttsService.js). Cachea el mp3 en memoria por partido + texto para que
// la precarga (durante el viaje del mapa) y la reproduccion compartan una sola llamada.
const crypto = require('crypto');
const prisma = require('../db/prisma');
const {
  TTS_INTRO_ENABLED,
  TTS_CACHE_MAX,
  INTRO_STREAK_MIN,
  INTRO_HR_MIN,
  RIVALRY_BADGE_THRESHOLD,
  DIVISION_CONFERENCES,
} = require('../config');
const { getLineup } = require('./lineup');
const { getRivalryIntensity } = require('./rivalryService');
const { cityName } = require('./mapService');
const { computeTrailingStreak } = require('./newsDetection');
const { buildIntroText, seededRng } = require('./introNarration');
const { buildNarratorClips } = require('./narratorClips');
const { synthesizeSpeech } = require('./ttsService');
const { isEnabled } = require('./aiService');

const STREAK_LOOKBACK_GAMES = 40;

const fullName = (p) => (p ? `${p.first_name} ${p.last_name}` : null);

async function teamStreak(teamId, seasonId) {
  const games = await prisma.gameSchedule.findMany({
    where: {
      season_id: seasonId,
      status: 'finished',
      OR: [{ home_team_id: teamId }, { away_team_id: teamId }],
    },
    orderBy: { day_number: 'desc' },
    take: STREAK_LOOKBACK_GAMES,
    select: { home_team_id: true, away_team_id: true, home_score: true, away_score: true },
  });
  return computeTrailingStreak(games, teamId);
}

const teamSelect = { id: true, name: true, division: { select: { name: true } } };

// Datos del partido para el narrador (solo lecturas).
async function getIntroFacts(game) {
  const [homeTeam, awayTeam] = await Promise.all([
    prisma.team.findUnique({ where: { id: game.home_team_id }, select: teamSelect }),
    prisma.team.findUnique({ where: { id: game.away_team_id }, select: teamSelect }),
  ]);
  if (!homeTeam || !awayTeam) return null;

  const [homeLineup, awayLineup, rivalryIntensity, homeStreak, awayStreak, series] = await Promise.all([
    getLineup(game.home_team_id, game),
    getLineup(game.away_team_id, game),
    getRivalryIntensity(game.home_team_id, game.away_team_id),
    teamStreak(game.home_team_id, game.season_id),
    teamStreak(game.away_team_id, game.season_id),
    game.playoff_series_id
      ? prisma.playoffSeries.findUnique({ where: { id: game.playoff_series_id }, select: { round: true } })
      : null,
  ]);

  const players = [homeLineup, awayLineup]
    .filter(Boolean)
    .flatMap((l) => [l.pitcher, ...(l.players || [])])
    .filter(Boolean);
  const playerIds = players.map((p) => p.id);
  const nameById = new Map(players.map((p) => [p.id, fullName(p)]));

  let hrLeader = null;
  let heir = null;
  if (playerIds.length) {
    const [hrRows, heirs] = await Promise.all([
      prisma.gameEvent.groupBy({
        by: ['player_id'],
        where: { result: 'HR', player_id: { in: playerIds }, game: { season_id: game.season_id } },
        _count: { _all: true },
      }),
      prisma.player.findMany({
        where: { id: { in: playerIds }, parent_id: { not: null } },
        select: { id: true, parent_id: true },
      }),
    ]);

    const top = hrRows
      .map((r) => ({ id: r.player_id, count: Number(r._count?._all ?? 0) }))
      .sort((a, b) => b.count - a.count)[0];
    if (top && top.count > 0) hrLeader = { name: nameById.get(top.id), count: top.count };

    if (heirs.length) {
      const parent = await prisma.player.findUnique({
        where: { id: heirs[0].parent_id },
        select: { first_name: true, last_name: true },
      });
      if (parent) heir = { name: nameById.get(heirs[0].id), parentName: fullName(parent) };
    }
  }

  return {
    city: cityName(homeTeam.name),
    homeName: homeTeam.name,
    awayName: awayTeam.name,
    homeConference: DIVISION_CONFERENCES[homeTeam.division?.name] ?? null,
    awayConference: DIVISION_CONFERENCES[awayTeam.division?.name] ?? null,
    homePitcher: fullName(homeLineup?.pitcher),
    awayPitcher: fullName(awayLineup?.pitcher),
    playoffRound: series ? series.round : null,
    isRivalry: rivalryIntensity >= RIVALRY_BADGE_THRESHOLD,
    streaks: [
      { teamName: homeTeam.name, ...homeStreak },
      { teamName: awayTeam.name, ...awayStreak },
    ],
    hrLeader,
    heir,
  };
}

async function getIntroText(game) {
  const facts = await getIntroFacts(game);
  if (!facts) return null;
  return buildIntroText(facts, {
    rng: seededRng(game.id),
    streakMin: INTRO_STREAK_MIN,
    hrMin: INTRO_HR_MIN,
  });
}

// Clips del narrador pregrabado (ElevenLabs) para este partido, en orden. No depende de la IA:
// los mp3 viven en el frontend. [] si el partido ya se jugo o faltan los equipos.
async function getNarratorClips(game) {
  if (game.status === 'finished') return [];
  const facts = await getIntroFacts(game);
  if (!facts) return [];
  return buildNarratorClips(facts, {
    rng: seededRng(game.id),
    streakMin: INTRO_STREAK_MIN,
    hrMin: INTRO_HR_MIN,
  });
}

// key -> Promise<Buffer|null>; Map conserva el orden de insercion (el primero es el mas viejo).
const audioCache = new Map();

function cacheKey(gameId, text) {
  return `${gameId}:${crypto.createHash('sha1').update(text).digest('hex')}`;
}

function resetIntroAudioCache() {
  audioCache.clear();
}

// Devuelve { text, audio } (audio = Buffer mp3) o null si no hay narrador disponible.
async function getIntroAudio(game) {
  if (!TTS_INTRO_ENABLED || !isEnabled() || game.status === 'finished') return null;

  const text = await getIntroText(game);
  if (!text) return null;

  const key = cacheKey(game.id, text);
  let pending = audioCache.get(key);
  if (!pending) {
    pending = synthesizeSpeech(text);
    audioCache.set(key, pending);
    while (audioCache.size > TTS_CACHE_MAX) audioCache.delete(audioCache.keys().next().value);
  }
  const audio = await pending;
  if (!audio) {
    audioCache.delete(key); // no cachear fallos: el siguiente intento vuelve a llamar
    return null;
  }
  return { text, audio };
}

module.exports = { getIntroFacts, getIntroText, getIntroAudio, getNarratorClips, resetIntroAudioCache };
