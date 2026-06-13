const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// GET /api/lineup — returns user's saved lineup with pitcher rotation
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.teamLineup.findMany({
      where: { team_id: USER_TEAM_ID },
      include: {
        player: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            position: true,
            current_skill: true,
          },
        },
      },
    });

    if (rows.length === 0) return res.json({ saved: false, pitchers: [], batters: [], nextPitcherIdx: 0 });

    const pitcherRows = rows
      .filter((r) => r.is_pitcher)
      .sort((a, b) => a.rotation_slot - b.rotation_slot);
    const batterRows = rows
      .filter((r) => !r.is_pitcher)
      .sort((a, b) => a.batting_order - b.batting_order);

    let nextPitcherIdx = 0;
    if (pitcherRows.length > 1) {
      const season = await prisma.season.findFirst({ where: { status: 'active' } });
      if (season) {
        const finished = await prisma.gameSchedule.count({
          where: { season_id: season.id, is_user_game: true, status: 'finished' },
        });
        nextPitcherIdx = finished % pitcherRows.length;
      }
    }

    res.json({
      saved: true,
      pitchers: pitcherRows.map((r) => ({ ...r.player, rotation_slot: r.rotation_slot })),
      batters: batterRows.map((r) => r.player),
      nextPitcherIdx,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/lineup — save user's lineup
// Body: { pitcherIds: [int, ...] (1–4), batterIds: [int x9] }
router.put('/', async (req, res) => {
  const { pitcherIds, batterIds } = req.body;

  if (!Array.isArray(pitcherIds) || pitcherIds.length < 1 || pitcherIds.length > 4) {
    return res.status(400).json({ error: 'Se requieren entre 1 y 4 pitchers en la rotacion.' });
  }
  if (!Array.isArray(batterIds) || batterIds.length !== 9) {
    return res.status(400).json({ error: 'Se requieren exactamente 9 bateadores.' });
  }

  const allIds = [...pitcherIds, ...batterIds];
  if (new Set(allIds).size !== allIds.length) {
    return res.status(400).json({ error: 'No se pueden repetir jugadores en el lineup.' });
  }

  try {
    const players = await prisma.player.findMany({
      where: { id: { in: allIds }, team_id: USER_TEAM_ID },
      select: { id: true, position: true },
    });

    if (players.length !== allIds.length) {
      return res.status(400).json({ error: 'Todos los jugadores deben pertenecer a tu equipo.' });
    }

    const playerMap = new Map(players.map((p) => [p.id, p]));

    for (const id of pitcherIds) {
      if (playerMap.get(id)?.position !== 'P') {
        return res.status(400).json({ error: 'Los pitchers deben tener posicion P.' });
      }
    }
    for (const id of batterIds) {
      if (playerMap.get(id)?.position === 'P') {
        return res.status(400).json({ error: 'Los bateadores no pueden ser pitchers.' });
      }
    }

    await prisma.$transaction([
      prisma.teamLineup.deleteMany({ where: { team_id: USER_TEAM_ID } }),
      ...pitcherIds.map((id, idx) =>
        prisma.teamLineup.create({
          data: {
            team_id: USER_TEAM_ID,
            player_id: id,
            is_pitcher: true,
            rotation_slot: idx + 1,
            batting_order: null,
          },
        })
      ),
      ...batterIds.map((id, idx) =>
        prisma.teamLineup.create({
          data: {
            team_id: USER_TEAM_ID,
            player_id: id,
            is_pitcher: false,
            rotation_slot: null,
            batting_order: idx + 1,
          },
        })
      ),
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
