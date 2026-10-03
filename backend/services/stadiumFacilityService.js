const prisma = require('../db/prisma');
const { STADIUM_FACILITIES, FACILITY_UPKEEP_PER_LEVEL } = require('../config');

// Instalaciones del estadio a nivel de equipo (campo, iluminacion, marcador, medicas).
// Viven como columnas `<key>_level` en Team; nivel 1 = sin efecto.

function levelOf(team, key) {
  const def = STADIUM_FACILITIES[key];
  const lv = Number(team?.[def.column]);
  return Number.isFinite(lv) && lv >= 1 ? Math.min(lv, def.max) : 1;
}

// costo de subir de `level` a `level + 1`; null si ya esta al maximo
function getFacilityUpgradeCost(key, level) {
  const def = STADIUM_FACILITIES[key];
  if (!def || level >= def.max) return null;
  return Math.round(def.base_cost * Math.pow(def.cost_factor, level - 1));
}

// Bonos acumulados de todas las instalaciones del equipo. Con todo en nivel 1 son neutros.
function getFacilityBonuses(team) {
  let attendanceRateBonus = 0;
  let merchMultiplier = 1;
  let injuryProbMultiplier = 1;
  let injuryDaysReduction = 0;
  let levelsAboveOne = 0;

  for (const key of Object.keys(STADIUM_FACILITIES)) {
    const def = STADIUM_FACILITIES[key];
    const extra = levelOf(team, key) - 1;
    levelsAboveOne += extra;
    if (def.attendance_rate_per_level) attendanceRateBonus += extra * def.attendance_rate_per_level;
    if (def.merch_pct_per_level) merchMultiplier += extra * def.merch_pct_per_level;
    if (def.injury_prob_pct_per_level) injuryProbMultiplier -= extra * def.injury_prob_pct_per_level;
    if (def.injury_days_every_levels) injuryDaysReduction += Math.floor(extra / def.injury_days_every_levels);
  }

  return {
    attendanceRateBonus,
    merchMultiplier,
    injuryProbMultiplier: Math.max(0, injuryProbMultiplier),
    injuryDaysReduction,
    upkeep: levelsAboveOne * FACILITY_UPKEEP_PER_LEVEL,
  };
}

function describeEffect(def, level) {
  const extra = level - 1;
  const parts = [];
  if (def.attendance_rate_per_level) parts.push(`+${(extra * def.attendance_rate_per_level * 100).toFixed(1)}% asistencia`);
  if (def.merch_pct_per_level) parts.push(`+${Math.round(extra * def.merch_pct_per_level * 100)}% merch`);
  if (def.injury_prob_pct_per_level) parts.push(`-${Math.round(extra * def.injury_prob_pct_per_level * 100)}% lesiones`);
  if (def.injury_days_every_levels) {
    const days = Math.floor(extra / def.injury_days_every_levels);
    if (days > 0) parts.push(`-${days} día${days > 1 ? 's' : ''} de baja`);
  }
  return parts.join(' · ');
}

function describeFacilities(team) {
  return Object.keys(STADIUM_FACILITIES).map((key) => {
    const def = STADIUM_FACILITIES[key];
    const level = levelOf(team, key);
    const atMax = level >= def.max;
    return {
      key,
      name: def.name,
      level,
      max: def.max,
      levelName: def.levels[level - 1],
      nextLevelName: atMax ? null : def.levels[level],
      next_cost: getFacilityUpgradeCost(key, level),
      effect: describeEffect(def, level),
      nextEffect: atMax ? null : describeEffect(def, level + 1),
    };
  });
}

class FacilityError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function upgradeFacility(teamId, key) {
  const def = STADIUM_FACILITIES[key];
  if (!def) throw new FacilityError('Instalacion desconocida', 404);

  const team = await prisma.team.findUnique({ where: { id: teamId } });
  const level = levelOf(team, key);
  const cost = getFacilityUpgradeCost(key, level);
  if (cost == null) throw new FacilityError(`${def.name} ya esta al nivel maximo (${def.max})`);
  if (Number(team.budget) < cost) throw new FacilityError('Presupuesto insuficiente', 400, { cost });

  const newLevel = level + 1;
  const newBudget = Number(team.budget) - cost;
  await prisma.team.update({
    where: { id: teamId },
    data: { budget: newBudget, [def.column]: newLevel },
  });

  const season = await prisma.season.findFirst({ where: { status: 'active' } });
  await prisma.finance.create({
    data: {
      team_id: teamId,
      season_day: season?.current_day ?? 0,
      type: 'stadium_upgrade',
      amount: -cost,
      description: `Mejora de ${def.name} a nivel ${newLevel} (${def.levels[newLevel - 1]})`,
    },
  });

  return { key, newLevel, cost, newBudget };
}

module.exports = {
  getFacilityUpgradeCost,
  getFacilityBonuses,
  describeFacilities,
  upgradeFacility,
  FacilityError,
};
