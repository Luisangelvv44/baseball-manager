const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// GET /api/teams -> todos los equipos con info de division (para leaderboard)
router.get('/', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      include: { division: true },
      orderBy: [{ division_id: 'asc' }, { id: 'asc' }],
    });
    res.json(teams.map((t) => ({ ...t, division_name: t.division?.name })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener equipos' });
  }
});

// GET /api/teams/user -> equipo del usuario + su roster
router.get('/user', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    const players = await prisma.player.findMany({
      where: { team_id: USER_TEAM_ID },
      orderBy: [{ position: 'asc' }, { current_skill: 'desc' }],
    });
    res.json({ team, players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tu equipo' });
  }
});

// GET /api/teams/:id -> info + roster de cualquier equipo (CPU incluidos)
router.get('/:id', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: Number(req.params.id) } });
    if (!team) return res.status(404).json({ error: 'Equipo no encontrado' });

    const players = await prisma.player.findMany({
      where: { team_id: Number(req.params.id) },
      orderBy: [{ position: 'asc' }, { current_skill: 'desc' }],
    });
    res.json({ team, players });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener equipo' });
  }
});

module.exports = router;
