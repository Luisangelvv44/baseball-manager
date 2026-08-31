/**
 * runInjuryBackfill.js
 *
 * Verifica / ejecuta la red de seguridad de roster que se dispara cuando un jugador CPU se
 * lesiona: si su posicion queda sin NINGUN jugador sano, se genera un rookie para esa posicion
 * (sin cortar a nadie y sin respetar MAX_ROSTER_SIZE). Es la misma logica de
 * services/cpuTeamManagement.backfillInjuredCpuPositions que corre dentro de playGame al simular
 * un partido. El equipo del usuario esta siempre excluido.
 *
 * Correr desde backend/:
 *   node scripts/runInjuryBackfill.js                 # DRY RUN sobre las lesiones actuales de la BD
 *   node scripts/runInjuryBackfill.js --player <id>   # DRY RUN simulando que ese jugador se lesiona ahora
 *   node scripts/runInjuryBackfill.js --execute       # aplica el backfill sobre las lesiones actuales
 *
 * npm alias:
 *   npm run injury:backfill
 *   npm run injury:backfill -- --execute
 */

const prisma = require('../db/prisma');
const {
  previewInjuryBackfill,
  backfillInjuredCpuPositions,
} = require('../services/cpuTeamManagement');

const args = process.argv.slice(2);
const EXECUTE = args.some((a) => a === '--execute' || a === '--commit');
const playerFlagIdx = args.findIndex((a) => a === '--player');
const PLAYER_ID = playerFlagIdx !== -1 ? Number(args[playerFlagIdx + 1]) : null;

async function dryRun() {
  console.log('=== DRY RUN — backfill por lesión (no se escribe nada) ===\n');
  if (PLAYER_ID) console.log(`(simulando que el jugador #${PLAYER_ID} se lesiona ahora)\n`);

  const plan = await previewInjuryBackfill({
    extraInjuredPlayerIds: PLAYER_ID ? [PLAYER_ID] : [],
  });

  if (plan.length === 0) {
    console.log('Ningún equipo CPU tiene posiciones sin jugador sano, ni posiciones en riesgo.');
    return;
  }

  let genTotal = 0;
  let riskTotal = 0;
  let teamsWithGen = 0;

  for (const team of plan) {
    console.log(`#${team.teamId} ${team.teamName}`);
    for (const w of team.wouldGenerate) {
      const inj = w.injured
        .map((i) => `#${i.id} ${i.name}${i.hypothetical ? ' (hipotético)' : ` (${i.days}d)`}`)
        .join(', ');
      console.log(`  + GENERARÍA ${w.position.padEnd(3)} — posición sin jugador sano (lesionado: ${inj})`);
      genTotal += 1;
    }
    for (const v of team.vulnerable) {
      console.log(
        `  ! RIESGO    ${v.position.padEnd(3)} — solo 1 jugador sano${v.healthyId ? ` (#${v.healthyId})` : ''}, otra lesión la deja vacía`
      );
      riskTotal += 1;
    }
    if (team.wouldGenerate.length > 0) teamsWithGen += 1;
    console.log('');
  }

  console.log('--- Resumen ---');
  console.log(`Equipos CPU afectados (altas):   ${teamsWithGen}`);
  console.log(`Altas que se generarían:         ${genTotal}`);
  console.log(`Posiciones en riesgo (1 sano):   ${riskTotal}`);
  if (!PLAYER_ID) {
    console.log('\nPara aplicar sobre lesiones actuales:  node scripts/runInjuryBackfill.js --execute');
  }
}

async function execute() {
  console.log('=== EXECUTE — backfill por lesión (aplicando cambios) ===\n');

  const injured = await prisma.player.findMany({
    where: {
      injury_days_remaining: { gt: 0 },
      status: 'active',
      level: 'MAJOR',
      team: { is_user_team: false },
    },
    select: { id: true, injury_days_remaining: true },
  });

  if (injured.length === 0) {
    console.log('No hay jugadores CPU lesionados ahora mismo. Nada que hacer.');
    return;
  }

  const created = await backfillInjuredCpuPositions(
    injured.map((p) => ({ id: p.id, days: p.injury_days_remaining }))
  );

  if (created.length === 0) {
    console.log(
      `${injured.length} jugador(es) CPU lesionado(s), pero todas sus posiciones aún tienen algún jugador sano. No se generó nada.`
    );
    return;
  }

  const byTeam = new Map();
  for (const c of created) {
    if (!byTeam.has(c.teamId)) byTeam.set(c.teamId, []);
    byTeam.get(c.teamId).push(c);
  }

  for (const [teamId, list] of [...byTeam.entries()].sort((a, b) => a[0] - b[0])) {
    const size = await prisma.player.count({
      where: { team_id: teamId, status: 'active', level: 'MAJOR' },
    });
    console.log(`#${teamId} ${list[0].teamName}  (roster MAJOR activo: ${size})`);
    for (const c of list) {
      console.log(
        `  + NUEVO ROOKIE  ${c.createdPlayerName} (${c.position}) #${c.createdPlayerId} — cubre la baja de ${c.injuredPlayerName} #${c.injuredPlayerId}`
      );
    }
    console.log('');
  }

  console.log('--- Resumen ---');
  console.log(`Equipos afectados:  ${byTeam.size}`);
  console.log(`Rookies generados:  ${created.length}`);
}

(EXECUTE ? execute() : dryRun())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
