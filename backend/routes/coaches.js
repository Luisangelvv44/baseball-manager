const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { FIRST_NAMES, LAST_NAMES } = require('../seeders/data/names');
const { MAX_COACHES } = require('../services/coachService');

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SPECIALTIES = ['BATTING', 'PITCHING', 'CONDITIONING'];

// GET /api/coaches -> coaches del equipo con jugador asignado
router.get('/', async (req, res) => {
  try {
    const coaches = await prisma.coach.findMany({
      where: { team_id: USER_TEAM_ID },
      include: {
        assigned_player: {
          select: { id: true, first_name: true, last_name: true, position: true, current_skill: true },
        },
      },
      orderBy: { id: 'asc' },
    });
    res.json(coaches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener coaches' });
  }
});

// POST /api/coaches/hire -> contratar un nuevo coach
router.post('/hire', async (req, res) => {
  try {
    const existing = await prisma.coach.count({ where: { team_id: USER_TEAM_ID } });
    if (existing >= MAX_COACHES) {
      return res.status(400).json({ error: `Maximo ${MAX_COACHES} coaches por equipo` });
    }

    const skillLevel = randomInt(60, 99);
    const salary = skillLevel * 5000;
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (Number(team.budget) < salary) {
      return res.status(400).json({ error: 'Presupuesto insuficiente', cost: salary });
    }

    const specialty = randomChoice(SPECIALTIES);
    const name = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;

    const coach = await prisma.coach.create({
      data: { team_id: USER_TEAM_ID, name, specialty, skill_level: skillLevel, salary },
    });

    // Hiring fee = 1 month salary
    const hiringFee = Math.round(salary / 12);
    await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { budget: { decrement: hiringFee } } });

    const season = await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs', 'draft'] } } });
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: season?.current_day ?? 0,
        type: 'coaches',
        amount: -hiringFee,
        description: `Contratacion de coach: ${name} (${specialty})`,
      },
    });

    res.json({ success: true, coach, hiringFee });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al contratar coach' });
  }
});

// POST /api/coaches/:id/assign { playerId } -> asignar jugador a coach
router.post('/:id/assign', async (req, res) => {
  const coachId = Number(req.params.id);
  const { playerId } = req.body;

  try {
    const coach = await prisma.coach.findFirst({ where: { id: coachId, team_id: USER_TEAM_ID } });
    if (!coach) return res.status(404).json({ error: 'Coach no encontrado' });

    if (playerId) {
      const player = await prisma.player.findFirst({
        where: { id: Number(playerId), team_id: USER_TEAM_ID, status: 'active' },
      });
      if (!player) return res.status(404).json({ error: 'Jugador no encontrado en el equipo' });

      // Check if player already assigned to another coach
      const existingAssignment = await prisma.coach.findFirst({
        where: { assigned_player_id: Number(playerId), id: { not: coachId } },
      });
      if (existingAssignment) {
        return res.status(400).json({ error: 'Ese jugador ya esta asignado a otro coach' });
      }
    }

    await prisma.coach.update({
      where: { id: coachId },
      data: { assigned_player_id: playerId ? Number(playerId) : null },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar jugador' });
  }
});

// DELETE /api/coaches/:id/fire -> despedir coach
router.delete('/:id/fire', async (req, res) => {
  const coachId = Number(req.params.id);
  try {
    const coach = await prisma.coach.findFirst({ where: { id: coachId, team_id: USER_TEAM_ID } });
    if (!coach) return res.status(404).json({ error: 'Coach no encontrado' });

    await prisma.coach.delete({ where: { id: coachId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al despedir coach' });
  }
});

module.exports = router;
