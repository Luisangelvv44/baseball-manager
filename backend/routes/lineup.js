const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// GET /api/lineup — returns user's saved lineup with player details
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

    if (rows.length === 0) return res.json({ saved: false, pitcher: null, batters: [] });

    const pitcherRow = rows.find((r) => r.is_pitcher);
    const batterRows = rows
      .filter((r) => !r.is_pitcher)
      .sort((a, b) => a.batting_order - b.batting_order);

    res.json({
      saved: true,
      pitcher: pitcherRow ? pitcherRow.player : null,
      batters: batterRows.map((r) => r.player),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/lineup — save user's lineup
// Body: { pitcherId: int, batterIds: [int x9] }
router.put('/', async (req, res) => {
  const { pitcherId, batterIds } = req.body;

  if (!pitcherId || !Array.isArray(batterIds) || batterIds.length !== 9) {
    return res.status(400).json({ error: 'Se requiere pitcherId y exactamente 9 bateadores.' });
  }

  const allIds = [pitcherId, ...batterIds];
  if (new Set(allIds).size !== allIds.length) {
    return res.status(400).json({ error: 'No se pueden repetir jugadores en el lineup.' });
  }

  try {
    // Validate all players belong to user's team
    const players = await prisma.player.findMany({
      where: { id: { in: allIds }, team_id: USER_TEAM_ID },
      select: { id: true, position: true },
    });

    if (players.length !== allIds.length) {
      return res.status(400).json({ error: 'Todos los jugadores deben pertenecer a tu equipo.' });
    }

    const pitcherPlayer = players.find((p) => p.id === pitcherId);
    if (!pitcherPlayer || pitcherPlayer.position !== 'P') {
      return res.status(400).json({ error: 'El pitcher debe tener posicion P.' });
    }

    const nonPitcherBatters = players.filter((p) => p.id !== pitcherId);
    if (nonPitcherBatters.some((p) => p.position === 'P')) {
      return res.status(400).json({ error: 'Los bateadores no pueden ser pitchers.' });
    }

    // Replace lineup atomically
    await prisma.$transaction([
      prisma.teamLineup.deleteMany({ where: { team_id: USER_TEAM_ID } }),
      prisma.teamLineup.create({
        data: { team_id: USER_TEAM_ID, player_id: pitcherId, is_pitcher: true, batting_order: null },
      }),
      ...batterIds.map((id, idx) =>
        prisma.teamLineup.create({
          data: { team_id: USER_TEAM_ID, player_id: id, is_pitcher: false, batting_order: idx + 1 },
        })
      ),
    ]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
