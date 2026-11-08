const prisma = require('../db/prisma');
const { USER_TEAM_ID, REPUTATION_MISSED_PLAYOFFS_PENALTY, PLAYOFF_TEAMS_PER_DIVISION, PLAYOFF_GROUP_ADVANCE } = require('../config');
const { playGame, applyRandomFanChange } = require('./gamePlay');
const { FAN_RANGE_SELECT, trackFanBase } = require('./fanBaseTracker');
const { clampReputation } = require('./reputationService');

const FAN_MIN_PLAYOFF = 2000;
const FAN_MAX_PLAYOFF = 20000;

// Mini liguilla previa a cuartos: los 3 clasificados de cada division juegan estos 6 partidos, en este
// orden. [local, visitante] como posicion de la temporada regular (1 = primero de la division).
// Cada partido es una PlayoffSeries de round 0 a un juego; solo uno por division esta 'active' a la vez.
const GROUP_ROUND = 0;
const GROUP_GAME_ORDER = [[3, 2], [3, 1], [2, 3], [2, 1], [1, 2], [1, 3]];

// Bono de reputacion + fan_base por avanzar de ronda en playoffs.
// fanPct se calcula sobre el fan_base actual del equipo (snapshot al momento del avance).
// Se aplica igual a CPU y usuario.
async function applyPlayoffBonus(teamId, fanPct, repPoints) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { fan_base: true, reputation: true } });
  const fanBoost = Math.round(team.fan_base * fanPct);
  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { reputation: clampReputation(team.reputation + repPoints), fan_base: { increment: fanBoost } },
    select: FAN_RANGE_SELECT,
  });
  await trackFanBase(updated);
}

// Top N por division (wins desc, losses asc, id como desempate estable). Lo usan el bracket y
// el mercado de playoffs, que se abre antes con la clasificacion ya cerrada.
function groupQualifiedByDivision(teams) {
  const divGroups = {};
  for (const team of teams) {
    const d = team.division_id;
    if (!divGroups[d]) divGroups[d] = [];
    if (divGroups[d].length < PLAYOFF_TEAMS_PER_DIVISION) divGroups[d].push(team);
  }
  return divGroups;
}

const STANDINGS_ORDER = [{ wins: 'desc' }, { losses: 'asc' }, { id: 'asc' }];

async function getQualifiedTeamIds() {
  const teams = await prisma.team.findMany({
    where: { division_id: { not: null } },
    orderBy: STANDINGS_ORDER,
    select: { id: true, division_id: true },
  });
  return Object.values(groupQualifiedByDivision(teams)).flat().map((t) => t.id);
}

async function generatePlayoffBracket(seasonId) {
  const existing = await prisma.playoffSeries.findFirst({ where: { season_id: seasonId } });
  if (existing) return;

  // Top N per division ordered by wins desc, losses asc
  const teams = await prisma.team.findMany({
    where: { division_id: { not: null } },
    orderBy: STANDINGS_ORDER,
    select: { id: true, division_id: true, wins: true, losses: true, desperation_index: true, fan_base: true, reputation: true },
  });

  const divGroups = groupQualifiedByDivision(teams);

  // Indice de desesperacion: se acumula temporada a temporada segun clasificacion a playoffs.
  // Quedar fuera de los clasificados de la division sube el indice; clasificar lo baja. Clamped [0, 2].
  const qualifiedIds = new Set();
  for (const list of Object.values(divGroups)) {
    for (const t of list) qualifiedIds.add(t.id);
  }
  await Promise.all(teams.map((t) => {
    const delta = qualifiedIds.has(t.id) ? -0.1 : 0.2;
    const next = Math.round(Math.max(0, Math.min(2, t.desperation_index + delta)) * 100) / 100;
    const data = { desperation_index: next };
    if (qualifiedIds.has(t.id)) {
      // Bono por clasificar a playoffs: +10% fans, +5 reputacion
      data.reputation = clampReputation(t.reputation + 5);
      data.fan_base = { increment: Math.round(t.fan_base * 0.10) };
    } else {
      // Quedar fuera de playoffs es lo unico que resta reputacion
      data.reputation = clampReputation(t.reputation - REPUTATION_MISSED_PLAYOFFS_PENALTY);
    }
    return prisma.team.update({ where: { id: t.id }, data, select: FAN_RANGE_SELECT }).then(trackFanBase);
  }));

  // Las divisiones van por id ascendente (orden de creacion: NO, SO, NE, SE); de eso dependen los cruces.
  let divisionIndex = 0;
  for (const divTeams of Object.values(divGroups)) {
    for (let g = 0; g < GROUP_GAME_ORDER.length; g++) {
      const [homeSeed, awaySeed] = GROUP_GAME_ORDER[g];
      const series = await prisma.playoffSeries.create({
        data: {
          season_id: seasonId,
          round: GROUP_ROUND,
          series_order: divisionIndex * GROUP_GAME_ORDER.length + g,
          home_team_id: divTeams[homeSeed - 1].id,
          away_team_id: divTeams[awaySeed - 1].id,
          wins_needed: 1,
          status: g === 0 ? 'active' : 'pending',
        },
      });
      if (g === 0) await createNextGame(series);
    }
    divisionIndex++;
  }
}

async function createNextGame(series) {
  const gameNumber = series.home_wins + series.away_wins + 1;
  // Odd games at home_team venue, even games at away_team venue
  const homeId = gameNumber % 2 === 1 ? series.home_team_id : series.away_team_id;
  const awayId = gameNumber % 2 === 1 ? series.away_team_id : series.home_team_id;

  await prisma.gameSchedule.create({
    data: {
      season_id: series.season_id,
      // en la liguilla cada partido es una serie: el dia sale de su orden (1001-1006)
      day_number: 1000 + series.round * 10 + gameNumber + (series.round === GROUP_ROUND ? series.series_order % GROUP_GAME_ORDER.length : 0),
      home_team_id: homeId,
      away_team_id: awayId,
      status: 'scheduled',
      is_user_game: homeId === USER_TEAM_ID || awayId === USER_TEAM_ID,
      playoff_series_id: series.id,
    },
  });
}

async function getPlayoffBracket(seasonId) {
  return prisma.playoffSeries.findMany({
    where: { season_id: seasonId },
    include: {
      home_team: { select: { id: true, name: true, division: { select: { name: true } } } },
      away_team: { select: { id: true, name: true } },
      winner:    { select: { id: true, name: true } },
      games: {
        include: {
          home_team: { select: { id: true, name: true } },
          away_team: { select: { id: true, name: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
    orderBy: [{ round: 'asc' }, { series_order: 'asc' }],
  });
}

// Called after any playoff game finishes (from routes/games simulate and from simulatePlayoffGame)
async function updateSeriesAfterGame(game, result) {
  const series = await prisma.playoffSeries.findUnique({ where: { id: game.playoff_series_id } });
  if (!series || series.status === 'completed') return;

  const homeWon = result.homeScore > result.awayScore;
  // Determine if the series home_team won this individual game
  const seriesHomeWon = game.home_team_id === series.home_team_id ? homeWon : !homeWon;

  // Flujo de fans simétrico y aleatorio para ambos participantes (usuario y CPU por igual)
  await applyRandomFanChange(game.home_team_id, homeWon, FAN_MIN_PLAYOFF, FAN_MAX_PLAYOFF);
  await applyRandomFanChange(game.away_team_id, !homeWon, FAN_MIN_PLAYOFF, FAN_MAX_PLAYOFF);

  const updated = await prisma.playoffSeries.update({
    where: { id: series.id },
    data: seriesHomeWon
      ? { home_wins: { increment: 1 } }
      : { away_wins: { increment: 1 } },
  });

  if (updated.home_wins >= updated.wins_needed || updated.away_wins >= updated.wins_needed) {
    const winnerId =
      updated.home_wins >= updated.wins_needed ? updated.home_team_id : updated.away_team_id;
    await prisma.playoffSeries.update({
      where: { id: series.id },
      data: { status: 'completed', winner_id: winnerId },
    });
    if (series.round === GROUP_ROUND) await startNextGroupGame(series);
  } else {
    await createNextGame(updated);
  }
}

// Al terminar un partido de la liguilla se activa el siguiente de esa misma division.
async function startNextGroupGame(series) {
  const nextOrder = series.series_order + 1;
  if (nextOrder % GROUP_GAME_ORDER.length === 0) return;
  const next = await prisma.playoffSeries.findFirst({
    where: { season_id: series.season_id, round: GROUP_ROUND, series_order: nextOrder },
  });
  if (!next) return;
  const activated = await prisma.playoffSeries.update({ where: { id: next.id }, data: { status: 'active' } });
  await createNextGame(activated);
}

// Tabla de cada liguilla a partir de las series del bracket (con sus juegos). Desempates: diferencia
// de carreras y luego la posicion de la temporada regular.
function buildGroupStandings(series) {
  const groups = new Map();
  for (const s of series.filter((x) => x.round === GROUP_ROUND).sort((a, b) => a.series_order - b.series_order)) {
    const index = Math.floor(s.series_order / GROUP_GAME_ORDER.length);
    if (!groups.has(index)) {
      groups.set(index, { index, division: s.home_team?.division?.name ?? null, teams: new Map(), series: [] });
    }
    const group = groups.get(index);
    group.series.push(s);

    const [homeSeed, awaySeed] = GROUP_GAME_ORDER[s.series_order % GROUP_GAME_ORDER.length];
    const row = (teamId, seed, name) => {
      if (!group.teams.has(teamId)) group.teams.set(teamId, { team_id: teamId, name, seed, wins: 0, losses: 0, run_diff: 0 });
      return group.teams.get(teamId);
    };
    const home = row(s.home_team_id, homeSeed, s.home_team?.name);
    const away = row(s.away_team_id, awaySeed, s.away_team?.name);

    if (s.status !== 'completed') continue;
    const homeWon = s.winner_id === s.home_team_id;
    (homeWon ? home : away).wins += 1;
    (homeWon ? away : home).losses += 1;
    const game = s.games?.find((g) => g.status === 'finished');
    if (game) {
      const diff = game.home_score - game.away_score;
      home.run_diff += diff;
      away.run_diff -= diff;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.index - b.index)
    .map((g) => ({
      ...g,
      teams: [...g.teams.values()].sort((a, b) => b.wins - a.wins || b.run_diff - a.run_diff || a.seed - b.seed),
    }));
}

// Cuartos: cruces entre las dos divisiones de cada conferencia (1o de una contra 2o de la otra). Las
// series quedan en pares por conferencia, asi que semis y final se arman igual: la final es Oeste-Este.
async function createQuarterFinals(seasonId) {
  const groups = buildGroupStandings(await getPlayoffBracket(seasonId));
  let order = 0;
  for (let i = 0; i < groups.length; i += 2) {
    const a = groups[i].teams.slice(0, PLAYOFF_GROUP_ADVANCE);
    const b = groups[i + 1].teams.slice(0, PLAYOFF_GROUP_ADVANCE);
    for (const [high, low] of [[a[0], b[1]], [b[0], a[1]]]) {
      const s = await prisma.playoffSeries.create({
        data: {
          season_id: seasonId,
          round: 1,
          series_order: order++,
          home_team_id: high.team_id,
          away_team_id: low.team_id,
          wins_needed: 2,
        },
      });
      await createNextGame(s);
    }
  }
}

// Simulate next pending game in a CPU series
async function simulatePlayoffGame(seriesId) {
  const series = await prisma.playoffSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.status === 'completed') {
    throw new Error('Esta serie ya terminó');
  }

  const nextGame = await prisma.gameSchedule.findFirst({
    where: { playoff_series_id: seriesId, status: 'scheduled' },
    orderBy: { id: 'asc' },
  });
  if (!nextGame) throw new Error('No hay partidos pendientes en esta serie');

  // skipStandings = true for playoff games
  const result = await playGame(nextGame, true, true);
  await updateSeriesAfterGame(nextGame, result);
  return result;
}

// Simulate all CPU-vs-CPU series in the current round completely
async function simulateRound(seasonId) {
  const allSeries = await prisma.playoffSeries.findMany({
    where: { season_id: seasonId },
    orderBy: [{ round: 'asc' }, { series_order: 'asc' }],
  });
  if (!allSeries.length) return;

  const currentRound = Math.max(...allSeries.map((s) => s.round));

  // La liguilla activa un partido a la vez: se repite mientras terminar uno active otro de la CPU.
  let played = true;
  while (played) {
    played = false;
    const roundSeries = await prisma.playoffSeries.findMany({
      where: { season_id: seasonId, round: currentRound, status: 'active' },
      orderBy: { series_order: 'asc' },
    });
    for (const series of roundSeries) {
      if (series.home_team_id === USER_TEAM_ID || series.away_team_id === USER_TEAM_ID) continue;
      // Simulate until series ends
      let active = series;
      while (active.status === 'active') {
        const nextGame = await prisma.gameSchedule.findFirst({
          where: { playoff_series_id: active.id, status: 'scheduled' },
          orderBy: { id: 'asc' },
        });
        if (!nextGame) break;
        const result = await playGame(nextGame, true, true);
        await updateSeriesAfterGame(nextGame, result);
        played = true;
        active = await prisma.playoffSeries.findUnique({ where: { id: active.id } });
      }
    }
  }
}

// Check if current round is done and advance (create next round or crown champion)
async function advancePlayoffRound(seasonId) {
  const allSeries = await prisma.playoffSeries.findMany({
    where: { season_id: seasonId },
    orderBy: [{ round: 'asc' }, { series_order: 'asc' }],
  });
  if (!allSeries.length) return { error: 'No hay bracket' };

  const currentRound = Math.max(...allSeries.map((s) => s.round));
  const currentRoundSeries = allSeries.filter((s) => s.round === currentRound);
  const allComplete = currentRoundSeries.every((s) => s.status === 'completed');

  if (!allComplete) return { advanced: false, message: 'Hay series sin terminar en la ronda actual' };

  if (currentRound === 3) {
    // Final is done — crown champion
    const champion = currentRoundSeries[0];
    await handleChampion(champion.winner_id, seasonId);
    return { advanced: true, champion: true, winnerId: champion.winner_id };
  }

  if (currentRound === GROUP_ROUND) {
    await createQuarterFinals(seasonId);
    return { advanced: true, nextRound: 1 };
  }

  const nextRound = currentRound + 1;
  const winsNeeded = nextRound === 3 ? 3 : 2;

  if (nextRound === 2) {
    // Semis: una por conferencia. Cuartos 0-1 = Oeste, 2-3 = Este.
    for (let i = 0; i < currentRoundSeries.length; i += 2) {
      const w1 = currentRoundSeries[i].winner_id;
      const w2 = currentRoundSeries[i + 1].winner_id;
      const s = await prisma.playoffSeries.create({
        data: {
          season_id: seasonId,
          round: nextRound,
          series_order: i / 2,
          home_team_id: w1,
          away_team_id: w2,
          wins_needed: winsNeeded,
        },
      });
      await createNextGame(s);
      // Bono por avanzar a semifinales: +8% fans, +10 reputacion
      await applyPlayoffBonus(w1, 0.08, 10);
      await applyPlayoffBonus(w2, 0.08, 10);
    }
  } else if (nextRound === 3) {
    // Final: campeon del Oeste (series_order 0) vs campeon del Este (series_order 1)
    const divAChamp = currentRoundSeries[0].winner_id;
    const divBChamp = currentRoundSeries[1].winner_id;
    const s = await prisma.playoffSeries.create({
      data: {
        season_id: seasonId,
        round: 3,
        series_order: 0,
        home_team_id: divAChamp,
        away_team_id: divBChamp,
        wins_needed: 3,
      },
    });
    await createNextGame(s);
    // Bono por avanzar a la final: +5% fans, +15 reputacion
    await applyPlayoffBonus(divAChamp, 0.05, 15);
    await applyPlayoffBonus(divBChamp, 0.05, 15);
  }

  return { advanced: true, nextRound };
}

async function handleChampion(winnerId, seasonId) {
  const team = await prisma.team.findUnique({ where: { id: winnerId }, select: { fan_base: true, reputation: true } });
  // Bono por ganar la final: +10% fans, +20 reputacion
  const fandomBoost = Math.round(team.fan_base * 0.10);
  const championshipPrize = team.fan_base * 50;

  const updated = await prisma.team.update({
    where: { id: winnerId },
    data: { reputation: clampReputation(team.reputation + 20), budget: { increment: championshipPrize }, fan_base: { increment: fandomBoost } },
    select: FAN_RANGE_SELECT,
  });
  await trackFanBase(updated);

  if (winnerId === USER_TEAM_ID) {
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: 999,
        type: 'playoff_bonus',
        amount: championshipPrize,
        description: '¡Premio de campeón de playoffs!',
      },
    });
  }

  await prisma.season.update({
    where: { id: seasonId },
    data: { status: 'finished' },
  });
}

module.exports = {
  getQualifiedTeamIds,
  generatePlayoffBracket,
  getPlayoffBracket,
  buildGroupStandings,
  simulatePlayoffGame,
  updateSeriesAfterGame,
  simulateRound,
  advancePlayoffRound,
};
