const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, BROADCAST_OFFER_WINDOW_END_DAY } = require('../config');
const { acceptUserOffer, getCompaniesWithTiers } = require('../services/broadcastService');

// GET /api/broadcast/offers → ofertas vivas del usuario en la guerra de precios.
// is_best: va ganando su guerra (TV o radio); raised_last_day: subio en el ultimo avance de dia.
router.get('/offers', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    if (!season) return res.json({ windowEndDay: BROADCAST_OFFER_WINDOW_END_DAY, offers: [] });

    const offers = await prisma.broadcastOffer.findMany({
      where: { team_id: USER_TEAM_ID, season_id: season.id, status: 'PENDING' },
      include: { company: true },
      orderBy: [{ price_per_fan: 'desc' }, { id: 'asc' }],
    });

    const bestByType = {};
    for (const o of offers) {
      bestByType[o.company.type] = Math.max(bestByType[o.company.type] ?? 0, Number(o.price_per_fan));
    }

    res.json({
      windowEndDay: BROADCAST_OFFER_WINDOW_END_DAY,
      offers: offers.map((o) => ({
        ...o,
        is_best: Number(o.price_per_fan) === bestByType[o.company.type],
        raised_last_day: o.last_raised_day != null && o.last_raised_day === season.current_day - 1,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener ofertas' });
  }
});

// POST /api/broadcast/offers/:id/accept → firma la oferta al instante
router.post('/offers/:id/accept', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const result = await acceptUserOffer(parseInt(req.params.id), season);
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, contract: result.contract });
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

    if (season.current_day > BROADCAST_OFFER_WINDOW_END_DAY) {
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

// GET /api/broadcast/contracts → contratos activos del usuario (máximo uno de TV y uno de radio)
router.get('/contracts', async (req, res) => {
  try {
    const contracts = await prisma.broadcastContract.findMany({
      where: { team_id: USER_TEAM_ID, seasons_remaining: { gt: 0 } },
      include: { company: true },
      orderBy: { id: 'asc' },
    });
    res.json(contracts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener contratos' });
  }
});

// GET /api/broadcast/companies → empresas con su dinero, ganancia de la temporada, nivel de reputación
// (rank_limit = solo ofrecen al top N) y contratos vigentes
router.get('/companies', async (req, res) => {
  try {
    const companies = await getCompaniesWithTiers({
      include: {
        contracts: {
          where: { seasons_remaining: { gt: 0 } },
          include: { team: { select: { id: true, name: true, fan_base: true } } },
        },
      },
    });
    // audience: suma del fan_base de los equipos con contrato vigente
    res.json(companies.map((c) => ({
      ...c,
      audience: c.contracts.reduce((sum, ct) => sum + (ct.team.fan_base || 0), 0),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empresas' });
  }
});

module.exports = router;
