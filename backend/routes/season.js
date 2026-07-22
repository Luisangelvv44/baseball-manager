const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, PRE_SEASON_DAYS, MAX_ROSTER_SIZE, TRADE_DEADLINE_DAY } = require('../config');
const { generateSchedule } = require('../services/scheduleGenerator');
const { playGame } = require('../services/gamePlay');
const {
  createAuctionsForFreeAgents,
  runCpuBidding,
  closeExpiredAuctions,
  cancelAllActiveAuctions,
} = require('../services/auctionService');
const {
  generateOffersForSeason,
  processCpuTeamResponses,
  finalizeContracts,
  payBroadcastRevenue,
  decrementContractSeasons,
  OFFER_WINDOW_END_DAY,
} = require('../services/broadcastService');
const { calculateSalary, generatePlayer } = require('../seeders/generators/playerGenerator');
const { generatePlayoffBracket, updateSeriesAfterGame, advancePlayoffRound } = require('../services/playoffService');
const { retireOldPlayers } = require('../services/retiredPlayer');
const { fluctuatePlayerSkills, updatePlayersContracts } = require('../services/playerService');
const { giveCpuTeamsRevenue } = require('../services/cpuTeamManagement');
const { applyCoachBonuses, deductCoachSalaries } = require('../services/coachService');
const { createDraft } = require('../services/draftService');
const { processInjuryRecovery, clearAllInjuries } = require('../services/injuryService');
const { generateCpuTradeOffers, expireStaleTrades } = require('../services/tradeService');

// GET /api/season -> temporada activa (o null si no se ha iniciado)
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs', 'draft', 'completed'] } },
      orderBy: { id: 'desc' },
    });
    res.json(season ? { ...season, preSeasonDays: PRE_SEASON_DAYS } : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener temporada' });
  }
});

// POST /api/season/start -> genera el calendario (round-robin simple) y crea la temporada
router.post('/start', async (req, res) => {
  try {
    const existing = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs'] } },
    });
    if (existing) {
      return res.status(400).json({ error: 'Ya hay una temporada activa o playoffs en curso' });
    }

    const teams = await prisma.team.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, division_id: true },
    });

    const games = generateSchedule(teams);
    const totalDays = Math.max(...games.map((g) => g.day_number));

    const season = await prisma.season.create({
      data: { year: new Date().getFullYear(), current_day: 1, total_days: totalDays + PRE_SEASON_DAYS, status: 'active' },
    });

    await prisma.gameSchedule.createMany({
      data: games.map((g) => ({
        season_id: season.id,
        day_number: g.day_number + PRE_SEASON_DAYS,
        home_team_id: g.home_team_id,
        away_team_id: g.away_team_id,
        status: 'scheduled',
        is_user_game: g.home_team_id === USER_TEAM_ID || g.away_team_id === USER_TEAM_ID,
      })),
    });

    // Cobrar salarios de la temporada completa al inicio
    const rosterPlayers = await prisma.player.findMany({
      where: { team_id: USER_TEAM_ID },
      select: { salary: true },
    });
    const totalSeasonSalary = Math.round(
      rosterPlayers.reduce((sum, p) => sum + Number(p.salary), 0)
    );

    if (totalSeasonSalary > 0) {
      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { decrement: totalSeasonSalary } },
      });
      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: 1,
          type: 'salaries',
          amount: -totalSeasonSalary,
          description: `Salarios de la temporada ${new Date().getFullYear()}`,
        },
      });
    }

    // Cobrar salarios de temporada a equipos CPU
    const cpuTeams = await prisma.team.findMany({
      where: { is_user_team: false },
      select: { id: true },
    });
    for (const cpuTeam of cpuTeams) {
      const cpuPlayers = await prisma.player.findMany({
        where: { team_id: cpuTeam.id },
        select: { salary: true },
      });
      const cpuSalary = Math.round(cpuPlayers.reduce((s, p) => s + Number(p.salary), 0));
      if (cpuSalary > 0) {
        await prisma.team.update({
          where: { id: cpuTeam.id },
          data: { budget: { decrement: cpuSalary } },
        });
      }
    }

    // Cobrar salarios de coaches al inicio de temporada
    await deductCoachSalaries(1);

    const auctionsCreated = await createAuctionsForFreeAgents(null, season);

    // Pagar contratos de transmisión vigentes (temporadas siguientes del contrato)
    await payBroadcastRevenue(season);

    // Generar nuevas ofertas de transmisoras y respuesta automática de equipos CPU
    await generateOffersForSeason(season);
    await processCpuTeamResponses(season);

    res.json({ success: true, season, totalGames: games.length, totalDays, totalSeasonSalary, auctionsCreated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar la temporada' });
  }
});

// All end-of-season mutations — runs only after the playoff champion is crowned
async function endOfSeasonCleanup(season) {
  // Save season record before standings are reset
  const allTeams = await prisma.team.findMany({
    select: { id: true, name: true, wins: true, losses: true, division: { select: { name: true } } },
    orderBy: [{ wins: 'desc' }, { losses: 'asc' }],
  });
  const finalSeries = await prisma.playoffSeries.findFirst({
    where: { season_id: season.id, winner_id: { not: null } },
    orderBy: { round: 'desc' },
    include: { winner: { select: { name: true } } },
  });
  await prisma.seasonRecord.create({
    data: {
      season_id: season.id,
      year: season.year,
      champion_name: finalSeries?.winner?.name ?? null,
      standings: allTeams.map((t) => ({
        team_id: t.id,
        name: t.name,
        division: t.division?.name ?? null,
        wins: t.wins,
        losses: t.losses,
      })),
    },
  });

  await updatePlayersContracts();

  // Incrementa el contador de temporadas para todo rookie vigente (equipo, agente libre o prospecto de scout)
  await prisma.player.updateMany({
    where: { rookie_contract: true, status: { in: ['active', 'free_agent', 'scouted'] } },
    data: { rookie_seasons: { increment: 1 } },
  });

  // Gradúa a los que acumulan 3+ temporadas como rookie: precio real = salario actual x 10
  const graduatingRookies = await prisma.player.findMany({
    where: { rookie_contract: true, rookie_seasons: { gte: 3 }, status: { in: ['active', 'free_agent', 'scouted'] } },
    select: { id: true, salary: true },
  });
  for (const p of graduatingRookies) {
    await prisma.player.update({
      where: { id: p.id },
      data: { salary: Math.round(Number(p.salary) * 10), rookie_contract: false },
    });
  }

  const expiringPlayers = await prisma.player.findMany({
    where: { status: 'active', contract_years_remaining: { lte: 0 } },
    select: { id: true },
  });
  if (expiringPlayers.length > 0) {
    await prisma.teamLineup.deleteMany({ where: { player_id: { in: expiringPlayers.map((p) => p.id) } } });
  }
  const expired = await prisma.player.updateMany({
    where: { status: 'active', contract_years_remaining: { lte: 0 } },
    data: { status: 'free_agent', team_id: null },
  });

  await prisma.team.updateMany({ data: { wins: 0, losses: 0, runs_scored: 0, runs_allowed: 0 } });
  await prisma.player.updateMany({ data: { age: { increment: 1 } } });
  await retireOldPlayers();
  await fluctuatePlayerSkills();
  await applyCoachBonuses();
  await giveCpuTeamsRevenue();

  const CPU_TARGET_ROSTER = MAX_ROSTER_SIZE;
  const ROOKIE_SLOT_BUFFER = 50000;
  const cpuTeamsList = await prisma.team.findMany({ where: { is_user_team: false }, select: { id: true, budget: true } });
  for (const cpuTeam of cpuTeamsList) {
    const cpuRoster = await prisma.player.findMany({
      where: { team_id: cpuTeam.id, status: 'active' },
      orderBy: { salary: 'desc' },
      select: { id: true, salary: true },
    });
    let totalSalary = cpuRoster.reduce((s, p) => s + Number(p.salary), 0);
    let rosterSize = cpuRoster.length;
    const budget = Number(cpuTeam.budget);
    for (const player of cpuRoster) {
      const buffer = Math.max(0, CPU_TARGET_ROSTER - rosterSize) * ROOKIE_SLOT_BUFFER;
      if (budget >= totalSalary + buffer) break;
      await prisma.player.update({ where: { id: player.id }, data: { status: 'free_agent', team_id: null } });
      totalSalary -= Number(player.salary);
      rosterSize--;
    }
    const slotsToFill = Math.max(0, CPU_TARGET_ROSTER - rosterSize);
    for (let i = 0; i < slotsToFill; i++) {
      const rookieAge = Math.floor(Math.random() * 5) + 18;
      const rookie = generatePlayer({ age: rookieAge });
      const rookieSalary = Math.max(5000, Math.round(
        calculateSalary(rookie.potential_coefficient, rookie.current_skill, rookieAge) / 10 / 100
      ) * 100);
      await prisma.player.create({
        data: { ...rookie, team_id: cpuTeam.id, status: 'active', salary: rookieSalary, contract_years_remaining: Math.floor(Math.random() * 3) + 1, rookie_contract: true },
      });
    }
  }

  await decrementContractSeasons();
  await cancelAllActiveAuctions(null);
  const updatedSeason = await prisma.season.findUnique({ where: { id: season.id } });
  await createAuctionsForFreeAgents(null, updatedSeason);

  await clearAllInjuries();

  // Create annual draft and switch season to 'draft' phase
  await createDraft(season.id);
  await prisma.season.update({ where: { id: season.id }, data: { status: 'draft' } });

  return expired.count;
}

// POST /api/season/advance-day
// Durante temporada regular: simula partidos CPU del día actual y avanza al siguiente.
// Durante playoffs: simula el siguiente partido de cada serie CPU activa y avanza la ronda si corresponde.
router.post('/advance-day', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } }, orderBy: { id: 'desc' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });
    const day = season.current_day;

    await processInjuryRecovery();

    // ---- RAMA PLAYOFFS ----
    if (season.status === 'playoffs') {
      const pendingUserGame = await prisma.gameSchedule.findFirst({
        where: { season_id: season.id, is_user_game: true, status: 'scheduled' },
        orderBy: { id: 'asc' },
      });
      if (pendingUserGame) {
        return res.json({
          advanced: false,
          userGameId: pendingUserGame.id,
          message: 'Debes jugar tu partido de playoffs antes de avanzar',
          day,
          inPlayoffs: true,
        });
      }

      const activeSeries = await prisma.playoffSeries.findMany({
        where: { season_id: season.id, status: 'active' },
        include: { games: { where: { status: 'scheduled' }, orderBy: { id: 'asc' }, take: 1 } },
      });

      let simulated = 0;
      for (const s of activeSeries) {
        if (s.home_team_id === USER_TEAM_ID || s.away_team_id === USER_TEAM_ID) continue;
        const nextGameRef = s.games[0];
        if (!nextGameRef) continue;
        const nextGame = await prisma.gameSchedule.findUnique({ where: { id: nextGameRef.id } });
        try {
          const result = await playGame(nextGame, false, true);
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

      const playoffAdvance = await advancePlayoffRound(season.id);
      const isSeasonOver = playoffAdvance.champion === true;

      let expiredContracts = 0;
      if (isSeasonOver) {
        expiredContracts = await endOfSeasonCleanup(season);
      } else {
        await prisma.season.update({ where: { id: season.id }, data: { current_day: day + 1 } });
      }

      let nextUserGameId = null;
      if (!isSeasonOver) {
        const nextUserGame = await prisma.gameSchedule.findFirst({
          where: { season_id: season.id, is_user_game: true, status: 'scheduled' },
          orderBy: { id: 'asc' },
        });
        nextUserGameId = nextUserGame?.id ?? null;
      }

      return res.json({
        advanced: true,
        simulated,
        day: isSeasonOver ? day : day + 1,
        seasonFinished: isSeasonOver,
        inPlayoffs: true,
        expiredContracts,
        userGameId: nextUserGameId,
      });
    }

    // ---- RAMA TEMPORADA REGULAR ----
    const games = await prisma.gameSchedule.findMany({
      where: { season_id: season.id, day_number: day },
    });

    const userGame = games.find((g) => g.is_user_game && g.status === 'scheduled');
    if (userGame) {
      return res.json({
        advanced: false,
        userGameId: userGame.id,
        message: 'Debes jugar tu partido de hoy antes de avanzar el dia',
        day,
      });
    }

    let simulated = 0;
    for (const g of games) {
      if (g.status !== 'scheduled') continue;
      try {
        await playGame(g, false);
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

    await runCpuBidding(null, season);
    const auctionsClosed = await closeExpiredAuctions(null, season);

    await expireStaleTrades(null, season);
    if (day < TRADE_DEADLINE_DAY) {
      await generateCpuTradeOffers(null, season);
    }

    if (day === OFFER_WINDOW_END_DAY) {
      await finalizeContracts(season);
    }

    const newDay = day + 1;
    const finished = newDay > season.total_days;

    await prisma.season.update({
      where: { id: season.id },
      data: {
        current_day: finished ? season.total_days : newDay,
        status: finished ? 'playoffs' : 'active',
      },
    });

    if (finished) {
      await generatePlayoffBracket(season.id);
    }

    let userGameToday = null;
    if (!finished) {
      userGameToday = await prisma.gameSchedule.findFirst({
        where: { season_id: season.id, day_number: newDay, is_user_game: true },
      });
    }

    res.json({
      advanced: true,
      simulated,
      day: finished ? season.total_days : newDay,
      seasonFinished: false,
      playoffs: finished,
      auctionsClosed,
      userGameId: userGameToday ? userGameToday.id : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar el dia' });
  }
});

// GET /api/season/schedule -> calendario completo de la temporada activa
router.get('/schedule', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs'] } },
    });
    if (!season) return res.json([]);
    const games = await prisma.gameSchedule.findMany({
      where: { season_id: season.id },
      orderBy: [{ day_number: 'asc' }, { id: 'asc' }],
      include: {
        home_team: { select: { id: true, name: true } },
        away_team: { select: { id: true, name: true } },
      },
    });
    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el calendario' });
  }
});

module.exports = router;
