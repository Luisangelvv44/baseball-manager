const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { createNews } = require('./newsService');

function getInjuryProbability(age) {
  if (age <= 22) return 0;
  if (age >= 40) return 0.005;
  return ((age - 22) / (40 - 22)) * 0.005;
}

function randomDays() {
  return Math.floor(Math.random() * 13) + 3; // 3–15
}

async function checkAndApplyGameInjuries(homeLineup, awayLineup) {
  const playerIds = [
    homeLineup.pitcher.id,
    ...homeLineup.players.map((p) => p.id),
    awayLineup.pitcher.id,
    ...awayLineup.players.map((p) => p.id),
  ];

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds }, injury_days_remaining: 0 },
    select: { id: true, age: true },
  });

  const injuredIds = [];
  for (const player of players) {
    const prob = getInjuryProbability(player.age);
    if (prob > 0 && Math.random() < prob) {
      injuredIds.push({ id: player.id, days: randomDays() });
    }
  }

  for (const { id, days } of injuredIds) {
    await prisma.player.update({
      where: { id },
      data: { injury_days_remaining: days },
    });
  }

  return injuredIds;
}

async function processInjuryRecovery(seasonDay, seasonId) {
  const injured = await prisma.player.findMany({
    where: { injury_days_remaining: { gt: 0 } },
    select: { id: true, injury_days_remaining: true },
  });

  const toRecover = injured.filter((p) => p.injury_days_remaining <= 1).map((p) => p.id);
  const toDecrement = injured.filter((p) => p.injury_days_remaining > 1).map((p) => p.id);

  if (toRecover.length > 0) {
    if (seasonId != null) {
      const recoveredUserPlayers = await prisma.player.findMany({
        where: { id: { in: toRecover }, team_id: USER_TEAM_ID },
        select: { first_name: true, last_name: true, position: true },
      });
      for (const p of recoveredUserPlayers) {
        await createNews('injury',
          `${p.first_name} ${p.last_name} (${p.position}) volvió de su lesión`,
          seasonDay ?? 0,
          seasonId,
          { teamId: USER_TEAM_ID, alert: true }
        );
      }
    }

    await prisma.player.updateMany({
      where: { id: { in: toRecover } },
      data: { injury_days_remaining: 0 },
    });
  }

  if (toDecrement.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: toDecrement } },
      data: { injury_days_remaining: { decrement: 1 } },
    });
  }
}

async function clearAllInjuries() {
  await prisma.player.updateMany({
    where: { injury_days_remaining: { gt: 0 } },
    data: { injury_days_remaining: 0 },
  });
}

module.exports = { checkAndApplyGameInjuries, processInjuryRecovery, clearAllInjuries };
