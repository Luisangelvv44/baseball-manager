const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, PRE_SEASON_DAYS } = require('../config');
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
const { generatePlayoffBracket } = require('../services/playoffService');

// GET /api/season -> temporada activa (o null si no se ha iniciado)
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs'] } },
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

// POST /api/season/advance-day
// Simula automaticamente todos los partidos del dia donde NO participa el usuario,
// y devuelve si hoy hay partido del usuario por jugar.
router.post('/advance-day', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });
    const day = season.current_day;

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

    // Simular partidos CPU vs CPU pendientes de hoy
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

    // Finalizar negociaciones de transmisión al cruzar el día 3
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

    let expiredContracts = 0;
    if (finished) {
      // Generate playoff bracket before resetting standings
      await generatePlayoffBracket(season.id);
      // Descontar un año de contrato a todos los jugadores activos
      await prisma.player.updateMany({
        where: { status: 'active' },
        data: { contract_years_remaining: { decrement: 1 } },
      });

      // Restaurar salario de mercado a contratos rookie que expiran antes de liberarlos
      const expiringRookies = await prisma.player.findMany({
        where: { status: 'active', rookie_contract: true, contract_years_remaining: { lte: 0 } },
        select: { id: true, potential_coefficient: true, current_skill: true, age: true },
      });
      for (const p of expiringRookies) {
        const realSalary = calculateSalary(p.potential_coefficient, p.current_skill, p.age);
        await prisma.player.update({
          where: { id: p.id },
          data: { salary: realSalary, rookie_contract: false },
        });
      }

      // Los contratos expirados pasan a agentes libres
      const expired = await prisma.player.updateMany({
        where: { status: 'active', contract_years_remaining: { lte: 0 } },
        data: { status: 'free_agent', team_id: null },
      });
      expiredContracts = expired.count;

      // Resetear standings de todos los equipos
      await prisma.team.updateMany({
        data: { wins: 0, losses: 0, runs_scored: 0, runs_allowed: 0 },
      });

      // Envejecer a todos los jugadores un año
      await prisma.player.updateMany({
        data: { age: { increment: 1 } },
      });

      // Eliminar agentes libres con 40+ años (no pueden ser contratados)
      await prisma.player.deleteMany({
        where: { status: 'free_agent', age: { gte: 40 } },
      });

      // Crecimiento/declive de skills al finalizar temporada
      const allPlayers = await prisma.player.findMany({
        where: { status: { in: ['active', 'free_agent'] } },
        select: { id: true, age: true, current_skill: true, growth_age: true, potential_coefficient: true },
      });
      for (const p of allPlayers) {
        const delta = p.age < p.growth_age
          ? Math.round(p.potential_coefficient * 0.5)
          : -Math.round(p.potential_coefficient * 0.3);
        const newSkill = Math.min(99, p.current_skill + delta);
        await prisma.player.update({
          where: { id: p.id },
          data: { current_skill: newSkill },
        });
      }

      // Gestion de plantilla CPU: recorte + relleno con contratos rookie
      const CPU_TARGET_ROSTER = 16;
      const ROOKIE_SLOT_BUFFER = 50000;

      const cpuTeamsList = await prisma.team.findMany({
        where: { is_user_team: false },
        select: { id: true, budget: true },
      });

      for (const cpuTeam of cpuTeamsList) {
        // Recorte: liberar jugadores (mayor salario primero) hasta cubrir nómina + margen
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
          await prisma.player.update({
            where: { id: player.id },
            data: { status: 'free_agent', team_id: null },
          });
          totalSalary -= Number(player.salary);
          rosterSize--;
        }

        // Relleno rookie: generar jugadores jóvenes nuevos para cubrir huecos de roster
        const slotsToFill = Math.max(0, CPU_TARGET_ROSTER - rosterSize);
        for (let i = 0; i < slotsToFill; i++) {
          const rookieAge = Math.floor(Math.random() * 5) + 18; // 18–22 años
          const rookie = generatePlayer({ age: rookieAge });
          const rookieSalary = Math.max(5000, Math.round(
            calculateSalary(rookie.potential_coefficient, rookie.current_skill, rookieAge) / 10 / 100
          ) * 100);
          await prisma.player.create({
            data: {
              ...rookie,
              team_id: cpuTeam.id,
              status: 'active',
              salary: rookieSalary,
              contract_years_remaining: Math.floor(Math.random() * 3) + 1,
              rookie_contract: true,
            },
          });
        }
      }

      // Ingresos de fin de temporada para equipos CPU según su fan_base
      const cpuTeamsRevenue = await prisma.team.findMany({
        where: { is_user_team: false },
        select: { id: true, fan_base: true },
      });
      for (const ct of cpuTeamsRevenue) {
        const revenuePerFan = Math.floor(Math.random() * 11) + 5; // $5–$15 entero por fan
        const revenue = ct.fan_base * revenuePerFan;
        if (revenue > 0) {
          await prisma.team.update({
            where: { id: ct.id },
            data: { budget: { increment: revenue } },
          });
        }
      }

      await decrementContractSeasons();
      await cancelAllActiveAuctions(null);
      const updatedSeason = await prisma.season.findUnique({ where: { id: season.id } });
      await createAuctionsForFreeAgents(null, updatedSeason);
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
      expiredContracts,
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
