const { FIRST_NAMES, LAST_NAMES } = require('../data/names');
const {
  SCOUT_BUDGET_FACTOR_CAP_AMOUNT,
  SCOUT_BUDGET_FACTOR_MAX,
  SCOUT_BUDGET_FACTOR_EXPONENT,
  SCOUT_BUDGET_POTENTIAL_FLOOR_BONUS_MAX,
  SCOUT_BUDGET_POTENTIAL_FLOOR_CAP,
  SCOUT_BUDGET_POTENTIAL_CEILING_BONUS_MAX,
  SCOUT_BUDGET_AGE_REROLL_MAX_PROB,
  SCOUT_BUDGET_SKILL_MIN_BONUS_MAX,
  SCOUT_BUDGET_SKILL_MAX_BONUS_MAX,
} = require('../../config');

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const FIELD_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Distribucion sesgada: la mayoria entre 30-55, pocos sobre 80 (elite)
function generatePotentialCoefficient() {
  const roll = Math.random();
  if (roll < 0.55) return randomInt(30, 55);
  if (roll < 0.85) return randomInt(56, 75);
  if (roll < 0.97) return randomInt(76, 89);
  return randomInt(90, 99);
}

// Edad hasta la que el jugador sigue creciendo, en base a su potencial
function calculateGrowthAge(potential) {
  return 24 + Math.floor(potential / 10); // rango 24-33
}

// Destreza actual inicial: depende de cuan "madurado" esta respecto a growth_age
function generateInitialSkill(potential, age, growthAge) {
  const maturity = Math.min(1, age / growthAge);
  const base = potential * maturity;
  const variance = randomInt(-10, 5);
  return Math.max(15, Math.min(99, Math.round(base + variance)));
}

function calculateSalary(potential, currentSkill, age) {
  let base;
  if (currentSkill >= 110) {
    base = 13_000_000 + (currentSkill - 110) * 800_000;
  } else if (currentSkill >= 100) {
    base = 8_000_000 + (currentSkill - 100) * 500_000;
  } else if (currentSkill >= 90) {
    base = 5_000_000 + (currentSkill - 90) * 300_000;
  } else if (currentSkill >= 80) {
    base = 2_000_000 + (currentSkill - 80) * 300_000;
  } else if (currentSkill >= 70) {
    base = 750_000 + (currentSkill - 70) * 125_000;
  } else if (currentSkill >= 60) {
    base = 300_000 + (currentSkill - 60) * 45_000;
  } else {
    base = 50_000 + currentSkill * 4_200;
  }
  const potentialBonus = potential * 2_000;
  const ageFactor = age > 32 ? 0.85 : 1;
  // ±20% variance so two players with the same stats have different market values
  const variance = 0.80 + Math.random() * 0.40;
  return Math.round((base + potentialBonus) * ageFactor * variance / 50_000) * 50_000;
}

function randomDemandFactor() {
  return Math.round(Math.random() * 300) / 100; // 0.00-3.00
}

function generatePlayer(overrides = {}) {
  const potential = overrides.potential_coefficient ?? generatePotentialCoefficient();
  const age = overrides.age ?? randomInt(18, 40);
  const growthAge = calculateGrowthAge(potential);
  const currentSkill = overrides.current_skill ?? generateInitialSkill(potential, age, growthAge);

  return {
    first_name: overrides.first_name ?? randomChoice(FIRST_NAMES),
    last_name: overrides.last_name ?? randomChoice(LAST_NAMES),
    age,
    position: overrides.position ?? randomChoice(POSITIONS),
    potential_coefficient: potential,
    growth_age: growthAge,
    current_skill: currentSkill,
    salary: overrides.salary ?? calculateSalary(potential, currentSkill, age),
    demand_factor: overrides.demand_factor ?? randomDemandFactor(),
    contract_years_remaining: overrides.contract_years_remaining ?? randomInt(1, 4),
    rookie_contract: overrides.rookie_contract ?? false,
    team_id: overrides.team_id ?? null,
    status: overrides.status ?? 'active',
  };
}

// Roster CPU completo: 5 pitchers + 9 titulares de campo + banca
function generateRoster(teamId, size = 16) {
  const roster = [];

  for (let i = 0; i < 5; i++) {
    roster.push(generatePlayer({ team_id: teamId, position: 'P' }));
  }

  FIELD_POSITIONS.forEach((pos) => {
    roster.push(generatePlayer({ team_id: teamId, position: pos }));
  });

  const remaining = size - roster.length;
  for (let i = 0; i < remaining; i++) {
    roster.push(generatePlayer({ team_id: teamId }));
  }

  return roster;
}

// Curva de crecimiento acelerado: al principio el presupuesto ayuda poco,
// y cerca de SCOUT_BUDGET_FACTOR_CAP_AMOUNT el efecto se dispara. Mas alla del
// monto tope, el factor se queda fijo en SCOUT_BUDGET_FACTOR_MAX (sin mas beneficio).
function getScoutBudgetFactor(budget) {
  const b = Math.max(0, Number(budget) || 0);
  const ratio = Math.min(1, b / SCOUT_BUDGET_FACTOR_CAP_AMOUNT);
  return SCOUT_BUDGET_FACTOR_MAX * Math.pow(ratio, SCOUT_BUDGET_FACTOR_EXPONENT);
}

// Jugadores que un scout encuentra: alto potencial, baja destreza actual (jovenes sin pulir).
// El presupuesto de la mision (con crecimiento acelerado hasta un tope) mejora la
// calidad, pero el skill del scout sigue siendo la base y mantiene su propia ventaja.
function generateScoutedPlayer(scoutSkillLevel, budget = 0, targetPosition = null) {
  const budgetFactor = getScoutBudgetFactor(budget); // 0..3, acelerando cerca del tope
  const budgetProgress = budgetFactor / SCOUT_BUDGET_FACTOR_MAX; // 0..1, misma forma acelerada, para interpolar los bonos de abajo

  // (a) potencial: el skill del scout define el piso base (igual que antes);
  // el presupuesto suma un extra por encima de ese piso y amplia el techo.
  const skillFloor = 40 + Math.floor(scoutSkillLevel / 4); // 50-60, sin cambios
  const floor = Math.min(
    SCOUT_BUDGET_POTENTIAL_FLOOR_CAP,
    skillFloor + Math.round(budgetProgress * SCOUT_BUDGET_POTENTIAL_FLOOR_BONUS_MAX)
  );
  const ceiling = Math.min(99, floor + 35 + Math.round(budgetProgress * SCOUT_BUDGET_POTENTIAL_CEILING_BONUS_MAX));
  const potential = randomInt(floor, ceiling);

  // (b) edad: rango base sin cambios (17-21); a mayor presupuesto, mas probable
  // que se re-tire dentro de 17-18 (jugador mas joven).
  const baseAge = randomInt(17, 21);
  const rerollProb = Math.min(1, budgetProgress * SCOUT_BUDGET_AGE_REROLL_MAX_PROB);
  const age = Math.random() < rerollProb ? randomInt(17, 18) : baseAge;

  const growthAge = calculateGrowthAge(potential);

  // (c) destreza actual inicial: mas presupuesto = prospecto mas "pulido".
  // Con presupuesto tope: 15->70 (min) y 35->85 (max).
  const skillMin = 15 + Math.round(budgetProgress * SCOUT_BUDGET_SKILL_MIN_BONUS_MAX);
  const skillMax = 35 + Math.round(budgetProgress * SCOUT_BUDGET_SKILL_MAX_BONUS_MAX);
  const currentSkill = randomInt(skillMin, skillMax);

  const marketSalary = calculateSalary(potential, currentSkill, age);
  const rookieSalary = Math.max(5000, Math.round(marketSalary / 10 / 100) * 100);

  return generatePlayer({
    potential_coefficient: potential,
    age,
    current_skill: currentSkill,
    salary: rookieSalary,
    contract_years_remaining: randomInt(1, 3),
    rookie_contract: true,
    status: 'scouted',
    ...(targetPosition ? { position: targetPosition } : {}),
  });
}

module.exports = {
  generatePlayer,
  generateRoster,
  generateScoutedPlayer,
  generatePotentialCoefficient,
  calculateGrowthAge,
  generateInitialSkill,
  calculateSalary,
  randomDemandFactor,
  randomInt,
  randomChoice,
  POSITIONS,
  FIELD_POSITIONS,
};
