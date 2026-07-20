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

// GET /api/teams/overview -> roster count de todos los equipos + revenue/budget/puja estimados (solo CPU)
router.get('/overview', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      include: { division: true },
      orderBy: [{ division_id: 'asc' }, { id: 'asc' }],
    });

    const rosterCounts = await prisma.player.groupBy({
      by: ['team_id'],
      where: { team_id: { in: teams.map((t) => t.id) }, status: 'active' },
      _count: { id: true },
    });
    const countMap = Object.fromEntries(rosterCounts.map((r) => [r.team_id, r._count.id]));

    res.json(teams.map((t) => ({
      id: t.id,
      name: t.name,
      division_name: t.division?.name,
      is_user_team: t.is_user_team,
      roster_count: countMap[t.id] ?? 0,
      fan_base: t.fan_base,
      budget: t.is_user_team ? null : Number(t.budget),
      bid_aggressiveness_pct: t.is_user_team ? null : t.bid_aggressiveness * 100,
      max_bid_amount: t.is_user_team ? null : Math.round(Number(t.budget) * t.bid_aggressiveness),
      revenue_min: t.is_user_team ? null : t.fan_base * 50,
      revenue_max: t.is_user_team ? null : t.fan_base * 100,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener overview de equipos' });
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
