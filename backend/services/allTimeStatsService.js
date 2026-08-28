const prisma = require('../db/prisma');

// Recalcula los contadores de carrera (career_*) de Player sumando dos fuentes:
// - player_season_records: temporadas ya archivadas (ver seasonArchiveService.js),
//   cuyos game_events/game_lineups originales ya fueron borrados.
// - game_events/game_lineups/schedule en vivo: solo contienen la temporada actual
//   en curso, ya que cada temporada se archiva y limpia al terminar.
// Usado por POST /api/history/alltime/recalculate y por
// scripts/backfillPlayerSeasonRecords.js.
async function recalculateCareerStats() {
  const now = new Date();

  await prisma.$executeRaw`
    UPDATE "Player" p
    SET career_hits = COALESCE(archived.hits, 0) + COALESCE(live.hits, 0),
        career_home_runs = COALESCE(archived.hr, 0) + COALESCE(live.hr, 0),
        career_rbi = COALESCE(archived.rbi, 0) + COALESCE(live.rbi, 0),
        career_stats_updated_at = ${now}
    FROM (
      SELECT player_id, SUM(hits) AS hits, SUM(home_runs) AS hr, SUM(rbi) AS rbi
      FROM player_season_records
      GROUP BY player_id
    ) archived
    FULL OUTER JOIN (
      SELECT player_id,
             COUNT(*) FILTER (WHERE result IN ('1B','2B','3B','HR')) AS hits,
             COUNT(*) FILTER (WHERE result = 'HR') AS hr,
             COALESCE(SUM(runs_scored), 0) AS rbi
      FROM game_events
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ) live ON live.player_id = archived.player_id
    WHERE p.id = COALESCE(archived.player_id, live.player_id)
  `;

  await prisma.$executeRaw`
    WITH archived_pitching AS (
      SELECT player_id, SUM(pitching_outs) AS outs, SUM(pitching_strikeouts) AS so,
             SUM(earned_runs) AS er, SUM(wins) AS wins
      FROM player_season_records
      WHERE pitching_games > 0
      GROUP BY player_id
    ),
    pitcher_games AS (
      SELECT DISTINCT gl.player_id, gl.game_id, gl.team_id
      FROM game_lineups gl
      WHERE gl.position = 'P'
    ),
    live_pitching AS (
      SELECT pg.player_id,
             COUNT(*) FILTER (WHERE ge.result IN ('SO','GO','FO')) AS outs,
             COUNT(*) FILTER (WHERE ge.result = 'SO') AS so,
             COALESCE(SUM(ge.runs_scored), 0) AS er
      FROM pitcher_games pg
      JOIN game_events ge ON ge.game_id = pg.game_id AND ge.batting_team_id <> pg.team_id
      GROUP BY pg.player_id
    ),
    live_pitching_wins AS (
      SELECT pg.player_id,
             COUNT(*) FILTER (WHERE
               (s.home_team_id = pg.team_id AND s.home_score > s.away_score) OR
               (s.away_team_id = pg.team_id AND s.away_score > s.home_score)
             ) AS wins
      FROM pitcher_games pg
      JOIN schedule s ON s.id = pg.game_id
      GROUP BY pg.player_id
    )
    UPDATE "Player" p
    SET career_wins = COALESCE(ap.wins, 0) + COALESCE(lpw.wins, 0),
        career_strikeouts = COALESCE(ap.so, 0) + COALESCE(lp.so, 0),
        career_innings_pitched = (COALESCE(ap.outs, 0) + COALESCE(lp.outs, 0)) / 3.0,
        career_earned_runs = COALESCE(ap.er, 0) + COALESCE(lp.er, 0),
        career_stats_updated_at = ${now}
    FROM archived_pitching ap
    FULL OUTER JOIN live_pitching lp ON lp.player_id = ap.player_id
    FULL OUTER JOIN live_pitching_wins lpw ON lpw.player_id = COALESCE(ap.player_id, lp.player_id)
    WHERE p.id = COALESCE(ap.player_id, lp.player_id, lpw.player_id)
  `;

  return { updated_at: now };
}

module.exports = { recalculateCareerStats };
