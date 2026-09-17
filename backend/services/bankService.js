const prisma = require('../db/prisma');
const { createNews } = require('./newsService');
const {
  USER_TEAM_ID,
  CPU_REVENUE_PER_FAN_MAX,
  LOAN_WINDOW_END_DAY,
  LOAN_ELIGIBILITY_MIN_BUDGET,
  LOAN_ELIGIBILITY_BUDGET_PCT_OF_SEC,
  LOAN_PCT_MIN,
  LOAN_PCT_MAX,
  LOAN_MAX_TO_CAPACITY_RATIO,
  LOAN_MIN_CAUTION_FACTOR,
  LOAN_MIN_VIABLE_AMOUNT,
  LOAN_RISK_PREMIUM_MAX,
  LOAN_LIQUIDITY_PREMIUM_MAX,
  LOAN_MIN_RATE,
  LOAN_MAX_RATE,
  LOAN_SEASON_END_REPAYMENT_RATE,
  LOAN_MAX_MISSED_PAYMENTS,
  LOAN_DEFAULT_REPUTATION_PENALTY,
  LOAN_DEFAULT_MIN_REPUTATION,
  LOAN_DEFAULT_COOLDOWN_SEASONS,
  LOAN_NEWS_LARGE_THRESHOLD_RATIO,
  BANK_INITIAL_CAPITAL,
  BANK_BASE_INTEREST_RATE,
} = require('../config');

const BANK_ID = 1;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Fallback defensivo: el banco se siembra normalmente en seeders/run.js. Si no existe
// (DB creada antes de esta migracion), se crea aqui con los valores por defecto.
async function getOrCreateBank() {
  let bank = await prisma.bank.findUnique({ where: { id: BANK_ID } });
  if (!bank) {
    bank = await prisma.bank.create({
      data: {
        id: BANK_ID,
        balance: BANK_INITIAL_CAPITAL,
        initial_capital: BANK_INITIAL_CAPITAL,
        base_interest_rate: BANK_BASE_INTEREST_RATE,
      },
    });
  }
  return bank;
}

// Capacidad de ganancia de una temporada: misma referencia que usa giveCpuTeamsRevenue
// como techo del pago plano CPU, reutilizada aqui para que la elegibilidad, el monto
// solicitado y el pago de fin de temporada compartan una unica nocion de "cuanto puede
// ganar un equipo en una temporada", valida tanto para CPU como para el usuario.
function computeSeasonEarningCapacity(team) {
  return team.fan_base * CPU_REVENUE_PER_FAN_MAX;
}

async function checkLoanEligibility(team, season) {
  const sec = computeSeasonEarningCapacity(team);

  if (season.status !== 'active' || season.current_day > LOAN_WINDOW_END_DAY) {
    return { eligible: false, reason: 'Fuera de la ventana de solicitud (primeros dias de temporada)', sec };
  }

  const budget = Number(team.budget);
  const needsLoan = budget < LOAN_ELIGIBILITY_MIN_BUDGET || budget < LOAN_ELIGIBILITY_BUDGET_PCT_OF_SEC * sec;
  if (!needsLoan) {
    return { eligible: false, reason: 'El presupuesto actual no cumple el criterio de elegibilidad', sec };
  }

  const activeLoan = await prisma.loan.findFirst({ where: { team_id: team.id, status: 'active' } });
  if (activeLoan) {
    return { eligible: false, reason: 'Ya tiene un prestamo activo', sec, activeLoan };
  }

  const recentDefault = await prisma.loan.findFirst({
    where: {
      team_id: team.id,
      status: 'defaulted',
      season: { year: { gte: season.year - LOAN_DEFAULT_COOLDOWN_SEASONS } },
    },
  });
  if (recentDefault) {
    return { eligible: false, reason: 'En periodo de espera tras un incumplimiento previo', sec };
  }

  return { eligible: true, reason: null, sec };
}

// Sorteo del monto solicitado por la CPU: uniforme en [LOAN_PCT_MIN, LOAN_PCT_MAX] cuando
// desperation_index=0; a mayor desesperacion, el exponente 1/(1+desperation_index) empuja
// el sorteo hacia el techo del rango (en desperation_index=2, exponente=1/3).
function drawRequestedAmount(team, sec) {
  const pct = LOAN_PCT_MIN + (LOAN_PCT_MAX - LOAN_PCT_MIN) * Math.random() ** (1 / (1 + team.desperation_index));
  return sec * pct;
}

// Puro, sin escritura: decide cuanto aprobar y a que tasa, segun la solvencia del equipo
// (capacidad de ganancia) y la salud/liquidez actual del banco (su propia "personalidad").
function evaluateLoanRequest(team, requestedAmount, bank, sec) {
  const liquidityHealth = clamp(Number(bank.balance) / Number(bank.initial_capital), 0, 1);
  const cautionFactor = clamp(liquidityHealth, LOAN_MIN_CAUTION_FACTOR, 1);
  const solvencyCap = LOAN_MAX_TO_CAPACITY_RATIO * cautionFactor * sec;

  const approvedAmount = Math.max(0, Math.min(requestedAmount, solvencyCap, Number(bank.balance)));
  if (approvedAmount < LOAN_MIN_VIABLE_AMOUNT) {
    return { approvedAmount: 0, interestRate: 0, rejected: true, liquidityHealth };
  }

  const riskPremium = LOAN_RISK_PREMIUM_MAX * (approvedAmount / sec);
  const liquidityPremium = LOAN_LIQUIDITY_PREMIUM_MAX * (1 - liquidityHealth);
  const interestRate = clamp(bank.base_interest_rate + riskPremium + liquidityPremium, LOAN_MIN_RATE, LOAN_MAX_RATE);

  return { approvedAmount, interestRate, rejected: false, liquidityHealth };
}

async function issueLoan(team, season, approvedAmount, interestRate, sec) {
  const principal = Math.round(approvedAmount);
  const balanceRemaining = Math.round(principal * (1 + interestRate));

  const loan = await prisma.loan.create({
    data: {
      team_id: team.id,
      season_id: season.id,
      day_issued: season.current_day,
      principal,
      interest_rate: interestRate,
      balance_remaining: balanceRemaining,
    },
  });

  await prisma.team.update({ where: { id: team.id }, data: { budget: { increment: principal } } });
  await prisma.bank.update({
    where: { id: BANK_ID },
    data: { balance: { decrement: principal }, total_loaned: { increment: principal } },
  });
  await prisma.finance.create({
    data: {
      team_id: team.id,
      season_day: season.current_day,
      type: 'loan_disbursement',
      amount: principal,
      description: `Prestamo del Banco (tasa ${(interestRate * 100).toFixed(1)}%)`,
    },
  });

  if (principal >= LOAN_NEWS_LARGE_THRESHOLD_RATIO * sec) {
    const amtM = (principal / 1_000_000).toFixed(2);
    await createNews(
      'loan',
      `${team.name} solicitó un préstamo de $${amtM}M al Banco (tasa ${(interestRate * 100).toFixed(1)}%)`,
      season.current_day,
      season.id,
      { teamId: team.id, alert: team.id === USER_TEAM_ID }
    );
  }

  return loan;
}

// Punto de entrada unico compartido por el pase automatico de CPU y la solicitud manual
// del usuario: verifica elegibilidad, evalua el monto con la solvencia/liquidez del banco,
// y emite el prestamo si corresponde.
async function requestLoanForTeam(teamId, requestedAmount, season) {
  const team = await prisma.team.findUnique({ where: { id: teamId } });
  const eligibility = await checkLoanEligibility(team, season);
  if (!eligibility.eligible) {
    return { approvedAmount: 0, interestRate: 0, rejected: true, reason: eligibility.reason };
  }

  const bank = await getOrCreateBank();
  const evaluation = evaluateLoanRequest(team, requestedAmount, bank, eligibility.sec);
  if (evaluation.rejected) {
    return { approvedAmount: 0, interestRate: 0, rejected: true, reason: 'El Banco no considera viable el prestamo en este momento' };
  }

  const loan = await issueLoan(team, season, evaluation.approvedAmount, evaluation.interestRate, eligibility.sec);
  return { approvedAmount: evaluation.approvedAmount, interestRate: evaluation.interestRate, rejected: false, loan };
}

// Pase diario de la CPU durante la ventana de solicitud (dias 1..LOAN_WINDOW_END_DAY):
// cada equipo CPU elegible sortea un monto y lo somete al mismo criterio de evaluacion
// que el usuario.
async function runCpuLoanPass(season) {
  const cpuTeams = await prisma.team.findMany({ where: { is_user_team: false } });

  for (const team of cpuTeams) {
    const eligibility = await checkLoanEligibility(team, season);
    if (!eligibility.eligible) continue;

    const requestedAmount = drawRequestedAmount(team, eligibility.sec);
    await requestLoanForTeam(team.id, requestedAmount, season);
  }
}

// Pase de fin de temporada (endOfSeasonCleanup, justo despues de applyLuxuryTax): cada
// prestamo activo recibe hasta el 30% de la ganancia de temporada del equipo (o su saldo
// restante si es menor), sin dejar el budget en negativo. Tres temporadas consecutivas sin
// cubrir la cuota completa disparan un default: el Banco absorbe el saldo y el equipo
// pierde reputacion.
async function processSeasonEndRepayments(season) {
  const activeLoans = await prisma.loan.findMany({
    where: { status: 'active' },
    include: { team: true },
  });

  for (const loan of activeLoans) {
    const team = loan.team;
    const bank = await getOrCreateBank();
    const sec = computeSeasonEarningCapacity(team);

    const duePayment = Math.min(Number(loan.balance_remaining), LOAN_SEASON_END_REPAYMENT_RATE * sec);
    const actualPayment = Math.max(0, Math.min(Number(team.budget), duePayment));

    if (actualPayment > 0) {
      await prisma.team.update({ where: { id: team.id }, data: { budget: { decrement: actualPayment } } });
      await prisma.bank.update({ where: { id: BANK_ID }, data: { balance: { increment: actualPayment } } });
      await prisma.finance.create({
        data: {
          team_id: team.id,
          season_day: season.current_day,
          type: 'loan_repayment',
          amount: -actualPayment,
          description: 'Pago de fin de temporada al Banco',
        },
      });
    }

    const newBalance = Number(loan.balance_remaining) - actualPayment;
    const newTotalPaid = Number(loan.total_paid) + actualPayment;
    const fullyPaid = newBalance <= 0;
    const missedThisSeason = actualPayment < duePayment;
    const newMissedPayments = missedThisSeason ? loan.missed_payments + 1 : 0;

    if (fullyPaid) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { balance_remaining: 0, total_paid: newTotalPaid, status: 'paid', paid_at: new Date(), missed_payments: 0 },
      });
      await prisma.bank.update({
        where: { id: BANK_ID },
        data: { total_interest_collected: { increment: Math.max(0, newTotalPaid - Number(loan.principal)) } },
      });
      await createNews(
        'loan',
        `${team.name} terminó de pagar su préstamo con el Banco`,
        season.current_day,
        season.id,
        { teamId: team.id, alert: team.id === USER_TEAM_ID }
      );
      continue;
    }

    if (newMissedPayments >= LOAN_MAX_MISSED_PAYMENTS) {
      await prisma.loan.update({
        where: { id: loan.id },
        data: { balance_remaining: 0, total_paid: newTotalPaid, status: 'defaulted', defaulted_at: new Date(), missed_payments: newMissedPayments },
      });
      await prisma.bank.update({ where: { id: BANK_ID }, data: { total_defaulted: { increment: newBalance } } });
      const newReputation = Math.max(LOAN_DEFAULT_MIN_REPUTATION, team.reputation - LOAN_DEFAULT_REPUTATION_PENALTY);
      await prisma.team.update({ where: { id: team.id }, data: { reputation: newReputation } });
      await createNews(
        'loan',
        `${team.name} entró en mora con el Banco tras ${LOAN_MAX_MISSED_PAYMENTS} temporadas sin pagar; pierde ${LOAN_DEFAULT_REPUTATION_PENALTY} de reputación`,
        season.current_day,
        season.id,
        { teamId: team.id, alert: team.id === USER_TEAM_ID }
      );
      continue;
    }

    await prisma.loan.update({
      where: { id: loan.id },
      data: { balance_remaining: newBalance, total_paid: newTotalPaid, missed_payments: newMissedPayments },
    });
  }
}

module.exports = {
  getOrCreateBank,
  computeSeasonEarningCapacity,
  checkLoanEligibility,
  evaluateLoanRequest,
  drawRequestedAmount,
  issueLoan,
  requestLoanForTeam,
  runCpuLoanPass,
  processSeasonEndRepayments,
};
