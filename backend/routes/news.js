const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

router.get('/', async (req, res) => {
  try {
    const { day } = req.query;
    let targetDay;
    if (day !== undefined) {
      targetDay = parseInt(day, 10);
    } else {
      const latest = await prisma.newsItem.findFirst({ orderBy: { season_day: 'desc' } });
      targetDay = latest?.season_day ?? 0;
    }
    const items = await prisma.newsItem.findMany({
      where: { season_day: targetDay },
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
});

module.exports = router;
