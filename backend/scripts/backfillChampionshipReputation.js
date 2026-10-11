/**
 * backfillChampionshipReputation.js
 *
 * Reputacion retroactiva por resultados de playoffs de temporadas ANTERIORES a la actual
 * (la temporada actual, la de mayor id, no se toca):
 *   - Campeon:    +50 (5 clasificar + 10 semis + 15 final + 20 campeon)
 *   - Subcampeon: +30 (5 clasificar + 10 semis + 15 final)
 * El resultado se limita con clampReputation (1 - 10 000).
 *
 * NO es idempotente: correrlo dos veces con --execute suma dos veces.
 *
 * Run from backend/:
 *   node scripts/backfillChampionshipReputation.js              # DRY RUN: muestra los cambios, no escribe nada
 *   node scripts/backfillChampionshipReputation.js --execute    # aplica los cambios
 *
 * npm alias:
 *   npm run reputation:backfill
 *   npm run reputation:backfill -- --execute
 */

const prisma = require('../db/prisma');
const { clampReputation } = require('../services/reputationService');

const CHAMPION_REP = 50;
const RUNNER_UP_REP = 30;

const EXECUTE = process.argv.slice(2).some((a) => a === '--execute' || a === '--commit');

async function buildPlan() {
  const seasons = await prisma.season.findMany({ orderBy: { id: 'asc' }, select: { id: true } });
  if (seasons.length === 0) return { currentEdition: null, rows: [], teams: [], gains: new Map() };

  const currentSeasonId = seasons[seasons.length - 1].id;
  const pastSeasons = seasons.slice(0, -1).map((s, i) => ({ id: s.id, edition: i + 1 }));
  const pastIds = pastSeasons.map((s) => s.id);

  const [teams, records, finals] = await Promise.all([
    prisma.team.findMany({ select: { id: true, name: true, reputation: true }, orderBy: { id: 'asc' } }),
    prisma.seasonRecord.findMany({ where: { season_id: { in: pastIds } }, select: { season_id: true, champion_name: true } }),
    prisma.playoffSeries.findMany({
      where: { season_id: { in: pastIds }, round: 3 },
      select: { season_id: true, home_team_id: true, away_team_id: true, winner_id: true },
    }),
  ]);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const recordBySeason = new Map(records.map((r) => [r.season_id, r]));
  const finalBySeason = new Map(finals.map((f) => [f.season_id, f]));

  const gains = new Map(); // team_id -> { champ, runner, total }
  const add = (teamId, kind, points) => {
    const g = gains.get(teamId) || { champ: 0, runner: 0, total: 0 };
    g[kind] += 1;
    g.total += points;
    gains.set(teamId, g);
  };

  const rows = [];
  for (const s of pastSeasons) {
    const final = finalBySeason.get(s.id);
    const record = recordBySeason.get(s.id);
    let champion = null;
    let runnerUp = null;
    const notes = [];

    if (final && final.winner_id) {
      champion = teamById.get(final.winner_id) || null;
      const loserId = final.winner_id === final.home_team_id ? final.away_team_id : final.home_team_id;
      runnerUp = teamById.get(loserId) || null;
    } else if (record?.champion_name) {
      champion = teamByName.get(record.champion_name) || null;
      if (!champion) notes.push(`campeon "${record.champion_name}" no coincide con ningun equipo`);
      notes.push('sin final registrada: no hay subcampeon');
    } else {
      notes.push('sin campeon registrado');
    }

    if (champion) add(champion.id, 'champ', CHAMPION_REP);
    if (runnerUp) add(runnerUp.id, 'runner', RUNNER_UP_REP);
    rows.push({ edition: s.edition, champion, runnerUp, notes });
  }

  return { currentEdition: seasons.length, rows, teams, gains };
}

function printPlan({ currentEdition, rows, teams, gains }) {
  console.log(`Temporada actual: #${currentEdition} (no se toca)\n`);
  console.log('--- Por temporada ---');
  for (const r of rows) {
    const champ = r.champion ? `${r.champion.name} (+${CHAMPION_REP})` : '-';
    const runner = r.runnerUp ? `${r.runnerUp.name} (+${RUNNER_UP_REP})` : '-';
    const notes = r.notes.length ? `  [${r.notes.join('; ')}]` : '';
    console.log(`#${String(r.edition).padEnd(3)} Campeon: ${champ.padEnd(32)} Subcampeon: ${runner}${notes}`);
  }

  console.log('\n--- Por equipo ---');
  for (const t of teams) {
    const g = gains.get(t.id);
    if (!g) continue;
    const next = clampReputation(t.reputation + g.total);
    console.log(
      `#${String(t.id).padEnd(3)} ${t.name.padEnd(28)} ${g.champ} titulos, ${g.runner} subcampeonatos: ` +
      `${t.reputation} -> ${next} (+${next - t.reputation})`
    );
  }
}

async function main() {
  const plan = await buildPlan();
  console.log(EXECUTE
    ? '=== EXECUTE — reputacion por campeonatos (aplicando cambios) ===\n'
    : '=== DRY RUN — reputacion por campeonatos (no se escribe nada) ===\n');

  if (plan.rows.length === 0) {
    console.log('No hay temporadas anteriores a la actual. Nada que hacer.');
    return;
  }
  printPlan(plan);

  if (!EXECUTE) {
    console.log('\nPara aplicar estos cambios:  node scripts/backfillChampionshipReputation.js --execute');
    return;
  }

  const updates = plan.teams
    .filter((t) => plan.gains.has(t.id))
    .map((t) => prisma.team.update({
      where: { id: t.id },
      data: { reputation: clampReputation(t.reputation + plan.gains.get(t.id).total) },
    }));
  await prisma.$transaction(updates);
  console.log(`\nListo: ${updates.length} equipos actualizados. No vuelvas a correr --execute (sumaria otra vez).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
