const prisma = require('../db/prisma');
const { getLineup } = require('./lineup');
const { simulateGame } = require('./gameSimulator');
const { checkAndApplyGameInjuries } = require('./injuryService');

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

  await checkAndApplyGameInjuries(homeLineup, awayLineup);

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
  }

  const homeTeam = await prisma.team.findUnique({ where: { id: gameRow.home_team_id } });
  const awayTeam = await prisma.team.findUnique({ where: { id: gameRow.away_team_id } });

  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    events: result.events,
    homeTeam,
    awayTeam,
  };
}

async function updateStandings(teamId, runsFor, runsAgainst, won) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { reputation: true, fan_base: true },
  });
  const newRep = Math.min(100, Math.max(1, team.reputation + (won ? 1 : -1)));

  // Victorias: hasta +20 000 fans; derrotas: hasta −2 000 fans. Rep amplifica/amortigua (±25%).
  const repMult = 0.75 + 0.5 * (team.reputation / 100);
  const change = won
    ? Math.round(Math.random() * 20000 * repMult)
    : -Math.round(Math.random() * 5000 / repMult);
  const newFanBase = Math.max(0, team.fan_base + change);

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

module.exports = { playGame };
