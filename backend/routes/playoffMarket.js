const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { getOpenPlayoffMarket, placePlayoffLoanBid, getPlayoffMarketView } = require('../services/playoffMarketService');

async function getCurrentSeason() {
  return prisma.season.findFirst({
    where: { status: { in: ['active', 'playoffs', 'finished'] } },
    orderBy: { id: 'desc' },
  });
}

// GET /api/playoff-market -> estado del mercado, jugadores disponibles y refuerzos del usuario
router.get('/', async (req, res) => {
  try {
    const season = await getCurrentSeason();
    if (!season) return res.json({ market: null, listings: [], myLoans: [] });
    res.json(await getPlayoffMarketView(season, USER_TEAM_ID));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el mercado de playoffs' });
  }
});

// POST /api/playoff-market/:loanId/bid  { pct }  (pct en % del salario, 50-150)
router.post('/:loanId/bid', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ where: { status: 'playoffs' }, orderBy: { id: 'desc' } });
    const market = season ? await getOpenPlayoffMarket(season.id) : null;
    if (!market) return res.status(400).json({ error: 'El mercado de playoffs no esta abierto' });

    const pct = Number(req.body.pct) / 100;
    const bid = await placePlayoffLoanBid({
      market,
      loanId: Number(req.params.loanId),
      teamId: USER_TEAM_ID,
      pct,
      seasonDay: season.current_day,
    });
    res.json({ success: true, bid });
  } catch (err) {
    if (err instanceof Error && !err.code) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Error al pujar' });
  }
});

module.exports = router;
