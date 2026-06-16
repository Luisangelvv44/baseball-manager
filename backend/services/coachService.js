const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

const MAX_COACHES = 3;

// Applied at end-of-season after fluctuatePlayerSkills
async function applyCoachBonuses() {
  const coaches = await prisma.coach.findMany({
    where: { team_id: USER_TEAM_ID, assigned_player_id: { not: null } },
    include: { assigned_player: true },
  });

  for (const coach of coaches) {
    const player = coach.assigned_player;
    if (!player || player.status !== 'active') continue;

    if (coach.specialty === 'BATTING' || coach.specialty === 'PITCHING') {
      const bonus = Math.round(coach.skill_level / 30); // 2-3 pts/year
      const newSkill = Math.min(99, player.current_skill + bonus);
      await prisma.player.update({ where: { id: player.id }, data: { current_skill: newSkill } });
    } else if (coach.specialty === 'CONDITIONING') {
      // Reduce decline by 40% for players past growth_age
      if (player.age >= player.growth_age) {
        const normalDecline = Math.round(player.potential_coefficient * 0.3);
        const reducedDecline = Math.round(player.potential_coefficient * 0.3 * 0.6);
        const recovery = normalDecline - reducedDecline;
        if (recovery > 0) {
          const newSkill = Math.min(99, player.current_skill + recovery);
          await prisma.player.update({ where: { id: player.id }, data: { current_skill: newSkill } });
        }
      }
    }
  }
}

async function deductCoachSalaries(seasonDay) {
  const coaches = await prisma.coach.findMany({ where: { team_id: USER_TEAM_ID } });
  const total = coaches.reduce((s, c) => s + c.salary, 0);
  if (total === 0) return 0;

  await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { budget: { decrement: total } } });
  await prisma.finance.create({
    data: {
      team_id: USER_TEAM_ID,
      season_day: seasonDay,
      type: 'salaries',
      amount: -total,
      description: `Salarios de cuerpo técnico (${coaches.length} coaches)`,
    },
  });
  return total;
}

module.exports = { applyCoachBonuses, deductCoachSalaries, MAX_COACHES };
