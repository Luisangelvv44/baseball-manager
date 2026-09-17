const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, LOAN_PCT_MIN, LOAN_PCT_MAX } = require('../config');
const {
  getOrCreateBank,
  checkLoanEligibility,
  requestLoanForTeam,
  computeSeasonEarningCapacity,
} = require('../services/bankService');

async function getActiveSeason() {
  return prisma.season.findFirst({
    where: { status: { in: ['active', 'playoffs', 'draft', 'completed'] } },
    orderBy: { id: 'desc' },
  });
}

// GET /api/bank/status -> balance y totales historicos del Banco
router.get('/status', async (req, res) => {
  try {
    const bank = await getOrCreateBank();
    const liquidityRatio = Number(bank.initial_capital) > 0
      ? Number(bank.balance) / Number(bank.initial_capital)
      : 0;

    res.json({
      balance: Number(bank.balance),
      initialCapital: Number(bank.initial_capital),
      baseInterestRate: bank.base_interest_rate,
      totalLoaned: Number(bank.total_loaned),
      totalInterestCollected: Number(bank.total_interest_collected),
      totalTaxFunded: Number(bank.total_tax_funded),
      totalDefaulted: Number(bank.total_defaulted),
      liquidityRatio,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el estado del Banco' });
  }
});

// GET /api/bank/loans?status=active|history&page=&pageSize= -> prestamos de todos los equipos
router.get('/loans', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 15));
    const statusFilter = req.query.status === 'history'
      ? { in: ['paid', 'defaulted'] }
      : 'active';

    const where = { status: statusFilter };
    const total = await prisma.loan.count({ where });
    const loans = await prisma.loan.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { team: { select: { id: true, name: true, is_user_team: true } } },
    });

    res.json({
      loans: loans.map((l) => ({
        id: l.id,
        teamId: l.team_id,
        teamName: l.team.name,
        isUserTeam: l.team.is_user_team,
        seasonId: l.season_id,
        dayIssued: l.day_issued,
        principal: Number(l.principal),
        interestRate: l.interest_rate,
        balanceRemaining: Number(l.balance_remaining),
        totalPaid: Number(l.total_paid),
        status: l.status,
        missedPayments: l.missed_payments,
        paidAt: l.paid_at,
        defaultedAt: l.defaulted_at,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los prestamos' });
  }
});

// GET /api/bank/eligibility -> estado del equipo del usuario frente al Banco
router.get('/eligibility', async (req, res) => {
  try {
    const season = await getActiveSeason();
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (!season || !team) {
      return res.json({ eligible: false, reason: 'No hay temporada activa', sec: 0, suggestedMin: 0, suggestedMax: 0, activeLoan: null });
    }

    const result = await checkLoanEligibility(team, season);
    const sec = result.sec;

    res.json({
      eligible: result.eligible,
      reason: result.reason,
      sec,
      suggestedMin: Math.round(sec * LOAN_PCT_MIN),
      suggestedMax: Math.round(sec * LOAN_PCT_MAX),
      activeLoan: result.activeLoan ? {
        id: result.activeLoan.id,
        balanceRemaining: Number(result.activeLoan.balance_remaining),
        interestRate: result.activeLoan.interest_rate,
      } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al evaluar elegibilidad' });
  }
});

// POST /api/bank/request { amount } -> solicitud manual de prestamo del equipo del usuario
router.post('/request', async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Monto invalido' });
    }

    const season = await getActiveSeason();
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (!season || !team) {
      return res.status(400).json({ error: 'No hay temporada activa' });
    }

    const eligibility = await checkLoanEligibility(team, season);
    if (!eligibility.eligible) {
      return res.status(400).json({ error: eligibility.reason });
    }

    const sec = computeSeasonEarningCapacity(team);
    if (amount < sec * LOAN_PCT_MIN || amount > sec * LOAN_PCT_MAX) {
      return res.status(400).json({
        error: `El monto debe estar entre $${Math.round(sec * LOAN_PCT_MIN).toLocaleString('es')} y $${Math.round(sec * LOAN_PCT_MAX).toLocaleString('es')}`,
      });
    }

    const result = await requestLoanForTeam(USER_TEAM_ID, amount, season);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al solicitar el prestamo' });
  }
});

module.exports = router;
