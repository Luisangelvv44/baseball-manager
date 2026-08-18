const prisma = require('../db/prisma');

// Percentiles usados para el umbral dinamico y la mediana de costo/skill de la liga.
// Ambos comparten el mismo metodo de interpolacion (ver `percentile`) para consistencia.
const LUXURY_TAX_THRESHOLD_PERCENTILE = 0.75;
const LUXURY_TAX_MEDIAN_PERCENTILE = 0.5;

// Tramos progresivos sobre el exceso (nomina - umbral), marginales (como IRPF).
// `limit` = techo acumulado de exceso para ese tramo; Infinity para el ultimo tramo.
const LUXURY_TAX_BRACKETS = [
  { limit: 10_000_000, rate: 0.20 },
  { limit: 25_000_000, rate: 0.35 },
  { limit: Infinity, rate: 0.50 },
];

// Calibracion del multiplicador de ineficiencia ("despilfarro").
const INEFFICIENCY_K = 10; // puntos de tasa extra por cada 1.0 de ratio sobre 1
const INEFFICIENCY_CAP = 30; // puntos porcentuales maximos extra

// sortedAscendingValues: array ya ordenado ascendente. p: 0..1. Interpolacion lineal
// (numpy method='linear' / Excel PERCENTILE.INC).
function percentile(sortedAscendingValues, p) {
  const n = sortedAscendingValues.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAscendingValues[0];
  const index = p * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedAscendingValues[lower];
  const frac = index - lower;
  return sortedAscendingValues[lower] + frac * (sortedAscendingValues[upper] - sortedAscendingValues[lower]);
}

function calculateLeagueThreshold(payrolls) {
  const sorted = [...payrolls].sort((a, b) => a - b);
  return percentile(sorted, LUXURY_TAX_THRESHOLD_PERCENTILE);
}

function calculateLeagueMedianCostPerSkill(costPerSkillValues) {
  const sorted = [...costPerSkillValues].sort((a, b) => a - b);
  return percentile(sorted, LUXURY_TAX_MEDIAN_PERCENTILE);
}

function calculateBracketTax(excess) {
  let remaining = Math.max(0, excess);
  let previousLimit = 0;
  let tax = 0;
  for (const bracket of LUXURY_TAX_BRACKETS) {
    if (remaining <= 0) break;
    const bracketWidth = bracket.limit - previousLimit;
    const amountInBracket = Math.min(remaining, bracketWidth);
    tax += amountInBracket * bracket.rate;
    remaining -= amountInBracket;
    previousLimit = bracket.limit;
  }
  return tax;
}

function calculateInefficiencyExtraPoints(ratio) {
  if (ratio <= 1) return 0;
  return Math.min(INEFFICIENCY_CAP, (ratio - 1) * INEFFICIENCY_K);
}

function calculateTeamLuxuryTax({ payroll, teamSkillSum, threshold, leagueMedianCostPerSkill }) {
  const excess = Math.max(0, payroll - threshold);
  const costPerSkill = teamSkillSum > 0 ? payroll / teamSkillSum : 0;

  if (excess === 0) {
    return {
      threshold, excess: 0, bracketTax: 0,
      costPerSkill, leagueMedianCostPerSkill,
      ratio: 0, extraPoints: 0, inefficiencyTax: 0, totalTax: 0,
    };
  }

  const bracketTax = calculateBracketTax(excess);
  const ratio = leagueMedianCostPerSkill > 0 ? costPerSkill / leagueMedianCostPerSkill : 0;
  const extraPoints = calculateInefficiencyExtraPoints(ratio);
  const inefficiencyTax = excess * (extraPoints / 100);
  const totalTax = bracketTax + inefficiencyTax;

  return { threshold, excess, bracketTax, costPerSkill, leagueMedianCostPerSkill, ratio, extraPoints, inefficiencyTax, totalTax };
}

// Calculo puro de DB: sin ningun write. Reutilizado por la proyeccion del dia 30 y por el
// cobro real de fin de temporada, para no duplicar la agregacion de payroll/skill por equipo.
async function computeLeagueLuxuryTax() {
  const teams = await prisma.team.findMany({ select: { id: true, name: true } });
  const players = await prisma.player.findMany({
    where: { status: 'active', level: 'MAJOR' },
    select: { team_id: true, salary: true, current_skill: true },
  });

  const statsByTeam = new Map();
  for (const t of teams) statsByTeam.set(t.id, { payroll: 0, skillSum: 0 });
  for (const p of players) {
    const stats = statsByTeam.get(p.team_id);
    if (!stats) continue;
    stats.payroll += Number(p.salary);
    stats.skillSum += p.current_skill;
  }

  const payrolls = teams.map((t) => statsByTeam.get(t.id).payroll);
  const threshold = calculateLeagueThreshold(payrolls);

  const costPerSkillValues = teams
    .map((t) => statsByTeam.get(t.id))
    .filter((s) => s.skillSum > 0)
    .map((s) => s.payroll / s.skillSum);
  const leagueMedianCostPerSkill = costPerSkillValues.length > 0
    ? calculateLeagueMedianCostPerSkill(costPerSkillValues)
    : 0;

  return teams.map((team) => {
    const stats = statsByTeam.get(team.id);
    const breakdown = calculateTeamLuxuryTax({
      payroll: stats.payroll,
      teamSkillSum: stats.skillSum,
      threshold,
      leagueMedianCostPerSkill,
    });
    return { teamId: team.id, teamName: team.name, payroll: stats.payroll, teamSkillSum: stats.skillSum, ...breakdown };
  });
}

// Proyeccion informativa a mitad de temporada (dia 30): guarda el calculo, no mueve dinero.
async function recordLuxuryTaxProjection(season) {
  const results = await computeLeagueLuxuryTax();
  await prisma.luxuryTaxRecord.createMany({
    data: results.map((r) => ({
      season_id: season.id,
      team_id: r.teamId,
      day: season.current_day,
      charged: false,
      payroll: Math.round(r.payroll),
      threshold: Math.round(r.threshold),
      league_median_cost_per_skill: r.leagueMedianCostPerSkill,
      cost_per_skill: r.costPerSkill,
      ratio: r.ratio,
      extra_points: r.extraPoints,
      bracket_tax: Math.round(r.bracketTax),
      inefficiency_tax: Math.round(r.inefficiencyTax),
      total_tax: Math.round(r.totalTax),
    })),
  });
  return results;
}

// Cobro real de fin de temporada: recalcula con el roster final y descuenta budget a quien deba.
async function applyLuxuryTax(season, seasonDay) {
  const results = await computeLeagueLuxuryTax();

  for (const r of results) {
    const taxOwed = Math.round(r.totalTax);

    await prisma.luxuryTaxRecord.create({
      data: {
        season_id: season.id,
        team_id: r.teamId,
        day: seasonDay,
        charged: taxOwed > 0,
        payroll: Math.round(r.payroll),
        threshold: Math.round(r.threshold),
        league_median_cost_per_skill: r.leagueMedianCostPerSkill,
        cost_per_skill: r.costPerSkill,
        ratio: r.ratio,
        extra_points: r.extraPoints,
        bracket_tax: Math.round(r.bracketTax),
        inefficiency_tax: Math.round(r.inefficiencyTax),
        total_tax: taxOwed,
      },
    });

    if (taxOwed > 0) {
      await prisma.team.update({ where: { id: r.teamId }, data: { budget: { decrement: taxOwed } } });
      await prisma.finance.create({
        data: {
          team_id: r.teamId,
          season_day: seasonDay,
          type: 'luxury_tax',
          amount: -taxOwed,
          description: `Impuesto al lujo (exceso $${Math.round(r.excess).toLocaleString('es')} sobre umbral $${Math.round(r.threshold).toLocaleString('es')})`,
        },
      });
    }
  }

  return results;
}

module.exports = {
  percentile,
  calculateLeagueThreshold,
  calculateLeagueMedianCostPerSkill,
  calculateBracketTax,
  calculateInefficiencyExtraPoints,
  calculateTeamLuxuryTax,
  computeLeagueLuxuryTax,
  recordLuxuryTaxProjection,
  applyLuxuryTax,
  LUXURY_TAX_THRESHOLD_PERCENTILE,
  LUXURY_TAX_MEDIAN_PERCENTILE,
  LUXURY_TAX_BRACKETS,
  INEFFICIENCY_K,
  INEFFICIENCY_CAP,
};
