/**
 * backfillPlayerSeasonRecords.js
 *
 * One-time backfill for the PlayerSeasonRecord archive: finds every season that
 * has already ended (status other than 'active'/'playoffs') and, for each one,
 * summarizes its players' batting/pitching lines into player_season_records and
 * deletes that season's now-redundant game_events/game_lineups rows (see
 * services/seasonArchiveService.js). Finishes by recalculating the Player
 * career_* counters from the combined archive + any still-live current season.
 *
 * Safe to re-run: archiving uses upsert, and a season with no game_events left
 * simply produces zero stints (no-op).
 *
 * Run from backend/: node scripts/backfillPlayerSeasonRecords.js
 */

const prisma = require('../db/prisma');
const { archiveAndCleanupSeason } = require('../services/seasonArchiveService');
const { recalculateCareerStats } = require('../services/allTimeStatsService');

async function main() {
  const pastSeasons = await prisma.season.findMany({
    where: { status: { notIn: ['active', 'playoffs'] } },
    orderBy: { id: 'asc' },
    select: { id: true, year: true, status: true },
  });

  if (pastSeasons.length === 0) {
    console.log('No hay temporadas pasadas para archivar.');
  }

  for (const season of pastSeasons) {
    const { archived } = await archiveAndCleanupSeason(season.id);
    console.log(`  Temporada ${season.year} (id=${season.id}, status=${season.status}): ${archived} registros de jugador archivados`);
  }

  console.log('Recalculando contadores de carrera...');
  await recalculateCareerStats();

  console.log(`\nDone. ${pastSeasons.length} temporada(s) procesada(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
