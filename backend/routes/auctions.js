const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, MAX_ROSTER_SIZE } = require('../config');
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

function toNumber(v) {
  return v !== undefined && v !== '' ? Number(v) : undefined;
}

// GET /api/auctions
router.get('/', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'active' } });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const minSkill = toNumber(req.query.minSkill);
    const maxSkill = toNumber(req.query.maxSkill);
    const minPotential = toNumber(req.query.minPotential);
    const maxPotential = toNumber(req.query.maxPotential);
    const minSalary = toNumber(req.query.minSalary);
    const maxSalary = toNumber(req.query.maxSalary);
    const minGrowth = toNumber(req.query.minGrowth);
    const maxGrowth = toNumber(req.query.maxGrowth);

    const playerWhere = {};
    if (req.query.position) playerWhere.position = req.query.position;
    if (minSkill !== undefined || maxSkill !== undefined) {
      playerWhere.current_skill = {};
      if (minSkill !== undefined) playerWhere.current_skill.gte = minSkill;
      if (maxSkill !== undefined) playerWhere.current_skill.lte = maxSkill;
    }
    if (minPotential !== undefined || maxPotential !== undefined) {
      playerWhere.potential_coefficient = {};
      if (minPotential !== undefined) playerWhere.potential_coefficient.gte = minPotential;
      if (maxPotential !== undefined) playerWhere.potential_coefficient.lte = maxPotential;
    }
    if (minSalary !== undefined || maxSalary !== undefined) {
      playerWhere.salary = {};
      if (minSalary !== undefined) playerWhere.salary.gte = minSalary;
      if (maxSalary !== undefined) playerWhere.salary.lte = maxSalary;
    }

    const where = { status: 'active', season_id: season?.id };
    if (Object.keys(playerWhere).length) where.player = playerWhere;

    const totalActive = await prisma.freeAgentAuction.count({
      where: { status: 'active', season_id: season?.id },
    });

    const hasGrowthFilter = minGrowth !== undefined || maxGrowth !== undefined;

    let result, total;

    if (hasGrowthFilter) {
      const all = await prisma.freeAgentAuction.findMany({
        where,
        include: auctionInclude(),
        orderBy: { id: 'asc' },
      });

      const mapped = all.map((a) => ({
        ...a,
        growth_coefficient: calculateGrowthCoefficient(a.player),
        top_bid: a.bids[0] ?? null,
        bids: undefined,
      }));

      const filtered = mapped.filter((a) => {
        if (minGrowth !== undefined && a.growth_coefficient < minGrowth) return false;
        if (maxGrowth !== undefined && a.growth_coefficient > maxGrowth) return false;
        return true;
      });

      total = filtered.length;
      result = filtered.slice((page - 1) * pageSize, page * pageSize);
    } else {
      total = await prisma.freeAgentAuction.count({ where });

      const rows = await prisma.freeAgentAuction.findMany({
        where,
        include: auctionInclude(),
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      result = rows.map((a) => ({
        ...a,
        growth_coefficient: calculateGrowthCoefficient(a.player),
        top_bid: a.bids[0] ?? null,
        bids: undefined,
      }));
    }

    const userRosterCount = await prisma.player.count({
      where: { team_id: USER_TEAM_ID, level: 'MAJOR', status: 'active' },
    });

    res.json({
      auctions: result,
      userRosterCount,
      total,
      totalActive,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
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
  const years = parseInt(req.body.years, 10);

  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Monto de puja inválido' });
  }
  if (!Number.isInteger(years) || years < 1) {
    return res.status(400).json({ error: 'Años de contrato inválidos' });
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

    const maxYears = Math.min(9, 40 - auction.player.age);
    if (years > maxYears) {
      return res.status(400).json({ error: `Máximo ${maxYears} año(s) de contrato para este jugador` });
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
      where: { team_id: USER_TEAM_ID, level: 'MAJOR', status: 'active' },
    });
    if (userRosterCount >= MAX_ROSTER_SIZE) {
      return res.status(400).json({ error: `Tu roster está lleno (máximo ${MAX_ROSTER_SIZE} jugadores)` });
    }

    const userTeam = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    const requiredNow = Math.round(amount * 0.2);
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
        years,
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
      years,
      closesOnDay: currentDay + 5,
      currentDay,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al pujar' });
  }
});

module.exports = router;
