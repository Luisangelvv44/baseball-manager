const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const {
  getPlayoffBracket,
  simulatePlayoffGame,
  simulateRound,
  advancePlayoffRound,
} = require('../services/playoffService');

async function getActiveSeason() {
  return prisma.season.findFirst({
    where: { status: { in: ['active', 'playoffs', 'finished'] } },
    orderBy: { id: 'desc' },
  });
}

// GET /api/playoffs -> bracket de la temporada más reciente
router.get('/', async (req, res) => {
  try {
    const season = await getActiveSeason();
    if (!season) return res.json({ series: [], season_status: null });

    const series = await getPlayoffBracket(season.id);
    res.json({ series, season_status: season.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el bracket' });
  }
});

// POST /api/playoffs/simulate-game/:seriesId -> simula el próximo juego de una serie CPU
router.post('/simulate-game/:seriesId', async (req, res) => {
  try {
    const result = await simulatePlayoffGame(Number(req.params.seriesId));
    res.json({ success: true, homeScore: result.homeScore, awayScore: result.awayScore });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
});

// POST /api/playoffs/simulate-round -> simula todas las series CPU del round actual
router.post('/simulate-round', async (req, res) => {
  try {
    const season = await getActiveSeason();
    if (!season) return res.status(400).json({ error: 'No hay temporada' });

    await simulateRound(season.id);
    const series = await getPlayoffBracket(season.id);
    res.json({ success: true, series });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al simular la ronda' });
  }
});

// POST /api/playoffs/advance-round -> avanza al siguiente round si el actual terminó
router.post('/advance-round', async (req, res) => {
  try {
    const season = await getActiveSeason();
    if (!season) return res.status(400).json({ error: 'No hay temporada' });

    const result = await advancePlayoffRound(season.id);
    const series = await getPlayoffBracket(season.id);
    res.json({ ...result, series });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar la ronda' });
  }
});

module.exports = router;
