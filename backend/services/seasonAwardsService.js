const prisma = require('../db/prisma');
const { computeSeasonStats } = require('./statsService');
const { createNews } = require('./newsService');
const { payAchievementBonus } = require('./contractService');
const { SEASON_AWARD_MIN_AB, SEASON_AWARD_MIN_IP } = require('../config');

function battingScore(b) {
  return b.hr * 2 + b.h + b.rbi;
}

// Racha de victorias mas larga (no la mas reciente) de un equipo dentro de una lista
// de partidos ya ordenados por dia ascendente.
function longestWinStreak(gamesAsc, teamId) {
  let best = 0;
  let current = 0;
  for (const g of gamesAsc) {
    const isHome = g.home_team_id === teamId;
    const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score;
    if (won) {
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
    }
  }
  return best;
}

// Bateadores/lanzadores calificados, ordenados con el mismo criterio que MVP / Cy Young.
function qualifyStats(stats, minAB, minIP) {
  const qualifiedBatters = stats
    .filter((p) => p.batting.ab >= minAB)
    .sort((a, b) => battingScore(b.batting) - battingScore(a.batting));

  const qualifiedPitchers = stats
    .filter((p) => p.pitching && p.pitching.ip >= minIP)
    .sort((a, b) => (a.pitching.era - b.pitching.era) || (b.pitching.w - a.pitching.w) || (b.pitching.so - a.pitching.so));

  return { qualifiedBatters, qualifiedPitchers };
}

// Rookies calificados ordenados por percentil dentro de su categoria (mayor primero; en empate,
// el bateador va antes). El primero es el Novato del Año.
function rankRookies(qualifiedBatters, qualifiedPitchers) {
  const percentile = (list, idx) => (list.length - idx) / list.length;
  const candidates = [
    ...qualifiedBatters.map((p, i) => ({ player: p, kind: 'batter', percentile: percentile(qualifiedBatters, i) })),
    ...qualifiedPitchers.map((p, i) => ({ player: p, kind: 'pitcher', percentile: percentile(qualifiedPitchers, i) })),
  ].filter((c) => c.player.rookie_contract);
  candidates.sort((a, b) => b.percentile - a.percentile);
  // Un pitcher que tambien califica como bateador cuenta una sola vez (su mejor categoria)
  const seen = new Set();
  return candidates.filter((c) => !seen.has(c.player.player_id) && seen.add(c.player.player_id));
}

async function computeSeasonAwards(season) {
  const { stats } = await computeSeasonStats(season.id);
  if (stats.length === 0) return [];

  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? 'Agente libre';

  const { qualifiedBatters, qualifiedPitchers } = qualifyStats(stats, SEASON_AWARD_MIN_AB, SEASON_AWARD_MIN_IP);

  const awards = [];
  const pushAward = (category, player, value) => {
    awards.push({
      season_id: season.id,
      category,
      player_id: player?.player_id ?? null,
      team_id: player?.team_id ?? null,
      value,
    });
  };

  // MVP: mejor bateador calificado, mismo criterio de peso que el ranking historico (history.js)
  if (qualifiedBatters.length > 0) {
    const mvp = qualifiedBatters[0];
    pushAward('MVP', mvp, battingScore(mvp.batting));
  }

  // Cy Young: menor ERA entre pitchers calificados
  if (qualifiedPitchers.length > 0) {
    const cyYoung = qualifiedPitchers[0];
    pushAward('CY_YOUNG', cyYoung, cyYoung.pitching.era);
  }

  // Novato del Año: mejor rookie relativo a su propia categoria (percentil dentro de bateadores/lanzadores calificados)
  const [roy] = rankRookies(qualifiedBatters, qualifiedPitchers);
  if (roy) pushAward('ROOKIE_OF_YEAR', roy.player, roy.kind === 'batter' ? battingScore(roy.player.batting) : roy.player.pitching.era);

  // Record de HR en una temporada (sin minimo de AB: es un conteo, no un promedio)
  const hrLeader = [...stats].filter((p) => p.batting.hr > 0).sort((a, b) => b.batting.hr - a.batting.hr)[0];
  if (hrLeader) pushAward('SEASON_HR_RECORD', hrLeader, hrLeader.batting.hr);

  // Record de ERA en una temporada (con el mismo minimo de calificacion que el Cy Young)
  if (qualifiedPitchers.length > 0) {
    const eraLeader = qualifiedPitchers[0];
    pushAward('SEASON_ERA_RECORD', eraLeader, eraLeader.pitching.era);
  }

  // Record de racha de victorias: logro de equipo, sin jugador asociado
  const games = await prisma.gameSchedule.findMany({
    where: { season_id: season.id, status: 'finished' },
    select: { day_number: true, home_team_id: true, away_team_id: true, home_score: true, away_score: true },
    orderBy: { day_number: 'asc' },
  });
  let bestStreak = { teamId: null, length: 0 };
  for (const team of teams) {
    const length = longestWinStreak(games, team.id);
    if (length > bestStreak.length) bestStreak = { teamId: team.id, length };
  }
  if (bestStreak.teamId && bestStreak.length > 0) {
    awards.push({
      season_id: season.id,
      category: 'SEASON_WIN_STREAK_RECORD',
      player_id: null,
      team_id: bestStreak.teamId,
      value: bestStreak.length,
    });
  }

  await prisma.seasonAward.createMany({ data: awards });

  const headlines = {
    MVP: (a) => `${nameOf(stats, a.player_id)} (${teamName(a.team_id)}) es el MVP de la temporada`,
    CY_YOUNG: (a) => `${nameOf(stats, a.player_id)} (${teamName(a.team_id)}) gana el premio al Mejor Lanzador`,
    ROOKIE_OF_YEAR: (a) => `${nameOf(stats, a.player_id)} (${teamName(a.team_id)}) es el Novato del Año`,
    SEASON_HR_RECORD: (a) => `${nameOf(stats, a.player_id)} (${teamName(a.team_id)}) lideró la temporada con ${a.value} jonrones`,
    SEASON_ERA_RECORD: (a) => `${nameOf(stats, a.player_id)} (${teamName(a.team_id)}) cerró la temporada con la mejor efectividad: ${a.value.toFixed(2)}`,
    SEASON_WIN_STREAK_RECORD: (a) => `${teamName(a.team_id)} tuvo la racha de victorias más larga de la temporada: ${a.value} juegos`,
  };
  for (const award of awards) {
    const headline = headlines[award.category]?.(award);
    if (headline) await createNews('awards', headline, season.current_day, season.id);
    if (award.player_id != null) {
      await payAchievementBonus(prisma, { playerId: award.player_id, type: 'award', seasonDay: season.current_day });
    }
  }

  return awards;
}

function nameOf(stats, playerId) {
  const p = stats.find((s) => s.player_id === playerId);
  return p ? `${p.first_name} ${p.last_name}` : 'Jugador desconocido';
}

module.exports = { computeSeasonAwards, battingScore, qualifyStats, rankRookies };
