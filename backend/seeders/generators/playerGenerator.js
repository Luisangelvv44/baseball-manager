const { FIRST_NAMES, LAST_NAMES } = require('../data/names');

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
  const base = (currentSkill * 8000) + (potential * 2000);
  const ageFactor = age > 32 ? 0.85 : 1;
  return Math.round((base * ageFactor) / 100) * 100;
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

// Jugadores que un scout encuentra: alto potencial, baja destreza actual (jovenes sin pulir)
function generateScoutedPlayer(scoutSkillLevel, targetPosition = null) {
  // entre mas alto el skill del scout, mejores prospectos encuentra (en promedio)
  const floor = 40 + Math.floor(scoutSkillLevel / 4); // 40-65
  const potential = randomInt(floor, Math.min(99, floor + 35));
  const age = randomInt(17, 21);
  const growthAge = calculateGrowthAge(potential);
  const currentSkill = randomInt(15, 35); // sin pulir todavia

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
  randomInt,
  randomChoice,
  POSITIONS,
  FIELD_POSITIONS,
};
