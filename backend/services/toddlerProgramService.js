const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  TODDLER_PROGRAM_SEASONS,
  TODDLER_PROGRAM_SIZE,
  TODDLER_PROGRAM_PICKS_PER_TEAM,
  TODDLER_PROGRAM_START_AGE,
  TODDLER_PROGRAM_START_SKILL,
  TODDLER_PROGRAM_CPU_CONTRIBUTION_RATE,
  TODDLER_PROGRAM_SKILL_COST,
  TODDLER_PROGRAM_IMPROVE_PROB_START,
  TODDLER_PROGRAM_IMPROVE_PROB_STEP,
  TODDLER_PROGRAM_IMPROVE_PROB_MIN,
} = require('../config');
const { generatePlayer, calculateSalary, randomInt, POSITIONS } = require('../seeders/generators/playerGenerator');

// Probabilidad de que un intento de mejora (que cuesta TODDLER_PROGRAM_SKILL_COST se
// acierte o no) suba +1 de skill, para una temporada dada (0-indexada): 0.80 -> 0.35.
function improveProbForSeason(seasonsElapsed) {
  return Math.max(
    TODDLER_PROGRAM_IMPROVE_PROB_MIN,
    TODDLER_PROGRAM_IMPROVE_PROB_START - TODDLER_PROGRAM_IMPROVE_PROB_STEP * seasonsElapsed
  );
}

// Crea un ciclo nuevo del programa: 1 fila ToddlerProgram + TODDLER_PROGRAM_SIZE
// jugadores (status 'toddler_program', edad 8, skill -15, sin salario ni equipo).
// `client` puede ser el prisma singleton o un tx de transaccion (lo usa el seed).
async function generateToddlerCycle(client, cycleNumber) {
  const program = await client.toddlerProgram.create({
    data: { cycle_number: cycleNumber, seasons_elapsed: 0, budget: 0, status: 'active', current_pick: 1 },
  });

  const toddlers = [];
  for (let i = 0; i < TODDLER_PROGRAM_SIZE; i++) {
    const base = generatePlayer({
      position: POSITIONS[i % POSITIONS.length],
      age: TODDLER_PROGRAM_START_AGE,
      current_skill: TODDLER_PROGRAM_START_SKILL,
      salary: 0,
      contract_years_remaining: 0,
      rookie_contract: false,
      status: 'toddler_program',
      team_id: null,
    });
    toddlers.push({ ...base, level: 'MINOR', toddler_program_id: program.id });
  }
  await client.player.createMany({ data: toddlers });

  return program;
}

// Materializa un toddler ya elegido como jugador MINOR del equipo (contrato de novato,
// salario ~1/10 del valor de mercado). Conserva age/position/skill/potential ya crecidos.
// toddler_program_id se limpia al completar toda la eleccion (ver finalizeSelection).
async function assignToddlerToTeam(client, player, teamId) {
  const rookieSalary = Math.max(
    5000,
    Math.round(calculateSalary(player.potential_coefficient, player.current_skill, player.age) / 10 / 100) * 100
  );
  return client.player.update({
    where: { id: player.id },
    data: {
      team_id: teamId,
      status: 'active',
      level: 'MINOR',
      rookie_contract: true,
      rookie_seasons: 0,
      contract_years_remaining: randomInt(2, 4),
      salary: rookieSalary,
    },
  });
}

async function finalizeSelection(client, programId) {
  await client.toddlerProgram.update({ where: { id: programId }, data: { status: 'completed' } });
  await client.player.updateMany({ where: { toddler_program_id: programId }, data: { toddler_program_id: null } });
}

// Elige el mejor toddler disponible para `teamId`: mayor skill, con un ligero sesgo a
// una posicion donde el equipo tenga menos de 2 jugadores activos. Lo asigna al equipo.
async function pickBestForTeam(client, program, teamId) {
  const available = await client.player.findMany({
    where: { toddler_program_id: program.id, status: 'toddler_program', team_id: null },
    orderBy: [{ current_skill: 'desc' }, { id: 'asc' }],
  });
  if (available.length === 0) return null;

  const roster = await client.player.findMany({
    where: { team_id: teamId, status: 'active' },
    select: { position: true },
  });
  const counts = {};
  for (const r of roster) counts[r.position] = (counts[r.position] || 0) + 1;
  const need = POSITIONS.find((p) => (counts[p] || 0) < 2);
  const chosen = (need && available.find((a) => a.position === need)) || available[0];

  await assignToddlerToTeam(client, chosen, teamId);
  return chosen;
}

// Avanza UN pick de la ronda de eleccion. Con { allowUser: false } se detiene y
// devuelve { isUserTurn: true } cuando el turno es del equipo del usuario; con
// { allowUser: true } (red de seguridad) elige tambien por el usuario.
async function advanceOnePick(client, program, { allowUser } = {}) {
  const order = program.pick_order || [];
  if (program.status !== 'selecting' || program.current_pick > order.length) {
    return { complete: true };
  }

  const teamId = order[program.current_pick - 1];
  if (!allowUser && teamId === USER_TEAM_ID) return { isUserTurn: true };

  const picked = await pickBestForTeam(client, program, teamId);
  const nextPick = program.current_pick + 1;
  const complete = nextPick > order.length || !picked;

  await client.toddlerProgram.update({ where: { id: program.id }, data: { current_pick: nextPick } });
  if (complete) await finalizeSelection(client, program.id);

  return { picked, complete, isUserTurn: false };
}

// Pick del usuario: valida turno y disponibilidad, asigna el toddler y avanza.
async function userPickToddler(client, program, playerId) {
  const order = program.pick_order || [];
  if (program.status !== 'selecting') throw new Error('El programa no esta en fase de eleccion');
  if (program.current_pick > order.length) throw new Error('La eleccion ya termino');
  if (order[program.current_pick - 1] !== USER_TEAM_ID) throw new Error('No es el turno de tu equipo');

  const toddler = await client.player.findFirst({
    where: { id: playerId, toddler_program_id: program.id, status: 'toddler_program', team_id: null },
  });
  if (!toddler) throw new Error('Ese toddler ya no esta disponible');

  await assignToddlerToTeam(client, toddler, USER_TEAM_ID);
  const nextPick = program.current_pick + 1;
  const complete = nextPick > order.length;

  await client.toddlerProgram.update({ where: { id: program.id }, data: { current_pick: nextPick } });
  if (complete) await finalizeSelection(client, program.id);

  return { player: toddler, complete };
}

// Congela el orden de eleccion por total aportado (desc, desempate por team_id) y lo
// expande a TODDLER_PROGRAM_SIZE entradas (cada equipo repetido PICKS_PER_TEAM veces).
async function buildPickOrder(client, programId) {
  const contribs = await client.toddlerContribution.findMany({
    where: { program_id: programId },
    orderBy: [{ amount: 'desc' }, { team_id: 'asc' }],
  });
  const allTeams = await client.team.findMany({ select: { id: true }, orderBy: { id: 'asc' } });
  const ranked = [
    ...contribs.map((c) => c.team_id),
    ...allTeams.map((t) => t.id).filter((id) => !contribs.some((c) => c.team_id === id)),
  ];

  const pickOrder = [];
  for (const teamId of ranked) {
    for (let i = 0; i < TODDLER_PROGRAM_PICKS_PER_TEAM; i++) pickOrder.push(teamId);
  }
  return pickOrder;
}

// Gasta dinero del pool en rondas de mejora hasta quedar en (o por debajo de) la mitad
// del presupuesto con que se entro. Una ronda = una pasada por los 32 toddlers en orden;
// cada intento cuesta TODDLER_PROGRAM_SKILL_COST se acierte o no. Devuelve el sobrante.
function runImprovementRounds(startBudget, toddlerIds, prob) {
  const threshold = startBudget / 2;
  let remaining = startBudget;
  const gains = new Map();

  while (remaining - TODDLER_PROGRAM_SKILL_COST >= threshold) {
    for (const id of toddlerIds) {
      if (remaining - TODDLER_PROGRAM_SKILL_COST < threshold) break;
      remaining -= TODDLER_PROGRAM_SKILL_COST;
      if (Math.random() < prob) gains.set(id, (gains.get(id) || 0) + 1);
    }
  }

  return { remaining, gains };
}

// Punto de entrada unico, se llama una vez por temporada desde endOfSeasonCleanup.
async function runToddlerProgramSeasonEnd() {
  // 1. Red de seguridad: si quedo una eleccion sin terminar de un ciclo anterior,
  //    se resuelve automaticamente (elige la CPU tambien por el usuario).
  let lingering = await prisma.toddlerProgram.findFirst({ where: { status: 'selecting' }, orderBy: { id: 'desc' } });
  while (lingering && lingering.status === 'selecting' && lingering.current_pick <= (lingering.pick_order || []).length) {
    await advanceOnePick(prisma, lingering, { allowUser: true });
    lingering = await prisma.toddlerProgram.findUnique({ where: { id: lingering.id } });
  }

  // 2. Ciclo activo
  const program = await prisma.toddlerProgram.findFirst({ where: { status: 'active' }, orderBy: { id: 'desc' } });
  if (!program) return;

  // 3. Aporte automatico del 5% de cada equipo CPU (el usuario aporta manual via ruta)
  const cpuTeams = await prisma.team.findMany({ where: { is_user_team: false }, select: { id: true, budget: true } });
  let pooled = 0;
  for (const t of cpuTeams) {
    const contribution = Math.round(Number(t.budget) * TODDLER_PROGRAM_CPU_CONTRIBUTION_RATE);
    if (contribution <= 0) continue;
    await prisma.team.update({ where: { id: t.id }, data: { budget: { decrement: contribution } } });
    await prisma.toddlerContribution.upsert({
      where: { program_id_team_id: { program_id: program.id, team_id: t.id } },
      create: { program_id: program.id, team_id: t.id, amount: contribution },
      update: { amount: { increment: contribution } },
    });
    pooled += contribution;
  }
  let budget = Number(program.budget) + pooled;

  // 4. Rondas de mejora (gasta hasta la mitad del presupuesto de este anio)
  const toddlers = await prisma.player.findMany({
    where: { toddler_program_id: program.id, status: 'toddler_program' },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  if (toddlers.length > 0 && budget >= TODDLER_PROGRAM_SKILL_COST) {
    const prob = improveProbForSeason(program.seasons_elapsed);
    const { remaining, gains } = runImprovementRounds(budget, toddlers.map((t) => t.id), prob);
    for (const [id, pts] of gains) {
      await prisma.player.update({ where: { id }, data: { current_skill: { increment: pts } } });
    }
    budget = remaining;
  }

  // 5. Persiste el sobrante y avanza el contador de temporadas del ciclo
  const seasonsElapsed = program.seasons_elapsed + 1;
  await prisma.toddlerProgram.update({
    where: { id: program.id },
    data: { budget, seasons_elapsed: seasonsElapsed },
  });

  // 6. Madurez: a las 10 temporadas se congela el orden y arranca el siguiente ciclo
  if (seasonsElapsed >= TODDLER_PROGRAM_SEASONS) {
    const pickOrder = await buildPickOrder(prisma, program.id);
    await prisma.toddlerProgram.update({
      where: { id: program.id },
      data: { status: 'selecting', pick_order: pickOrder, current_pick: 1 },
    });
    await generateToddlerCycle(prisma, program.cycle_number + 1);
  }
}

module.exports = {
  generateToddlerCycle,
  runToddlerProgramSeasonEnd,
  advanceOnePick,
  userPickToddler,
  improveProbForSeason,
  runImprovementRounds,
  buildPickOrder,
};
