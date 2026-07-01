const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

router.get('/', async (req, res) => {
  try {
    const { day, seasonId } = req.query;

    let resolvedSeasonId = seasonId ? parseInt(seasonId, 10) : null;
    if (!resolvedSeasonId) {
      const activeSeason = await prisma.season.findFirst({ where: { status: 'active' } });
      resolvedSeasonId = activeSeason?.id ?? null;
    }

    const where = {};
    if (resolvedSeasonId) where.season_id = resolvedSeasonId;

    if (day !== undefined) {
      where.season_day = parseInt(day, 10);
    } else {
      const latest = await prisma.newsItem.findFirst({ where, orderBy: { season_day: 'desc' } });
      where.season_day = latest?.season_day ?? 0;
    }

    const items = await prisma.newsItem.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 100,
    });

    res.json({ items, seasonId: resolvedSeasonId, day: where.season_day });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
});

module.exports = router;
