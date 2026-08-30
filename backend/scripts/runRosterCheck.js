/**
 * runRosterCheck.js
 *
 * Runs the CPU roster-integrity check (services/cpuTeamManagement.fillMissingPositions)
 * against the CURRENT season data, on demand — the same logic that fires automatically on
 * ROSTER_CHECK_DAY.
 *
 * Run from backend/:
 *   node scripts/runRosterCheck.js              # DRY RUN: prints what would change, writes nothing
 *   node scripts/runRosterCheck.js --execute    # applies the changes for real
 *
 * npm alias:
 *   npm run roster:check
 *   npm run roster:check -- --execute
 */

const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const {
  fillMissingPositions,
  previewFillMissingPositions,
} = require('../services/cpuTeamManagement');

const EXECUTE = process.argv.slice(2).some((a) => a === '--execute' || a === '--commit');

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

async function snapshot() {
  const players = await prisma.player.findMany({
    select: {
      id: true,
      first_name: true,
      last_name: true,
      position: true,
      current_skill: true,
      status: true,
      team_id: true,
      level: true,
    },
  });
  const teams = await prisma.team.findMany({
    where: { is_user_team: false },
    select: { id: true, name: true, budget: true },
  });
  return {
    players: new Map(players.map((p) => [p.id, p])),
    teams: new Map(teams.map((t) => [t.id, t])),
  };
}

async function dryRun() {
  const plan = await previewFillMissingPositions();

  console.log('=== DRY RUN — roster check (no se escribe nada) ===\n');

  if (plan.length === 0) {
    console.log('Todos los equipos CPU tienen las 10 posiciones cubiertas. Nada que hacer.');
    return;
  }

  let adds = 0;
  let cuts = 0;
  let skips = 0;
  let penaltyTotal = 0;

  for (const team of plan) {
    console.log(
      `#${team.teamId} ${team.teamName} — ${team.activeCount} activos MAJOR, faltan: ${team.missing.join(', ')}`
    );
    for (const a of team.actions) {
      const tag = { ADD: '  + AGREGA ', CUT_AND_ADD: '  ~ CORTA+AGREGA ', SKIP: '  ! OMITE ' }[a.type];
      console.log(`${tag}${a.position.padEnd(3)} — ${a.detail}`);
      if (a.type === 'ADD') adds += 1;
      if (a.type === 'CUT_AND_ADD') {
        cuts += 1;
        adds += 1;
        penaltyTotal += a.cut.charged;
      }
      if (a.type === 'SKIP') skips += 1;
    }
    console.log('');
  }

  console.log('--- Resumen ---');
  console.log(`Equipos afectados:        ${plan.length}`);
  console.log(`Jugadores a generar:      ${adds}`);
  console.log(`Jugadores a cortar:       ${cuts}`);
  console.log(`Multas por corte (cobrado): ${money(penaltyTotal)}`);
  console.log(`Posiciones sin resolver:  ${skips}`);
  console.log('\nPara aplicar estos cambios:  node scripts/runRosterCheck.js --execute');
}

async function execute() {
  console.log('=== EXECUTE — roster check (aplicando cambios) ===\n');

  const before = await snapshot();
  await fillMissingPositions();
  const after = await snapshot();

  const createdByTeam = new Map();
  for (const [id, p] of after.players) {
    if (!before.players.has(id) && p.team_id && p.team_id !== USER_TEAM_ID) {
      if (!createdByTeam.has(p.team_id)) createdByTeam.set(p.team_id, []);
      createdByTeam.get(p.team_id).push(p);
    }
  }

  const releasedByTeam = new Map();
  for (const [id, prev] of before.players) {
    const now = after.players.get(id);
    if (!now) continue;
    const wasOnCpu = prev.team_id && prev.team_id !== USER_TEAM_ID && prev.status === 'active';
    const gone = now.team_id === null || now.status === 'free_agent';
    if (wasOnCpu && gone) {
      if (!releasedByTeam.has(prev.team_id)) releasedByTeam.set(prev.team_id, []);
      releasedByTeam.get(prev.team_id).push(prev);
    }
  }

  const touched = new Set([...createdByTeam.keys(), ...releasedByTeam.keys()]);

  if (touched.size === 0) {
    console.log('No hubo cambios: ningun equipo CPU tenia posiciones vacias.');
    return;
  }

  let createdTotal = 0;
  let releasedTotal = 0;
  let budgetDeltaTotal = 0;

  for (const teamId of [...touched].sort((a, b) => a - b)) {
    const t = after.teams.get(teamId);
    const created = createdByTeam.get(teamId) || [];
    const released = releasedByTeam.get(teamId) || [];
    const budgetDelta = Number(after.teams.get(teamId).budget) - Number(before.teams.get(teamId).budget);

    console.log(`#${teamId} ${t.name}`);
    for (const p of released) {
      console.log(`  - CORTADO  ${p.first_name} ${p.last_name} (${p.position}, skill ${p.current_skill}) #${p.id}`);
    }
    for (const p of created) {
      console.log(`  + NUEVO    ${p.first_name} ${p.last_name} (${p.position}, skill ${p.current_skill}) #${p.id}`);
    }
    if (budgetDelta !== 0) console.log(`  $ budget:  ${money(budgetDelta)}`);
    console.log('');

    createdTotal += created.length;
    releasedTotal += released.length;
    budgetDeltaTotal += budgetDelta;
  }

  console.log('--- Resumen ---');
  console.log(`Equipos afectados:   ${touched.size}`);
  console.log(`Jugadores generados: ${createdTotal}`);
  console.log(`Jugadores cortados:  ${releasedTotal}`);
  console.log(`Cambio neto budget:  ${money(budgetDeltaTotal)}`);
}

(EXECUTE ? execute() : dryRun())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
