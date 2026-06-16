const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { advanceCpuPick, userPick } = require('../services/draftService');

// GET /api/draft/current -> draft activo con prospectos y orden de picks
router.get('/current', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({
      where: { status: { in: ['draft'] } },
      orderBy: { id: 'desc' },
    });
    if (!season) return res.json(null);

    const draft = await prisma.draft.findUnique({
      where: { season_id: season.id },
      include: {
        prospects: { orderBy: [{ picked_by_team_id: 'asc' }, { current_skill: 'desc' }] },
      },
    });
    if (!draft) return res.json(null);

    // Enrich pick_order with team names
    const pickOrder = draft.pick_order;
    const teams = await prisma.team.findMany({
      where: { id: { in: pickOrder } },
      select: { id: true, name: true },
    });
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    const enrichedOrder = pickOrder.map((id) => ({ id, name: teamMap[id] ?? `Equipo ${id}` }));

    const currentTeamId = draft.current_pick <= pickOrder.length ? pickOrder[draft.current_pick - 1] : null;
    const isUserTurn = currentTeamId === USER_TEAM_ID;

    res.json({
      ...draft,
      pick_order: enrichedOrder,
      current_team_id: currentTeamId,
      is_user_turn: isUserTurn,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el draft' });
  }
});

// POST /api/draft/advance -> avanzar pick de CPU (auto-pick)
router.post('/advance', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'draft' } });
    if (!season) return res.status(400).json({ error: 'No hay draft activo' });

    const draft = await prisma.draft.findUnique({ where: { season_id: season.id } });
    if (!draft) return res.status(400).json({ error: 'No hay draft activo' });
    if (draft.status === 'completed') return res.status(400).json({ error: 'El draft ya terminó' });

    const result = await advanceCpuPick(draft.id);

    if (result === false) {
      return res.json({ advanced: false, isUserTurn: true });
    }
    if (result === null) {
      await prisma.season.update({ where: { id: season.id }, data: { status: 'completed' } });
      return res.json({ advanced: false, draftComplete: true });
    }

    // Check if now it's user's turn or draft is done
    const updatedDraft = await prisma.draft.findUnique({ where: { id: draft.id } });
    const pickOrder = updatedDraft.pick_order;
    const isDone = updatedDraft.status === 'completed';

    if (isDone) {
      await prisma.season.update({ where: { id: season.id }, data: { status: 'completed' } });
    }

    const nextTeamId = !isDone && updatedDraft.current_pick <= pickOrder.length
      ? pickOrder[updatedDraft.current_pick - 1]
      : null;
    const isUserTurn = nextTeamId === USER_TEAM_ID;

    res.json({ advanced: true, draftComplete: isDone, isUserTurn });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar el draft' });
  }
});

// POST /api/draft/pick { prospectId } -> el usuario elige su prospecto
router.post('/pick', async (req, res) => {
  try {
    const { prospectId } = req.body;
    if (!prospectId) return res.status(400).json({ error: 'Se requiere prospectId' });

    const season = await prisma.season.findFirst({ where: { status: 'draft' } });
    if (!season) return res.status(400).json({ error: 'No hay draft activo' });

    const draft = await prisma.draft.findUnique({ where: { season_id: season.id } });
    if (!draft) return res.status(400).json({ error: 'No hay draft activo' });

    const { player, draftComplete } = await userPick(draft.id, Number(prospectId));

    if (draftComplete) {
      await prisma.season.update({ where: { id: season.id }, data: { status: 'completed' } });
    }

    res.json({ success: true, player, draftComplete });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Error al seleccionar prospecto' });
  }
});

module.exports = router;
