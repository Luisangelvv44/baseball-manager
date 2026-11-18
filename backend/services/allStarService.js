const prisma = require('../db/prisma');
const {
  PRE_SEASON_DAYS,
  GAMES_PER_SEASON,
  DIVISION_CONFERENCES,
  ALL_STAR_BREAK_AFTER_GAME_DAY,
  ALL_STAR_BREAK_DAYS,
  ALL_STAR_FAN_BONUS_PCT,
  ALL_STAR_WIN_FAN_BONUS_PCT,
} = require('../config');
const { FIELD_POSITIONS } = require('../seeders/generators/playerGenerator');
const { simulateGame } = require('./gameSimulator');
const { createNews } = require('./newsService');
const { FAN_RANGE_SELECT, trackFanBase } = require('./fanBaseTracker');

// Pausa del Juego de Estrellas: dos dias sin partidos entre las dos vueltas del calendario
// (dia 1 = Home Run Derby, dia 2 = Juego de Estrellas Oeste vs Este). No se persiste nada en
// Season: una temporada creada con la pausa dura ALL_STAR_BREAK_DAYS dias mas. Las temporadas
// anteriores a esta funcion (sin pausa) devuelven null y siguen como antes.

const CONFERENCES = [...new Set(Object.values(DIVISION_CONFERENCES))];

// Dia de temporada (con pre-temporada) para un dia de juego del calendario (1..GAMES_PER_SEASON)
function toSeasonDay(gameDay) {
  return gameDay + PRE_SEASON_DAYS + (gameDay > ALL_STAR_BREAK_AFTER_GAME_DAY ? ALL_STAR_BREAK_DAYS : 0);
}

function getAllStarBreak(season) {
  if (!season || season.total_days < PRE_SEASON_DAYS + GAMES_PER_SEASON + ALL_STAR_BREAK_DAYS) return null;
  const derbyDay = PRE_SEASON_DAYS + ALL_STAR_BREAK_AFTER_GAME_DAY + 1;
  return { derbyDay, allStarDay: derbyDay + 1 };
}

// Conferencia local alterna por temporada
function homeConferenceFor(seasonId) {
  return CONFERENCES[seasonId % CONFERENCES.length];
}

function playerSummary(p) {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position,
    current_skill: p.current_skill,
    team_id: p.team_id,
    team_name: p.team?.name ?? null,
  };
}

// Pura: arma la seleccion de una conferencia a partir de sus jugadores elegibles.
// El mejor pitcher abre (el simulador usa uno solo); un bateador por posicion de campo y el
// DH es el mejor bateador restante. Si falta una posicion se cubre con el mejor disponible.
function buildSquad(players) {
  const pitchers = players.filter((p) => p.position === 'P').sort((a, b) => b.current_skill - a.current_skill);
  const hitters = players.filter((p) => p.position !== 'P').sort((a, b) => b.current_skill - a.current_skill);
  if (!pitchers.length || hitters.length < FIELD_POSITIONS.length) return null;

  const used = new Set();
  const lineup = [];
  for (const pos of FIELD_POSITIONS) {
    if (pos === 'DH') continue;
    const pick = hitters.find((p) => p.position === pos && !used.has(p.id));
    if (pick) {
      used.add(pick.id);
      lineup.push({ ...playerSummary(pick), position: pos });
    }
  }
  for (const p of hitters) {
    if (lineup.length >= FIELD_POSITIONS.length) break;
    if (used.has(p.id)) continue;
    used.add(p.id);
    lineup.push({ ...playerSummary(p), position: lineup.length === FIELD_POSITIONS.length - 1 ? 'DH' : p.position });
  }
  // Orden al bate: los mejores arriba
  lineup.sort((a, b) => b.current_skill - a.current_skill);
  return { pitcher: playerSummary(pitchers[0]), players: lineup };
}

// Lectura: seleccion de cada conferencia con los jugadores sanos de las Mayores (sin cedidos)
async function selectAllStars() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true, division: { select: { name: true } } } });
  const conferenceByTeam = new Map(teams.map((t) => [t.id, DIVISION_CONFERENCES[t.division?.name]]));
  const players = await prisma.player.findMany({
    where: { level: 'MAJOR', injury_days_remaining: 0, team_id: { not: null }, on_loan_from_team_id: null },
    select: {
      id: true, first_name: true, last_name: true, position: true, current_skill: true, team_id: true,
      team: { select: { name: true } },
    },
  });
  const squads = {};
  for (const conference of CONFERENCES) {
    squads[conference] = buildSquad(players.filter((p) => conferenceByTeam.get(p.team_id) === conference));
  }
  return squads;
}

const MVP_POINTS = { '1B': 1, BB: 0.5, '2B': 2, '3B': 3, HR: 4 };

// Pura: MVP = bateador del equipo ganador con mas puntos (bases + carreras impulsadas);
// en empate (o juego empatado) se toma de ambos equipos.
function pickMvp(events, winnerConference) {
  const points = new Map();
  for (const e of events) {
    if (winnerConference && e.batting_team_id !== winnerConference) continue;
    const pts = (MVP_POINTS[e.result] || 0) + (e.runs_scored || 0);
    points.set(e.player_id, (points.get(e.player_id) || 0) + pts);
  }
  let best = null;
  for (const [id, pts] of points) {
    if (best === null || pts > best.pts) best = { id, pts };
  }
  return best?.id ?? null;
}

async function getAllStarGame(seasonId) {
  return prisma.allStarGame.findUnique({ where: { season_id: seasonId } });
}

async function addFans(teamId, amount) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { fan_base: true } });
  if (!team) return;
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { fan_base: team.fan_base + Math.round(team.fan_base * amount) },
    select: FAN_RANGE_SELECT,
  });
  await trackFanBase(updated);
}

// Juega el Juego de Estrellas de la temporada (idempotente: si ya se jugo lo devuelve)
async function playAllStarGame(season) {
  const existing = await getAllStarGame(season.id);
  if (existing) return existing;

  const squads = await selectAllStars();
  const homeConference = homeConferenceFor(season.id);
  const awayConference = CONFERENCES.find((c) => c !== homeConference);
  const home = squads[homeConference];
  const away = squads[awayConference];
  if (!home || !away) return null;

  const result = simulateGame(
    { teamId: homeConference, players: home.players },
    { teamId: awayConference, players: away.players },
    home.pitcher,
    away.pitcher
  );
  const winner = result.homeScore === result.awayScore
    ? null
    : (result.homeScore > result.awayScore ? homeConference : awayConference);
  const mvpId = pickMvp(result.events, winner);

  const game = await prisma.allStarGame.create({
    data: {
      season_id: season.id,
      day: season.current_day,
      home_conference: homeConference,
      away_conference: awayConference,
      home_score: result.homeScore,
      away_score: result.awayScore,
      final_inning: result.finalInning,
      mvp_player_id: mvpId,
      rosters: { [homeConference]: home, [awayConference]: away },
      events: result.events,
    },
  });

  // Afición: cada convocado suma fans a su equipo; los de la conferencia ganadora, un extra
  const bonusByTeam = new Map();
  for (const [conference, squad] of [[homeConference, home], [awayConference, away]]) {
    for (const p of [squad.pitcher, ...squad.players]) {
      const pct = ALL_STAR_FAN_BONUS_PCT + (conference === winner ? ALL_STAR_WIN_FAN_BONUS_PCT : 0);
      bonusByTeam.set(p.team_id, (bonusByTeam.get(p.team_id) || 0) + pct);
    }
  }
  for (const [teamId, pct] of bonusByTeam) await addFans(teamId, pct);

  const mvp = [home, away].flatMap((s) => s.players).find((p) => p.id === mvpId);
  const score = `${Math.max(result.homeScore, result.awayScore)}-${Math.min(result.homeScore, result.awayScore)}`;
  const headline = winner
    ? `La conferencia ${winner} gana el Juego de Estrellas ${score}` +
      (mvp ? `; ${mvp.first_name} ${mvp.last_name} (${mvp.team_name}) es el MVP` : '')
    : `El Juego de Estrellas termina empatado ${score} tras ${result.finalInning - 1} entradas`;
  await createNews('all_star', headline, season.current_day, season.id);

  return game;
}

module.exports = {
  CONFERENCES,
  toSeasonDay,
  getAllStarBreak,
  homeConferenceFor,
  buildSquad,
  selectAllStars,
  pickMvp,
  getAllStarGame,
  playAllStarGame,
};
