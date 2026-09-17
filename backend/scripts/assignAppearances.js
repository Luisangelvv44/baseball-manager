/**
 * assignAppearances.js
 *
 * One-time backfill for PlayerAppearance (sprite look) over every Player already
 * in the DB, plus best-effort reconstruction of Player.last_team_id for players
 * that are already 'retired' in this save (retiredPlayer.js clears team_id on
 * retirement, and this feature predates that field, so existing retirees never
 * had a chance to have it captured at release/retirement time).
 *
 * last_team_id is inferred from PlayerSeasonRecord (the durable per-season/team
 * archive that survives seasonArchiveService's game_events/game_lineups cleanup):
 * the most recent stint (highest season_id, then highest first_day) with a
 * non-null team_id. Players with no season record (never played a game) are
 * left with last_team_id = null; the frontend falls back to a blank MLB jersey
 * for those, same as it does for free agents.
 *
 * Safe to re-run: only touches retired players with last_team_id still null,
 * and appearance assignment skips anyone who already has one.
 *
 * Run from backend/: node scripts/assignAppearances.js
 */

const prisma = require('../db/prisma');
const { syncMissingAppearances } = require('../services/playerAppearanceService');

async function backfillLastTeamForRetirees() {
  const retirees = await prisma.player.findMany({
    where: { status: 'retired', last_team_id: null },
    select: { id: true },
  });

  let resolved = 0;
  for (const p of retirees) {
    const lastRecord = await prisma.playerSeasonRecord.findFirst({
      where: { player_id: p.id, team_id: { not: null } },
      orderBy: [{ season_id: 'desc' }, { first_day: 'desc' }],
      select: { team_id: true },
    });
    if (!lastRecord) continue;

    await prisma.player.update({
      where: { id: p.id },
      data: { last_team_id: lastRecord.team_id },
    });
    resolved++;
  }

  console.log(`Retirados: ${retirees.length} sin last_team_id, ${resolved} reconstruidos desde su historial de temporadas.`);
}

async function main() {
  await backfillLastTeamForRetirees();

  const added = await syncMissingAppearances(prisma);
  console.log(`Apariencia asignada a ${added} jugador(es) que no tenian.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
