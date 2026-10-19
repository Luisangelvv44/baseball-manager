const express = require('express');
const router = express.Router();
const { getMapState } = require('../services/mapService');

// GET /api/map?gameId= -> ciudades, ubicacion actual del equipo del usuario y su proximo partido
router.get('/', async (req, res) => {
  try {
    res.json(await getMapState({ gameId: req.query.gameId }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el mapa' });
  }
});

module.exports = router;
