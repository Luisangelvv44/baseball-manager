/**
 * fillRosters.js
 *
 * Adds rookie players to any team whose active roster is below TARGET_ROSTER (16).
 * Run from backend/: node scripts/fillRosters.js
 */

const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const {
  generatePlayer,
  calculateSalary,
  randomInt,
  randomChoice,
  POSITIONS,
  FIELD_POSITIONS,
} = require('../seeders/generators/playerGenerator');

const TARGET_ROSTER = 16;

// Every team needs at least one player in each of these positions
const REQUIRED_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

function buildRookieForTeam(teamId, existingPitcherCount, forcePosition = null) {
  const age = randomInt(18, 22);
  const potential = randomInt(50, 85);
  const currentSkill = randomInt(15, 35);
  const growthAge = 24 + Math.floor(potential / 10);
  const marketSalary = calculateSalary(potential, currentSkill, age);
  const rookieSalary = Math.max(5000, Math.round(marketSalary / 10 / 100) * 100);

  // If a specific position is required, use it; otherwise avoid piling pitchers if already 5+
  const positionPool = existingPitcherCount >= 5 ? FIELD_POSITIONS : POSITIONS;
  const position = forcePosition ?? randomChoice(positionPool);

  return generatePlayer({
    age,
    position,
    potential_coefficient: potential,
    current_skill: currentSkill,
    growth_age: growthAge,
    salary: rookieSalary,
    rookie_contract: true,
    contract_years_remaining: randomInt(2, 4),
    status: 'active',
    team_id: teamId,
  });
}

async function main() {
  const teams = await prisma.team.findMany({
    where: { id: { not: USER_TEAM_ID } },
    select: {
      id: true,
      name: true,
      players: {
        where: { status: 'active' },
        select: { id: true, position: true },
      },
    },
    orderBy: { id: 'asc' },
  });

  let totalAdded = 0;

  for (const team of teams) {
    const activeCount = team.players.length;
    const existingPositions = new Set(team.players.map((p) => p.position));

    // Positions that have zero active players on this team
    const missingPositions = REQUIRED_POSITIONS.filter((pos) => !existingPositions.has(pos));

    // How many more to add to reach TARGET_ROSTER (after filling missing positions)
    const afterFill = activeCount + missingPositions.length;
    const extraNeeded = Math.max(0, TARGET_ROSTER - afterFill);

    if (missingPositions.length === 0 && extraNeeded === 0) {
      console.log(`  ${team.name} (id=${team.id}): ${activeCount} players — OK`);
      continue;
    }

    const rookies = [];
    let localPitcherCount = team.players.filter((p) => p.position === 'P').length;

    // First: one rookie per missing position
    for (const pos of missingPositions) {
      const rookie = buildRookieForTeam(team.id, localPitcherCount, pos);
      if (pos === 'P') localPitcherCount++;
      rookies.push(rookie);
    }

    // Then: fill up to TARGET_ROSTER with random rookies
    for (let i = 0; i < extraNeeded; i++) {
      const rookie = buildRookieForTeam(team.id, localPitcherCount);
      if (rookie.position === 'P') localPitcherCount++;
      rookies.push(rookie);
    }

    await prisma.player.createMany({ data: rookies });

    const positionLog = rookies.map((r) => r.position).join(', ');
    const details = [];
    if (missingPositions.length > 0) details.push(`missing positions: ${missingPositions.join(', ')}`);
    if (extraNeeded > 0) details.push(`${extraNeeded} extra to reach ${TARGET_ROSTER}`);

    console.log(
      `  ${team.name} (id=${team.id}): ${activeCount} players → added ${rookies.length} rookie(s) [${positionLog}] (${details.join(' + ')})`
    );
    totalAdded += rookies.length;
  }

  console.log(`\nDone. Total rookies added: ${totalAdded} (user team id=${USER_TEAM_ID} skipped)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
