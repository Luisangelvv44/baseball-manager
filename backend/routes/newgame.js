const express = require('express');
const router = express.Router();
const { seed } = require('../seeders/run');
const { USER_TEAM_ID } = require('../config');
const prisma = require('../db/prisma');

// POST /api/newgame -> resetea toda la base de datos y deja todo listo
// para que el usuario arme su equipo desde cero ($10M, sin roster, sin scouts,
// estadio inicial 3x3).
router.post('/', async (req, res) => {
  try {
    await seed();
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    res.json({ success: true, userTeam: team });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo iniciar la nueva partida' });
  }
});

module.exports = router;
