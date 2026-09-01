const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, PRE_SEASON_DAYS, MAX_ROSTER_SIZE, TRADE_DEADLINE_DAY, AUCTION_DEADLINE_DAY, ROSTER_CHECK_DAY, LUXURY_TAX_PROJECTION_DAY, PLAYER_INVESTMENT_DAY } = require('../config');
const { generateSchedule } = require('../services/scheduleGenerator');
const { simulateScheduledGamesForDay, simulateOtherActivePlayoffSeries } = require('../services/dayGamesSimulator');
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
const { generatePlayoffBracket, advancePlayoffRound } = require('../services/playoffService');
const { retireOldPlayers } = require('../services/retiredPlayer');
const { fluctuatePlayerSkills, updatePlayersContracts } = require('../services/playerService');
const { giveCpuTeamsRevenue, fillMissingPositions } = require('../services/cpuTeamManagement');
const { applyCoachBonuses, deductCoachSalaries } = require('../services/coachService');
const { recordLuxuryTaxProjection, applyLuxuryTax } = require('../services/luxuryTaxService');
const { createDraft } = require('../services/draftService');
const { processInjuryRecovery, clearAllInjuries } = require('../services/injuryService');
const { generateCpuTradeOffers, expireStaleTrades } = require('../services/tradeService');
const { investInPlayers } = require('../services/playerInvestmentService');
const { computeSeasonAwards } = require('../services/seasonAwardsService');
const { archiveAndCleanupSeason } = require('../services/seasonArchiveService');
const { runToddlerProgramSeasonEnd } = require('../services/toddlerProgramService');

// GET /api/season -> temporada activa (o null si no se ha iniciado)
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs', 'draft', 'completed'] } },
      orderBy: { id: 'desc' },
    });
    res.json(season ? { ...season, preSeasonDays: PRE_SEASON_DAYS, auctionDeadlineDay: AUCTION_DEADLINE_DAY } : null);
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

  await computeSeasonAwards(season);

  // Congela el resumen de la temporada por jugador y borra sus game_events/game_lineups
  // crudos (ver seasonArchiveService.js) — debe ir después de computeSeasonAwards, que es
  // el último consumidor de los eventos en vivo de esta temporada.
  await archiveAndCleanupSeason(season.id);

  await updatePlayersContracts();

  // Incrementa el contador de temporadas para todo rookie vigente (equipo, agente libre o prospecto de scout)
  // Se excluyen jugadores en Minors: su graduacion se congela hasta que sean promovidos manualmente.
  await prisma.player.updateMany({
    where: { rookie_contract: true, level: 'MAJOR', status: { in: ['active', 'free_agent', 'scouted'] } },
    data: { rookie_seasons: { increment: 1 } },
  });

  // Gradúa a los que acumulan 3+ temporadas como rookie: precio real = salario actual x 10
  const graduatingRookies = await prisma.player.findMany({
    where: { rookie_contract: true, rookie_seasons: { gte: 3 }, level: 'MAJOR', status: { in: ['active', 'free_agent', 'scouted'] } },
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
  await applyLuxuryTax(season, 999); // Impuesto al lujo: cobro real con roster final, antes del recorte de roster CPU

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
  }

  await decrementContractSeasons();

  // Programa de Toddlers: aporte del 5% de cada equipo CPU, rondas de mejora, y al
  // cumplir 10 temporadas congela el orden de eleccion y arranca el siguiente ciclo.
  // Corre despues del recorte de roster CPU (que lee budget) y de aging (age += 1).
  await runToddlerProgramSeasonEnd();

  // Create annual draft BEFORE regenerating season auctions: players pulled into the
  // draft pool are marked 'draft_reserved', so they're excluded from the fresh auction batch.
  await createDraft(season.id);

  await cancelAllActiveAuctions(null);
  const updatedSeason = await prisma.season.findUnique({ where: { id: season.id } });
  await createAuctionsForFreeAgents(null, updatedSeason);

  await clearAllInjuries();

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

    await processInjuryRecovery(season.current_day, season.id);

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
        select: { home_team_id: true, away_team_id: true },
      });
      const userInActiveSeries = activeSeries.some(
        (s) => s.home_team_id === USER_TEAM_ID || s.away_team_id === USER_TEAM_ID
      );

      // Si el usuario sigue en una serie activa, los partidos de las demas series CPU
      // ya se simularon al terminar su partido (ver routes/games.js). Solo cuando el
      // usuario ya no participa avanzamos las series CPU aqui, en cada pulsacion.
      let simulated = 0;
      if (!userInActiveSeries) {
        ({ simulated } = await simulateOtherActivePlayoffSeries(season.id));
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

    const { simulated } = await simulateScheduledGamesForDay(season.id, day);

    await runCpuBidding(null, season);
    const auctionsClosed = await closeExpiredAuctions(null, season);

    await expireStaleTrades(null, season);
    if (day < TRADE_DEADLINE_DAY) {
      await generateCpuTradeOffers(null, season);
    }

    if (day === OFFER_WINDOW_END_DAY) {
      await finalizeContracts(season);
    }

    if (day === ROSTER_CHECK_DAY) {
      await fillMissingPositions(season);
    }

    if (day === PLAYER_INVESTMENT_DAY) {
      await investInPlayers(season);
    }

    if (day === LUXURY_TAX_PROJECTION_DAY) {
      await recordLuxuryTaxProjection(season);
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
