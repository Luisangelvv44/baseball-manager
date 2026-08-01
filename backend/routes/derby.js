const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { createDerbyEvent, simulateDerbyEvent } = require('../services/derbyService');

function entryInclude() {
  return {
    team: { select: { id: true, name: true } },
    player: { select: { id: true, first_name: true, last_name: true, current_skill: true } },
  };
}

// GET /api/derby -> historial de eventos (paginado)
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 15));

    const total = await prisma.homeRunDerbyEvent.count();
    const events = await prisma.homeRunDerbyEvent.findMany({
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { entries: { include: entryInclude() } },
    });

    res.json({
      events,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener eventos de derby' });
  }
});

// GET /api/derby/:id
router.get('/:id', async (req, res) => {
  try {
    const event = await prisma.homeRunDerbyEvent.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        entries: { include: entryInclude() },
        swings: { orderBy: { turn_number: 'asc' } },
      },
    });
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el evento' });
  }
});

// POST /api/derby  { playerId, rewardAmount }
router.post('/', async (req, res) => {
  const playerId = parseInt(req.body.playerId, 10);
  const rewardAmount = Number(req.body.rewardAmount);

  if (!Number.isInteger(playerId)) {
    return res.status(400).json({ error: 'Jugador invalido' });
  }
  if (!Number.isFinite(rewardAmount) || rewardAmount <= 0) {
    return res.status(400).json({ error: 'Monto de recompensa invalido' });
  }

  try {
    const event = await createDerbyEvent({ playerId, rewardAmount });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al crear el derby' });
  }
});

// POST /api/derby/:id/simulate
router.post('/:id/simulate', async (req, res) => {
  try {
    const event = await simulateDerbyEvent(Number(req.params.id));
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message || 'Error al simular el derby' });
  }
});

module.exports = router;
