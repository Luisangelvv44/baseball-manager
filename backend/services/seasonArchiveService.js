const prisma = require('../db/prisma');
const { computeSeasonStintRecords } = require('./statsService');

// Congela el resumen de bateo/pitcheo de cada jugador de una temporada ya
// terminada en PlayerSeasonRecord, y borra los game_events/game_lineups de
// esa temporada para no acumular filas juego a juego indefinidamente.
// Se llama una vez al coronar campeón (ver endOfSeasonCleanup en routes/season.js)
// y también desde scripts/backfillPlayerSeasonRecords.js para temporadas pasadas
// que quedaron sin archivar. Usa upsert, por lo que es seguro volver a llamarla
// para una temporada ya archivada (no duplica ni pierde datos).
async function archiveAndCleanupSeason(seasonId) {
  const season = await prisma.season.findUnique({ where: { id: seasonId }, select: { id: true, year: true } });
  if (!season) return { archived: 0 };

  const stints = await computeSeasonStintRecords(seasonId);

  const games = await prisma.gameSchedule.findMany({ where: { season_id: seasonId }, select: { id: true } });
  const gameIds = games.map((g) => g.id);

  await prisma.$transaction([
    ...stints.map((s) =>
      prisma.playerSeasonRecord.upsert({
        where: { season_id_team_id_player_id: { season_id: seasonId, team_id: s.team_id, player_id: s.player_id } },
        create: {
          season_id: seasonId,
          year: season.year,
          team_id: s.team_id,
          player_id: s.player_id,
          first_day: s.first_day,
          games: s.batting.games,
          at_bats: s.batting.at_bats,
          hits: s.batting.hits,
          home_runs: s.batting.home_runs,
          walks: s.batting.walks,
          strikeouts: s.batting.strikeouts,
          rbi: s.batting.rbi,
          pitching_games: s.pitching?.games ?? 0,
          pitching_outs: s.pitching?.outs ?? 0,
          earned_runs: s.pitching?.earned_runs ?? 0,
          pitching_strikeouts: s.pitching?.strikeouts ?? 0,
          pitching_walks: s.pitching?.walks ?? 0,
          hits_allowed: s.pitching?.hits_allowed ?? 0,
          wins: s.pitching?.wins ?? 0,
          losses: s.pitching?.losses ?? 0,
        },
        update: {
          first_day: s.first_day,
          games: s.batting.games,
          at_bats: s.batting.at_bats,
          hits: s.batting.hits,
          home_runs: s.batting.home_runs,
          walks: s.batting.walks,
          strikeouts: s.batting.strikeouts,
          rbi: s.batting.rbi,
          pitching_games: s.pitching?.games ?? 0,
          pitching_outs: s.pitching?.outs ?? 0,
          earned_runs: s.pitching?.earned_runs ?? 0,
          pitching_strikeouts: s.pitching?.strikeouts ?? 0,
          pitching_walks: s.pitching?.walks ?? 0,
          hits_allowed: s.pitching?.hits_allowed ?? 0,
          wins: s.pitching?.wins ?? 0,
          losses: s.pitching?.losses ?? 0,
        },
      })
    ),
    prisma.gameEvent.deleteMany({ where: { game_id: { in: gameIds } } }),
    prisma.gameLineup.deleteMany({ where: { game_id: { in: gameIds } } }),
  ]);

  return { archived: stints.length };
}

module.exports = { archiveAndCleanupSeason };
