const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { OFFER_WINDOW_END_DAY } = require('../services/broadcastService');

// GET /api/broadcast/offers → ofertas pendientes del equipo del usuario
router.get('/offers', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.json([]);

    const offers = await prisma.broadcastOffer.findMany({
      where: { team_id: USER_TEAM_ID, season_id: season.id, status: 'PENDING' },
      include: { company: true },
      orderBy: { id: 'asc' },
    });
    res.json(offers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ofertas' });
  }
});

// POST /api/broadcast/offers/:id/accept → aceptar oferta
router.post('/offers/:id/accept', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });

    if (season.current_day > OFFER_WINDOW_END_DAY) {
      return res.status(400).json({ error: 'La ventana de negociación ya cerró' });
    }

    const offer = await prisma.broadcastOffer.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!offer || offer.team_id !== USER_TEAM_ID || offer.status !== 'PENDING') {
      return res.status(400).json({ error: 'Oferta no válida' });
    }

    // Verificar que no tenga contrato activo
    const activeContract = await prisma.broadcastContract.findFirst({
      where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 } },
    });
    if (activeContract) {
      return res.status(400).json({ error: 'Ya tienes un contrato de transmisión activo' });
    }

    await prisma.broadcastOffer.update({
      where: { id: offer.id },
      data: { status: 'ACCEPTED' },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aceptar oferta' });
  }
});

// POST /api/broadcast/offers/:id/reject → rechazar oferta
router.post('/offers/:id/reject', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.status(400).json({ error: 'No hay temporada activa' });

    if (season.current_day > OFFER_WINDOW_END_DAY) {
      return res.status(400).json({ error: 'La ventana de negociación ya cerró' });
    }

    const offer = await prisma.broadcastOffer.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!offer || offer.team_id !== USER_TEAM_ID || offer.status !== 'PENDING') {
      return res.status(400).json({ error: 'Oferta no válida' });
    }

    await prisma.broadcastOffer.update({
      where: { id: offer.id },
      data: { status: 'REJECTED' },
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al rechazar oferta' });
  }
});

// GET /api/broadcast/contract → contrato activo del usuario
router.get('/contract', async (req, res) => {
  try {
    const contract = await prisma.broadcastContract.findFirst({
      where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 } },
      include: { company: true },
    });
    res.json(contract || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener contrato' });
  }
});

// GET /api/broadcast/companies → todas las empresas con sus contratos actuales
router.get('/companies', async (req, res) => {
  try {
    const companies = await prisma.broadcastCompany.findMany({
      include: {
        contracts: {
          where: { seasons_remaining: { gt: 0 } },
          include: { team: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ type: 'asc' }, { price_per_fan: 'desc' }],
    });
    res.json(companies);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empresas' });
  }
});

module.exports = router;
