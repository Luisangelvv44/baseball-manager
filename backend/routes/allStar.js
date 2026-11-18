const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const {
  getAllStarBreak,
  homeConferenceFor,
  selectAllStars,
  getAllStarGame,
  playAllStarGame,
} = require('../services/allStarService');

async function currentSeason() {
  return prisma.season.findFirst({
    where: { status: { in: ['active', 'playoffs', 'draft', 'completed'] } },
    orderBy: { id: 'desc' },
  });
}

// GET /api/all-star -> pausa de la temporada actual, su juego (o la convocatoria en vivo si aun
// no se juega) e historial de juegos anteriores
router.get('/', async (req, res) => {
  try {
    const season = await currentSeason();
    const allStarBreak = getAllStarBreak(season);
    const game = season ? await getAllStarGame(season.id) : null;

    let preview = null;
    if (season && allStarBreak && !game && season.status === 'active') {
      const homeConference = homeConferenceFor(season.id);
      preview = { homeConference, squads: await selectAllStars() };
    }

    const history = await prisma.allStarGame.findMany({
      orderBy: { season_id: 'desc' },
      select: {
        id: true, season_id: true, home_conference: true, away_conference: true,
        home_score: true, away_score: true, mvp_player_id: true, rosters: true,
      },
    });

    res.json({
      currentDay: season?.current_day ?? null,
      seasonStatus: season?.status ?? null,
      allStarBreak,
      game,
      preview,
      history,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el Juego de Estrellas' });
  }
});

// POST /api/all-star/play -> juega el Juego de Estrellas (solo en su dia)
router.post('/play', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' }, orderBy: { id: 'desc' } });
    const allStarBreak = getAllStarBreak(season);
    if (!allStarBreak) return res.status(400).json({ error: 'Esta temporada no tiene Juego de Estrellas' });
    if (season.current_day !== allStarBreak.allStarDay) {
      return res.status(400).json({ error: `El Juego de Estrellas se juega el dia ${allStarBreak.allStarDay}` });
    }
    const game = await playAllStarGame(season);
    if (!game) return res.status(400).json({ error: 'No hay suficientes jugadores sanos para armar las selecciones' });
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al jugar el Juego de Estrellas' });
  }
});

// GET /api/all-star/:id -> juego guardado (temporadas anteriores)
router.get('/:id', async (req, res) => {
  try {
    const game = await prisma.allStarGame.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) return res.status(404).json({ error: 'Juego no encontrado' });
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el juego' });
  }
});

module.exports = router;
