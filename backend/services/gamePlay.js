const prisma = require('../db/prisma');
const { getLineup } = require('./lineup');
const { simulateGame } = require('./gameSimulator');
const { checkAndApplyGameInjuries } = require('./injuryService');
const { createNews } = require('./newsService');

// Simula un partido (schedule row), actualiza marcador/standings,
// y opcionalmente guarda el play-by-play en game_events.
// Devuelve { homeScore, awayScore, events, homeTeam, awayTeam }
async function playGame(gameRow, saveEvents = false, skipStandings = false) {
  const homeLineup = await getLineup(gameRow.home_team_id, gameRow);
  const awayLineup = await getLineup(gameRow.away_team_id, gameRow);

  if (!homeLineup || !awayLineup) {
    const err = new Error('ROSTER_INCOMPLETO');
    err.code = 'ROSTER_INCOMPLETO';
    throw err;
  }

  const result = simulateGame(homeLineup, awayLineup, homeLineup.pitcher, awayLineup.pitcher);

  const injuredIds = await checkAndApplyGameInjuries(homeLineup, awayLineup);

  await prisma.gameSchedule.update({
    where: { id: gameRow.id },
    data: { home_score: result.homeScore, away_score: result.awayScore, status: 'finished' },
  });

  if (!skipStandings) {
    const homeWon = result.homeScore > result.awayScore;
    await updateStandings(gameRow.home_team_id, result.homeScore, result.awayScore, homeWon);
    await updateStandings(gameRow.away_team_id, result.awayScore, result.homeScore, !homeWon);
  }

  if (saveEvents) {
    await prisma.gameEvent.createMany({
      data: result.events.map((ev) => ({
        game_id: gameRow.id,
        inning: ev.inning,
        half: ev.half,
        batting_team_id: ev.batting_team_id,
        player_id: ev.player_id,
        result: ev.result,
        outs_after: ev.outs_after,
        runs_scored: ev.runs_scored,
        event_order: ev.event_order,
      })),
    });
    await prisma.gameLineup.createMany({
      data: [
        { game_id: gameRow.id, player_id: homeLineup.pitcher.id, team_id: homeLineup.teamId, position: 'P' },
        { game_id: gameRow.id, player_id: awayLineup.pitcher.id, team_id: awayLineup.teamId, position: 'P' },
      ],
    });
  }

  const homeTeam = await prisma.team.findUnique({ where: { id: gameRow.home_team_id } });
  const awayTeam = await prisma.team.findUnique({ where: { id: gameRow.away_team_id } });

  const winner = result.homeScore > result.awayScore ? homeTeam.name : awayTeam.name;
  const loser  = result.homeScore > result.awayScore ? awayTeam.name : homeTeam.name;
  const hi = Math.max(result.homeScore, result.awayScore);
  const lo = Math.min(result.homeScore, result.awayScore);
  await createNews('game', `${winner} derrotó a ${loser} ${hi}-${lo}`, gameRow.day_number, gameRow.season_id);

  if (injuredIds.length > 0) {
    const injuredPlayers = await prisma.player.findMany({
      where: { id: { in: injuredIds.map((i) => i.id) } },
      select: { id: true, first_name: true, last_name: true, position: true },
    });
    const nameMap = Object.fromEntries(injuredPlayers.map((p) => [p.id, p]));
    for (const { id, days } of injuredIds) {
      const p = nameMap[id];
      if (p) await createNews('injury',
        `${p.first_name} ${p.last_name} (${p.position}) se lesionó por ${days} días`,
        gameRow.day_number,
        gameRow.season_id
      );
    }
  }

  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    events: result.events,
    homeTeam,
    awayTeam,
  };
}

const FAN_MIN_REGULAR = 1000;
const FAN_MAX_REGULAR = 10000;

function randomFanMagnitude(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

async function applyRandomFanChange(teamId, won, min, max) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { fan_base: true } });
  const magnitude = randomFanMagnitude(min, max);
  const newFanBase = Math.max(10000, team.fan_base + (won ? magnitude : -magnitude));
  await prisma.team.update({ where: { id: teamId }, data: { fan_base: newFanBase } });
}

async function updateStandings(teamId, runsFor, runsAgainst, won) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { reputation: true, fan_base: true },
  });
  const newRep = Math.min(100, Math.max(1, team.reputation + (won ? 1 : -1)));

  // Ganar o perder mueve la fanaticada un monto aleatorio simétrico entre 1 000 y 10 000.
  const change = won
    ? randomFanMagnitude(FAN_MIN_REGULAR, FAN_MAX_REGULAR)
    : -randomFanMagnitude(FAN_MIN_REGULAR, FAN_MAX_REGULAR);
  const newFanBase = Math.max(10000, team.fan_base + change);

  await prisma.team.update({
    where: { id: teamId },
    data: {
      wins: { increment: won ? 1 : 0 },
      losses: { increment: won ? 0 : 1 },
      runs_scored: { increment: runsFor },
      runs_allowed: { increment: runsAgainst },
      reputation: newRep,
      fan_base: newFanBase,
    },
  });
}

module.exports = { playGame, randomFanMagnitude, applyRandomFanChange };
