const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

router.get('/', async (req, res) => {
  try {
    const items = await prisma.newsItem.findMany({
      orderBy: [{ season_day: 'desc' }, { created_at: 'desc' }],
      take: 100,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
});

module.exports = router;
