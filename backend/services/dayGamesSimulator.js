const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { playGame } = require('./gamePlay');
const { updateSeriesAfterGame } = require('./playoffService');

// Simula todos los partidos de temporada regular todavia 'scheduled' de una jornada.
// El partido del usuario ya deberia estar 'finished' antes de llamar aqui, por lo que
// no se re-simula. Devuelve { simulated }.
async function simulateScheduledGamesForDay(seasonId, dayNumber) {
  const games = await prisma.gameSchedule.findMany({
    where: { season_id: seasonId, day_number: dayNumber, status: 'scheduled' },
  });

  let simulated = 0;
  for (const g of games) {
    try {
      await playGame(g, true);
      simulated++;
    } catch (err) {
      if (err.code === 'ROSTER_INCOMPLETO') {
        await prisma.gameSchedule.update({
          where: { id: g.id },
          data: { home_score: 0, away_score: 0, status: 'finished' },
        });
      } else {
        throw err;
      }
    }
  }
  return { simulated };
}

// Simula el siguiente partido pendiente de cada serie de playoffs CPU activa
// (salta las series donde juega el equipo del usuario). Devuelve { simulated }.
async function simulateOtherActivePlayoffSeries(seasonId) {
  const activeSeries = await prisma.playoffSeries.findMany({
    where: { season_id: seasonId, status: 'active' },
    include: { games: { where: { status: 'scheduled' }, orderBy: { id: 'asc' }, take: 1 } },
  });

  let simulated = 0;
  for (const s of activeSeries) {
    if (s.home_team_id === USER_TEAM_ID || s.away_team_id === USER_TEAM_ID) continue;
    const nextGameRef = s.games[0];
    if (!nextGameRef) continue;
    const nextGame = await prisma.gameSchedule.findUnique({ where: { id: nextGameRef.id } });
    try {
      const result = await playGame(nextGame, true, true);
      await updateSeriesAfterGame(nextGame, result);
      simulated++;
    } catch (err) {
      if (err.code === 'ROSTER_INCOMPLETO') {
        await prisma.gameSchedule.update({
          where: { id: nextGame.id },
          data: { home_score: 9, away_score: 0, status: 'finished' },
        });
        await updateSeriesAfterGame(nextGame, { homeScore: 9, awayScore: 0 });
        simulated++;
      } else {
        throw err;
      }
    }
  }
  return { simulated };
}

module.exports = { simulateScheduledGamesForDay, simulateOtherActivePlayoffSeries };
