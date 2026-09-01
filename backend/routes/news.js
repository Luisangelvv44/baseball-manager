const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

const ALERT_FEED_LIMIT = 30;

async function resolveActiveSeasonId(seasonId) {
  let resolved = seasonId ? parseInt(seasonId, 10) : null;
  if (!resolved) {
    const activeSeason = await prisma.season.findFirst({ where: { status: 'active' } });
    resolved = activeSeason?.id ?? null;
  }
  return resolved;
}

// GET /api/news/alerts — novedades importantes para el equipo del usuario + hazañas de liga.
router.get('/alerts', async (req, res) => {
  try {
    const seasonId = await resolveActiveSeasonId(req.query.seasonId);
    if (!seasonId) return res.json({ items: [], unreadCount: 0, seenAt: null });

    const userTeam = await prisma.team.findUnique({
      where: { id: USER_TEAM_ID },
      select: { alerts_seen_at: true },
    });
    const seenAt = userTeam?.alerts_seen_at ?? null;

    const [items, unreadCount] = await Promise.all([
      prisma.newsItem.findMany({
        where: { season_id: seasonId, alert: true },
        orderBy: { created_at: 'desc' },
        take: ALERT_FEED_LIMIT,
      }),
      prisma.newsItem.count({
        where: {
          season_id: seasonId,
          alert: true,
          created_at: { gt: seenAt ?? new Date(0) },
        },
      }),
    ]);

    res.json({ items, unreadCount, seenAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener alertas' });
  }
});

// POST /api/news/alerts/seen — marca todas las alertas como vistas (timestamp único).
router.post('/alerts/seen', async (req, res) => {
  try {
    const seenAt = new Date();
    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { alerts_seen_at: seenAt },
    });
    res.json({ ok: true, seenAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al marcar alertas como vistas' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { day, seasonId, type } = req.query;

    const resolvedSeasonId = await resolveActiveSeasonId(seasonId);

    const where = {};
    if (resolvedSeasonId) where.season_id = resolvedSeasonId;
    if (type) where.type = type;

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

    res.json({ items, seasonId: resolvedSeasonId, day: where.season_day, type: type ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener noticias' });
  }
});

module.exports = router;
