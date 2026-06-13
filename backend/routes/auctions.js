const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { calculateGrowthCoefficient } = require('../services/auctionService');

function auctionInclude() {
  return {
    player: true,
    bids: {
      orderBy: { amount: 'desc' },
      take: 1,
      include: { team: { select: { id: true, name: true } } },
    },
    winning_team: { select: { id: true, name: true } },
  };
}

// GET /api/auctions
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });

    const auctions = await prisma.freeAgentAuction.findMany({
      where: { status: 'active', season_id: season?.id },
      include: auctionInclude(),
      orderBy: { id: 'asc' },
    });

    const result = auctions.map((a) => ({
      ...a,
      growth_coefficient: calculateGrowthCoefficient(a.player),
      top_bid: a.bids[0] ?? null,
      bids: undefined,
    }));

    const userRosterCount = await prisma.player.count({
      where: { team_id: USER_TEAM_ID, status: 'active' },
    });

    res.json({ auctions: result, userRosterCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener subastas' });
  }
});

// GET /api/auctions/:id
router.get('/:id', async (req, res) => {
  try {
    const auction = await prisma.freeAgentAuction.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        player: true,
        bids: {
          orderBy: { amount: 'desc' },
          include: { team: { select: { id: true, name: true } } },
        },
        winning_team: { select: { id: true, name: true } },
      },
    });

    if (!auction) return res.status(404).json({ error: 'Subasta no encontrada' });

    res.json({ ...auction, growth_coefficient: calculateGrowthCoefficient(auction.player) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener subasta' });
  }
});

// POST /api/auctions/:id/bid  { amount }
router.post('/:id/bid', async (req, res) => {
  const amount = Math.round(Number(req.body.amount));

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Monto de puja inválido' });
  }

  try {
    const auction = await prisma.freeAgentAuction.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        player: true,
        bids: { orderBy: { amount: 'desc' }, take: 1 },
      },
    });

    if (!auction) return res.status(404).json({ error: 'Subasta no encontrada' });
    if (auction.status !== 'active') {
      return res.status(400).json({ error: 'Esta subasta ya no está activa' });
    }

    const topBid = auction.bids[0] ?? null;
    const currentHighest = topBid ? Number(topBid.amount) : 0;

    if (topBid?.team_id === USER_TEAM_ID) {
      return res.status(400).json({ error: 'Ya eres el mejor postor. Espera que alguien te supere.' });
    }

    const minimumBid = currentHighest > 0
      ? Math.ceil(currentHighest * 1.01)
      : Number(auction.player.salary);

    if (amount < minimumBid) {
      return res.status(400).json({
        error: `La puja mínima es $${minimumBid.toLocaleString()}`,
        minimumBid,
      });
    }

    const userRosterCount = await prisma.player.count({
      where: { team_id: USER_TEAM_ID, status: 'active' },
    });
    if (userRosterCount >= 20) {
      return res.status(400).json({ error: 'Tu roster está lleno (máximo 20 jugadores)' });
    }

    const userTeam = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    const requiredNow = Math.round(amount * 0.1);
    if (Number(userTeam.budget) < requiredNow) {
      return res.status(400).json({
        error: `Presupuesto insuficiente. Necesitas al menos $${requiredNow.toLocaleString()} disponibles (bono de firma).`,
      });
    }

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const currentDay = season?.current_day ?? 0;

    await prisma.auctionBid.create({
      data: {
        auction_id: auction.id,
        team_id: USER_TEAM_ID,
        amount,
        season_day: currentDay,
      },
    });

    await prisma.freeAgentAuction.update({
      where: { id: auction.id },
      data: {
        last_bid_day: currentDay,
        closes_on_day: currentDay + 5,
      },
    });

    res.json({
      success: true,
      newHighBid: amount,
      closesOnDay: currentDay + 5,
      currentDay,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al pujar' });
  }
});

module.exports = router;
