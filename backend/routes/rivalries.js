const express = require('express');
const router = express.Router();
const { listTopRivalries, getTeamRivalries } = require('../services/rivalryService');

// GET /api/rivalries -> rivalidades ordenadas por intensidad
router.get('/', async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const rivalries = await listTopRivalries(limit);
    res.json({ rivalries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las rivalidades' });
  }
});

// GET /api/rivalries/team/:teamId -> rivalidades de un equipo especifico
router.get('/team/:teamId', async (req, res) => {
  try {
    const rivalries = await getTeamRivalries(req.params.teamId);
    res.json({ rivalries });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las rivalidades del equipo' });
  }
});

module.exports = router;
