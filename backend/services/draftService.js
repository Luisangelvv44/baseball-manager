const prisma = require('../db/prisma');
const { USER_TEAM_ID, DRAFT_POOL_SIZE, MARKET_PLAYER_CAP } = require('../config');
const { FIRST_NAMES, LAST_NAMES } = require('../seeders/data/names');
const { calculateSalary, calculateGrowthAge, randomInt, randomChoice, POSITIONS } = require('../seeders/generators/playerGenerator');

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

// Selecciona hasta `count` jugadores del mercado para completar el pool del draft:
// primero rookies vigentes (rookie_contract=true), y si no alcanzan, agentes libres de 18-22 anios.
async function selectMarketRookies(count) {
  if (count <= 0) return [];

  const rookieContractPlayers = await prisma.player.findMany({
    where: { status: 'free_agent', rookie_contract: true },
    orderBy: { potential_coefficient: 'desc' },
    take: count,
  });
  if (rookieContractPlayers.length >= count) return rookieContractPlayers;

  const remaining = count - rookieContractPlayers.length;
  const ageFallback = await prisma.player.findMany({
    where: {
      status: 'free_agent',
      age: { gte: 18, lte: 22 },
      id: { notIn: rookieContractPlayers.map((p) => p.id) },
    },
    orderBy: { potential_coefficient: 'desc' },
    take: remaining,
  });

  return [...rookieContractPlayers, ...ageFallback];
}

async function createDraft(seasonId) {
  // Order teams by wins ASC (worst first), champion (most wins in playoffs) last
  const teams = await prisma.team.findMany({ orderBy: { wins: 'asc' }, select: { id: true, wins: true } });
  const pickOrder = teams.map((t) => t.id);

  // Combina prospectos nuevos con rookies sacados del mercado para no superar MARKET_PLAYER_CAP
  const marketCount = await prisma.player.count({ where: { status: 'free_agent' } });
  const newCount = Math.min(DRAFT_POOL_SIZE, Math.max(0, MARKET_PLAYER_CAP - marketCount));
  const pulledCount = DRAFT_POOL_SIZE - newCount;
  const pulledPlayers = await selectMarketRookies(pulledCount);

  if (pulledPlayers.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: pulledPlayers.map((p) => p.id) } },
      data: { status: 'draft_reserved' },
    });
  }

  const draft = await prisma.draft.create({
    data: { season_id: seasonId, status: 'active', current_pick: 1, pick_order: pickOrder },
  });

  const newProspects = Array.from({ length: newCount }, (_, i) => generateProspect(draft.id, i));
  const pulledProspects = pulledPlayers.map((p) => ({
    draft_id: draft.id,
    name: `${p.first_name} ${p.last_name}`,
    position: p.position,
    age: p.age,
    current_skill: p.current_skill,
    potential_coefficient: p.potential_coefficient,
    growth_age: p.growth_age,
    source_player_id: p.id,
  }));
  await prisma.draftProspect.createMany({ data: [...newProspects, ...pulledProspects] });

  return draft;
}

// Materializa un prospecto elegido en un Player activo del equipo que lo draftea.
// Si el prospecto viene del mercado (source_player_id), actualiza ese Player existente
// en vez de crear uno nuevo, conservando su age/position/skills ya generados.
async function draftPickPlayer(prospect, teamId) {
  const rookieSalary = Math.max(5000, Math.round(
    calculateSalary(prospect.potential_coefficient, prospect.current_skill, prospect.age) / 10 / 100
  ) * 100);

  if (prospect.source_player_id) {
    return prisma.player.update({
      where: { id: prospect.source_player_id },
      data: {
        team_id: teamId,
        status: 'active',
        rookie_contract: true,
        salary: rookieSalary,
        contract_years_remaining: randomInt(2, 4),
      },
    });
  }

  return prisma.player.create({
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
      team_id: teamId,
      status: 'active',
    },
  });
}

// Al cerrar el draft: los prospectos no elegidos regulan el mercado.
// Los que venian de un Player existente (source_player_id) simplemente vuelven a free_agent.
// Los generados nuevos se materializan por primera vez como free_agent.
async function finalizeDraft(draftId) {
  const undrafted = await prisma.draftProspect.findMany({
    where: { draft_id: draftId, picked_by_team_id: null },
  });
  if (undrafted.length === 0) return;

  const pulledIds = undrafted.filter((p) => p.source_player_id).map((p) => p.source_player_id);
  const newOnes = undrafted.filter((p) => !p.source_player_id);

  if (pulledIds.length > 0) {
    await prisma.player.updateMany({
      where: { id: { in: pulledIds } },
      data: { status: 'free_agent' },
    });
  }

  if (newOnes.length > 0) {
    const playersData = newOnes.map((p) => ({
      first_name: p.name.split(' ')[0],
      last_name: p.name.split(' ').slice(1).join(' '),
      age: p.age,
      position: p.position,
      potential_coefficient: p.potential_coefficient,
      growth_age: p.growth_age,
      current_skill: p.current_skill,
      salary: calculateSalary(p.potential_coefficient, p.current_skill, p.age),
      contract_years_remaining: randomInt(1, 4),
      rookie_contract: false,
      team_id: null,
      status: 'free_agent',
    }));
    await prisma.player.createMany({ data: playersData });
  }
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
    await finalizeDraft(draftId);
    return null;
  }

  const currentTeamId = pickOrder[draft.current_pick - 1];
  if (currentTeamId === USER_TEAM_ID) return false; // user must pick

  const available = draft.prospects;
  if (available.length === 0) {
    await prisma.draft.update({ where: { id: draftId }, data: { status: 'completed' } });
    await finalizeDraft(draftId);
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

  await draftPickPlayer(chosen, currentTeamId);

  const newPick = draft.current_pick + 1;
  const isDone = newPick > pickOrder.length;
  await prisma.draft.update({
    where: { id: draftId },
    data: { current_pick: newPick, status: isDone ? 'completed' : 'active' },
  });
  if (isDone) await finalizeDraft(draftId);

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

  const newPlayer = await draftPickPlayer(prospect, USER_TEAM_ID);

  const newPick = draft.current_pick + 1;
  const isDone = newPick > pickOrder.length;
  await prisma.draft.update({
    where: { id: draftId },
    data: { current_pick: newPick, status: isDone ? 'completed' : 'active' },
  });
  if (isDone) await finalizeDraft(draftId);

  return { player: newPlayer, draftComplete: isDone };
}

module.exports = { createDraft, advanceCpuPick, userPick };
