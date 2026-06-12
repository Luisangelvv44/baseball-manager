const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { generateSchedule } = require('../services/scheduleGenerator');
const { playGame } = require('../services/gamePlay');

// GET /api/season -> temporada activa (o null si no se ha iniciado)
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: 'active' },
      orderBy: { id: 'desc' },
    });
    res.json(season || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener temporada' });
  }
});

// POST /api/season/start -> genera el calendario (round-robin simple) y crea la temporada
router.post('/start', async (req, res) => {
  try {
    const existing = await prisma.season.findFirst({ where: { status: 'active' } });
    if (existing) {
      return res.status(400).json({ error: 'Ya hay una temporada activa' });
    }

    const teams = await prisma.team.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, division_id: true },
    });

    const games = generateSchedule(teams);
    const totalDays = Math.max(...games.map((g) => g.day_number));

    const season = await prisma.season.create({
      data: { year: new Date().getFullYear(), current_day: 1, total_days: totalDays, status: 'active' },
    });

    await prisma.gameSchedule.createMany({
      data: games.map((g) => ({
        season_id: season.id,
        day_number: g.day_number,
        home_team_id: g.home_team_id,
        away_team_id: g.away_team_id,
        status: 'scheduled',
        is_user_game: g.home_team_id === USER_TEAM_ID || g.away_team_id === USER_TEAM_ID,
      })),
    });

    res.json({ success: true, season, totalGames: games.length, totalDays });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar la temporada' });
  }
});

// POST /api/season/advance-day
// Simula automaticamente todos los partidos del dia donde NO participa el usuario,
// cobra salarios diarios, y devuelve si hoy hay partido del usuario por jugar.
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

    // Cobrar salarios diarios del usuario (salario anual / 162 dias)
    const players = await prisma.player.findMany({
      where: { team_id: USER_TEAM_ID },
      select: { salary: true },
    });
    const dailySalaries = Math.round(
      players.reduce((sum, p) => sum + Number(p.salary), 0) / 162
    );

    if (dailySalaries > 0) {
      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { decrement: dailySalaries } },
      });
      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: day,
          type: 'salaries',
          amount: -dailySalaries,
          description: 'Salarios del dia',
        },
      });
    }

    const newDay = day + 1;
    const finished = newDay > season.total_days;

    await prisma.season.update({
      where: { id: season.id },
      data: {
        current_day: finished ? season.total_days : newDay,
        status: finished ? 'finished' : 'active',
      },
    });

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
      seasonFinished: finished,
      userGameId: userGameToday ? userGameToday.id : null,
      dailySalaries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar el dia' });
  }
});

module.exports = router;
