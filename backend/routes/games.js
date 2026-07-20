const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { playGame } = require('../services/gamePlay');
const { computeHomeGameRevenue, computeAwayGameRevenue } = require('../services/economy');
const { updateSeriesAfterGame } = require('../services/playoffService');

// GET /api/games/:id -> info basica del partido + eventos guardados (si ya se jugo)
router.get('/:id', async (req, res) => {
  try {
    const game = await prisma.gameSchedule.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) return res.status(404).json({ error: 'Partido no encontrado' });

    const homeTeam = await prisma.team.findUnique({ where: { id: game.home_team_id } });
    const awayTeam = await prisma.team.findUnique({ where: { id: game.away_team_id } });
    const events = await prisma.gameEvent.findMany({
      where: { game_id: game.id },
      orderBy: { event_order: 'asc' },
    });

    res.json({ game, homeTeam, awayTeam, events });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el partido' });
  }
});

// POST /api/games/:id/simulate -> simula el partido del usuario (play-by-play completo)
// y aplica los efectos economicos (entradas/merch si es local, solo merch si es visita).
router.post('/:id/simulate', async (req, res) => {
  try {
    const game = await prisma.gameSchedule.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) return res.status(404).json({ error: 'Partido no encontrado' });

    if (game.status === 'finished') {
      return res.status(400).json({ error: 'Este partido ya fue jugado' });
    }

    const isPlayoff = !!game.playoff_series_id;
    let result;
    try {
      result = await playGame(game, true, isPlayoff);
    } catch (err) {
      if (err.code === 'ROSTER_INCOMPLETO') {
        return res.status(400).json({
          error: 'Tu equipo no tiene un roster completo (faltan jugadores titulares o pitcher).',
        });
      }
      throw err;
    }

    // ---------- Economia ----------
    const isUserHome = game.home_team_id === USER_TEAM_ID;
    const userTeam = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });

    let economy;
    if (isUserHome) {
      const sections = await prisma.stadiumSection.findMany({
        where: { team_id: USER_TEAM_ID, section_type: 'grandstand' },
      });
      economy = computeHomeGameRevenue(sections, userTeam.reputation, userTeam.fan_base, isPlayoff);

      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { increment: economy.total } },
      });

      const season = await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } } });
      const day = season?.current_day ?? 0;

      if (economy.ticketRevenue > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'ticket_sales',
            amount: economy.ticketRevenue,
            description: `Entradas (asistencia: ${economy.attendance})`,
          },
        });
      }
      if (economy.merchRevenue > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'merch_sales',
            amount: economy.merchRevenue,
            description: 'Venta de merchandising (local)',
          },
        });
      }
      if (economy.operatingCost > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'operating_cost',
            amount: -economy.operatingCost,
            description: 'Costos operativos del estadio',
          },
        });
      }
    } else {
      economy = computeAwayGameRevenue(userTeam.reputation);

      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { increment: economy.total } },
      });

      const season = await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } } });
      const day = season?.current_day ?? 0;

      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: day,
          type: 'merch_sales',
          amount: economy.merchRevenue,
          description: 'Venta de merchandising (visitante)',
        },
      });
    }

    if (isPlayoff) {
      await updateSeriesAfterGame(game, result);
    }

    res.json({
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      events: result.events,
      homeTeam: result.homeTeam,
      awayTeam: result.awayTeam,
      isUserHome,
      economy,
      isPlayoff,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al simular el partido' });
  }
});

module.exports = router;
