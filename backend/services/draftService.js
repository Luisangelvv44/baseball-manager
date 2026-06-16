const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { FIRST_NAMES, LAST_NAMES } = require('../seeders/data/names');
const { calculateSalary, calculateGrowthAge, randomInt, randomChoice, POSITIONS } = require('../seeders/generators/playerGenerator');

const PROSPECTS_PER_TEAM = 3;

function generateProspect(draftId, index) {
  // Earlier picks (lower index) get higher quality prospects
  const qualityBonus = Math.max(0, 30 - Math.floor(index / 2));
  const age = randomInt(18, 21);
  const potential = randomInt(50 + Math.floor(qualityBonus / 2), Math.min(99, 70 + qualityBonus));
  const growthAge = calculateGrowthAge(potential);
  const currentSkill = randomInt(15, 35 + Math.floor(qualityBonus / 3));
  const position = randomChoice(POSITIONS);
  const name = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;

  return { draft_id: draftId, name, position, age, current_skill: currentSkill, potential_coefficient: potential, growth_age: growthAge };
}

async function createDraft(seasonId) {
  // Order teams by wins ASC (worst first), champion (most wins in playoffs) last
  const teams = await prisma.team.findMany({ orderBy: { wins: 'asc' }, select: { id: true, wins: true } });
  const pickOrder = teams.map((t) => t.id);

  const draft = await prisma.draft.create({
    data: { season_id: seasonId, status: 'active', current_pick: 1, pick_order: pickOrder },
  });

  const totalProspects = teams.length * PROSPECTS_PER_TEAM;
  const prospectData = Array.from({ length: totalProspects }, (_, i) => generateProspect(draft.id, i));
  await prisma.draftProspect.createMany({ data: prospectData });

  return draft;
}

// Advance one CPU pick (returns true if pick made, false if it's user's turn, null if draft done)
async function advanceCpuPick(draftId) {
  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { prospects: { where: { picked_by_team_id: null }, orderBy: { current_skill: 'desc' } } },
  });

  if (!draft || draft.status === 'completed') return null;

  const pickOrder = draft.pick_order;
  if (draft.current_pick > pickOrder.length) {
    await prisma.draft.update({ where: { id: draftId }, data: { status: 'completed' } });
    return null;
  }

  const currentTeamId = pickOrder[draft.current_pick - 1];
  if (currentTeamId === USER_TEAM_ID) return false; // user must pick

  const available = draft.prospects;
  if (available.length === 0) {
    await prisma.draft.update({ where: { id: draftId }, data: { status: 'completed' } });
    return null;
  }

  // CPU picks by position need
  const roster = await prisma.player.findMany({
    where: { team_id: currentTeamId, status: 'active' },
    select: { position: true },
  });
  const positionCounts = {};
  for (const p of roster) {
    positionCounts[p.position] = (positionCounts[p.position] || 0) + 1;
  }

  // Find most needed position
  let chosen = null;
  const allPositions = POSITIONS;
  const neededPos = allPositions.find((pos) => !positionCounts[pos] || positionCounts[pos] < 2);
  if (neededPos) {
    chosen = available.find((p) => p.position === neededPos) || available[0];
  } else {
    chosen = available[0]; // best available
  }

  await prisma.draftProspect.update({
    where: { id: chosen.id },
    data: { picked_by_team_id: currentTeamId, pick_number: draft.current_pick },
  });

  // Convert to player on CPU team
  const rookieSalary = Math.max(5000, Math.round(calculateSalary(chosen.potential_coefficient, chosen.current_skill, chosen.age) / 10 / 100) * 100);
  await prisma.player.create({
    data: {
      first_name: chosen.name.split(' ')[0],
      last_name: chosen.name.split(' ').slice(1).join(' '),
      age: chosen.age,
      position: chosen.position,
      potential_coefficient: chosen.potential_coefficient,
      growth_age: chosen.growth_age,
      current_skill: chosen.current_skill,
      salary: rookieSalary,
      contract_years_remaining: randomInt(2, 4),
      rookie_contract: true,
      team_id: currentTeamId,
      status: 'active',
    },
  });

  const newPick = draft.current_pick + 1;
  const isDone = newPick > pickOrder.length;
  await prisma.draft.update({
    where: { id: draftId },
    data: { current_pick: newPick, status: isDone ? 'completed' : 'active' },
  });

  return true;
}

// User makes their pick
async function userPick(draftId, prospectId) {
  const draft = await prisma.draft.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== 'active') throw new Error('Draft no activo');

  const pickOrder = draft.pick_order;
  if (draft.current_pick > pickOrder.length) throw new Error('El draft ya terminó');

  const currentTeamId = pickOrder[draft.current_pick - 1];
  if (currentTeamId !== USER_TEAM_ID) throw new Error('No es el turno del usuario');

  const prospect = await prisma.draftProspect.findFirst({
    where: { id: prospectId, draft_id: draftId, picked_by_team_id: null },
  });
  if (!prospect) throw new Error('Prospecto no disponible');

  await prisma.draftProspect.update({
    where: { id: prospectId },
    data: { picked_by_team_id: USER_TEAM_ID, pick_number: draft.current_pick },
  });

  const rookieSalary = Math.max(5000, Math.round(calculateSalary(prospect.potential_coefficient, prospect.current_skill, prospect.age) / 10 / 100) * 100);
  const newPlayer = await prisma.player.create({
    data: {
      first_name: prospect.name.split(' ')[0],
      last_name: prospect.name.split(' ').slice(1).join(' '),
      age: prospect.age,
      position: prospect.position,
      potential_coefficient: prospect.potential_coefficient,
      growth_age: prospect.growth_age,
      current_skill: prospect.current_skill,
      salary: rookieSalary,
      contract_years_remaining: randomInt(2, 4),
      rookie_contract: true,
      team_id: USER_TEAM_ID,
      status: 'active',
    },
  });

  const newPick = draft.current_pick + 1;
  const isDone = newPick > pickOrder.length;
  await prisma.draft.update({
    where: { id: draftId },
    data: { current_pick: newPick, status: isDone ? 'completed' : 'active' },
  });

  return { player: newPlayer, draftComplete: isDone };
}

module.exports = { createDraft, advanceCpuPick, userPick };
