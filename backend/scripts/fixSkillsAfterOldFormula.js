/**
 * fixSkillsAfterOldFormula.js
 *
 * One-shot correction script: the previous season ran fluctuatePlayerSkills
 * with the old formula (+50% for young, -30% for veterans). This script
 * reverts to the intended net values:
 *   - Young  (age < growth_age): subtract round(potential_coefficient × 0.4) → net +10%
 *   - Veteran (age >= growth_age): add round(potential_coefficient × 0.2)    → net -10%
 *
 * Run from backend/: node scripts/fixSkillsAfterOldFormula.js
 */

const prisma = require('../db/prisma');

async function fixSkills() {
  const players = await prisma.player.findMany({
    where: { status: { in: ['active', 'free_agent'] } },
    select: { id: true, age: true, growth_age: true, current_skill: true, potential_coefficient: true },
  });

  let youngCount = 0;
  let veteranCount = 0;

  for (const p of players) {
    let newSkill;
    if (p.age < p.growth_age) {
      const reduction = Math.round(p.potential_coefficient * 0.4);
      newSkill = Math.max(1, p.current_skill - reduction);
      youngCount++;
    } else {
      const recovery = Math.round(p.potential_coefficient * 0.2);
      newSkill = Math.min(99, p.current_skill + recovery);
      veteranCount++;
    }
    await prisma.player.update({ where: { id: p.id }, data: { current_skill: newSkill } });
  }

  console.log(`Done. ${players.length} players updated.`);
  console.log(`  Young  (age < growth_age): ${youngCount} players → -40% of potential_coefficient`);
  console.log(`  Veteran (age >= growth_age): ${veteranCount} players → +20% of potential_coefficient`);
}

fixSkills()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
