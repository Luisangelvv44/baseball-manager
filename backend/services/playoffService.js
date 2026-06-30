const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { playGame } = require('./gamePlay');

async function generatePlayoffBracket(seasonId) {
  const existing = await prisma.playoffSeries.findFirst({ where: { season_id: seasonId } });
  if (existing) return;

  // Top 4 per division ordered by wins desc, losses asc
  const teams = await prisma.team.findMany({
    where: { division_id: { not: null } },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }],
    select: { id: true, division_id: true, wins: true, losses: true },
  });

  const divGroups = {};
  for (const team of teams) {
    const d = team.division_id;
    if (!divGroups[d]) divGroups[d] = [];
    if (divGroups[d].length < 4) divGroups[d].push(team);
  }

  let order = 0;
  for (const [, divTeams] of Object.entries(divGroups)) {
    // 1st vs 3rd — higher seed (1st) is home_team
    const s1 = await prisma.playoffSeries.create({
      data: {
        season_id: seasonId,
        round: 1,
        series_order: order++,
        home_team_id: divTeams[0].id,
        away_team_id: divTeams[2].id,
        wins_needed: 2,
      },
    });
    await createNextGame(s1);

    // 2nd vs 4th
    const s2 = await prisma.playoffSeries.create({
      data: {
        season_id: seasonId,
        round: 1,
        series_order: order++,
        home_team_id: divTeams[1].id,
        away_team_id: divTeams[3].id,
        wins_needed: 2,
      },
    });
    await createNextGame(s2);
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
      day_number: 1000 + series.round * 10 + gameNumber,
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
      home_team: { select: { id: true, name: true } },
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
  } else {
    await createNextGame(updated);
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
  const result = await playGame(nextGame, false, true);
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
  const roundSeries = allSeries.filter((s) => s.round === currentRound && s.status === 'active');

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
      const result = await playGame(nextGame, false, true);
      await updateSeriesAfterGame(nextGame, result);
      active = await prisma.playoffSeries.findUnique({ where: { id: active.id } });
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

  const nextRound = currentRound + 1;
  const winsNeeded = nextRound === 3 ? 3 : 2;

  if (nextRound === 2) {
    // Semis: pairs within each division bracket
    // Round 1 order: [divA_1v3=0, divA_2v4=1, divB_1v3=2, divB_2v4=3]
    // Round 2: winner of 0 vs winner of 1 (DivA semi), winner of 2 vs winner of 3 (DivB semi)
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
    }
  } else if (nextRound === 3) {
    // Final: DivA champ (series_order 0) vs DivB champ (series_order 1)
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
  }

  return { advanced: true, nextRound };
}

async function handleChampion(winnerId, seasonId) {
  const fandomBoost = Math.floor(Math.random() * 100_001) + 50_000;

  await prisma.team.update({
    where: { id: winnerId },
    data: { reputation: { increment: 20 }, budget: { increment: 3_000_000 }, fan_base: { increment: fandomBoost } },
  });

  if (winnerId === USER_TEAM_ID) {
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: 999,
        type: 'playoff_bonus',
        amount: 3_000_000,
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
  generatePlayoffBracket,
  getPlayoffBracket,
  simulatePlayoffGame,
  updateSeriesAfterGame,
  simulateRound,
  advancePlayoffRound,
};
