const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, TRADE_OFFER_EXPIRY_DAYS } = require('../config');
const { validateTrade, executeTrade, shouldCpuAcceptTrade } = require('../services/tradeService');

function tradeInclude() {
  return {
    proposer_team: { select: { id: true, name: true } },
    recipient_team: { select: { id: true, name: true } },
    items: { include: { player: true } },
  };
}

// GET /api/trades/sent -> traspasos propuestos por el usuario, cualquier estado
router.get('/sent', async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: { proposer_team_id: USER_TEAM_ID },
      include: tradeInclude(),
      orderBy: { created_at: 'desc' },
    });
    res.json(trades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener traspasos enviados' });
  }
});

// GET /api/trades/received -> traspasos pendientes propuestos por una CPU al usuario
router.get('/received', async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: { recipient_team_id: USER_TEAM_ID, status: 'pending' },
      include: tradeInclude(),
      orderBy: { created_at: 'desc' },
    });
    res.json(trades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener traspasos recibidos' });
  }
});

// GET /api/trades/history -> traspasos resueltos (no pendientes) que involucran al usuario
router.get('/history', async (req, res) => {
  try {
    const trades = await prisma.trade.findMany({
      where: {
        status: { not: 'pending' },
        OR: [{ proposer_team_id: USER_TEAM_ID }, { recipient_team_id: USER_TEAM_ID }],
      },
      include: tradeInclude(),
      orderBy: { created_at: 'desc' },
    });
    res.json(trades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener historial de traspasos' });
  }
});

// POST /api/trades  { recipientTeamId, offeredPlayerIds, requestedPlayerIds, cashOffered, cashRequested }
// El usuario siempre es el proponente en esta ruta. Como no hay un cliente CPU esperando,
// el equipo receptor evalua la oferta y la resuelve (acepta o rechaza) en este mismo request.
router.post('/', async (req, res) => {
  try {
    const recipientTeamId = Number(req.body.recipientTeamId);
    const offeredPlayerIds = Array.isArray(req.body.offeredPlayerIds) ? req.body.offeredPlayerIds.map(Number) : [];
    const requestedPlayerIds = Array.isArray(req.body.requestedPlayerIds) ? req.body.requestedPlayerIds.map(Number) : [];
    const cashOffered = Math.max(0, Math.round(Number(req.body.cashOffered) || 0));
    const cashRequested = Math.max(0, Math.round(Number(req.body.cashRequested) || 0));

    if (!recipientTeamId || recipientTeamId === USER_TEAM_ID) {
      return res.status(400).json({ error: 'Equipo receptor inválido' });
    }
    if (offeredPlayerIds.length === 0 || requestedPlayerIds.length === 0) {
      return res.status(400).json({ error: 'Debes incluir al menos un jugador de cada equipo' });
    }

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });

    const recipientTeam = await prisma.team.findUnique({ where: { id: recipientTeamId } });
    if (!recipientTeam || recipientTeam.is_user_team) {
      return res.status(400).json({ error: 'Equipo receptor inválido' });
    }

    const allIds = [...offeredPlayerIds, ...requestedPlayerIds];
    const players = await prisma.player.findMany({ where: { id: { in: allIds } } });
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const missingIds = allIds.filter((id) => !playerMap.has(id));
    if (missingIds.length > 0) {
      return res.status(400).json({ error: 'Uno o más jugadores seleccionados no existen' });
    }

    const draftItems = [
      ...offeredPlayerIds.map((id) => ({ player_id: id, from_team_id: USER_TEAM_ID, player: playerMap.get(id) })),
      ...requestedPlayerIds.map((id) => ({ player_id: id, from_team_id: recipientTeamId, player: playerMap.get(id) })),
    ];

    const draftTrade = {
      proposer_team_id: USER_TEAM_ID,
      recipient_team_id: recipientTeamId,
      cash_offered: cashOffered,
      cash_requested: cashRequested,
      items: draftItems,
    };

    const validation = await validateTrade(prisma, draftTrade, season);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const created = await prisma.trade.create({
      data: {
        season_id: season.id,
        proposer_team_id: USER_TEAM_ID,
        recipient_team_id: recipientTeamId,
        status: 'pending',
        cash_offered: cashOffered,
        cash_requested: cashRequested,
        created_day: season.current_day,
        expires_day: season.current_day + TRADE_OFFER_EXPIRY_DAYS,
        items: { create: draftItems.map((i) => ({ player_id: i.player_id, from_team_id: i.from_team_id })) },
      },
    });

    const resolvedTrade = await prisma.trade.findUnique({
      where: { id: created.id },
      include: { items: { include: { player: true } } },
    });

    const shouldAccept = shouldCpuAcceptTrade(recipientTeam, resolvedTrade);
    if (shouldAccept) {
      const revalidation = await validateTrade(prisma, resolvedTrade, season);
      if (revalidation.ok) {
        await executeTrade(prisma, resolvedTrade, season);
        const finalTrade = await prisma.trade.findUnique({ where: { id: created.id }, include: tradeInclude() });
        return res.json({ success: true, accepted: true, trade: finalTrade });
      }
    }

    await prisma.trade.update({
      where: { id: created.id },
      data: { status: 'rejected', resolved_day: season.current_day },
    });
    const finalTrade = await prisma.trade.findUnique({ where: { id: created.id }, include: tradeInclude() });
    res.json({ success: true, accepted: false, trade: finalTrade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al proponer el traspaso' });
  }
});

// POST /api/trades/:id/accept -> el usuario acepta una oferta recibida de una CPU
router.post('/:id/accept', async (req, res) => {
  try {
    const trade = await prisma.trade.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { include: { player: true } } },
    });
    if (!trade) return res.status(404).json({ error: 'Traspaso no encontrado' });
    if (trade.recipient_team_id !== USER_TEAM_ID) {
      return res.status(400).json({ error: 'Solo puedes aceptar traspasos que te hayan propuesto' });
    }
    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Este traspaso ya no está pendiente' });
    }

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });

    const validation = await validateTrade(prisma, trade, season);
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    await executeTrade(prisma, trade, season);
    const finalTrade = await prisma.trade.findUnique({ where: { id: trade.id }, include: tradeInclude() });
    res.json({ success: true, trade: finalTrade });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aceptar el traspaso' });
  }
});

// POST /api/trades/:id/reject -> el usuario rechaza una oferta recibida de una CPU
router.post('/:id/reject', async (req, res) => {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: Number(req.params.id) } });
    if (!trade) return res.status(404).json({ error: 'Traspaso no encontrado' });
    if (trade.recipient_team_id !== USER_TEAM_ID) {
      return res.status(400).json({ error: 'Solo puedes rechazar traspasos que te hayan propuesto' });
    }
    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Este traspaso ya no está pendiente' });
    }

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: 'rejected', resolved_day: season?.current_day ?? trade.created_day },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar el traspaso' });
  }
});

// POST /api/trades/:id/cancel -> el usuario cancela un traspaso propio aun pendiente
router.post('/:id/cancel', async (req, res) => {
  try {
    const trade = await prisma.trade.findUnique({ where: { id: Number(req.params.id) } });
    if (!trade) return res.status(404).json({ error: 'Traspaso no encontrado' });
    if (trade.proposer_team_id !== USER_TEAM_ID) {
      return res.status(400).json({ error: 'Solo puedes cancelar tus propios traspasos' });
    }
    if (trade.status !== 'pending') {
      return res.status(400).json({ error: 'Este traspaso ya no está pendiente' });
    }

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    await prisma.trade.update({
      where: { id: trade.id },
      data: { status: 'cancelled', resolved_day: season?.current_day ?? trade.created_day },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cancelar el traspaso' });
  }
});

module.exports = router;
