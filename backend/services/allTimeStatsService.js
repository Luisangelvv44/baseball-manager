const prisma = require('../db/prisma');
const { USER_TEAM_ID, HISTORICAL_CPU_STAT_DIVISOR } = require('../config');

// Recalcula los contadores de carrera (career_*) de Player sumando dos fuentes:
// - player_season_records: temporadas ya archivadas (ver seasonArchiveService.js),
//   cuyos game_events/game_lineups originales ya fueron borrados.
// - game_events/game_lineups/schedule en vivo: solo contienen la temporada actual
//   en curso, ya que cada temporada se archiva y limpia al terminar.
// Usado por POST /api/history/alltime/recalculate y por
// scripts/backfillPlayerSeasonRecords.js.
//
// Ajuste de ranking histórico: los CONTEOS que alimentan los rankings de carrera
// (hits, home runs, RBI, victorias, ponches) se ponderan por 1/HISTORICAL_CPU_STAT_DIVISOR
// para cada stint que NO sea del equipo del usuario. El usuario rota su rotación
// (~25 jgs por pitcher), mientras la CPU deja al mismo pitcher lanzar 90+, lo que
// inflaba los totales de carrera CPU. El "dueño" de cada logro sale del team_id por
// stint (player_season_records.team_id en lo archivado; batting_team_id / la CTE
// pitcher_games en lo vivo), NO de Player.team_id, que es NULL para los retirados y
// castigaría a las leyendas retiradas del propio usuario.
// Innings lanzados y carreras limpias NO se ponderan: la EFE de carrera y su piso
// de innings mínimos siguen siendo una tasa/umbral reales.
async function recalculateCareerStats() {
  const now = new Date();
  const DIV = HISTORICAL_CPU_STAT_DIVISOR;

  await prisma.$executeRaw`
    UPDATE "Player" p
    SET career_hits = FLOOR(COALESCE(archived.hits, 0) + COALESCE(live.hits, 0)),
        career_home_runs = FLOOR(COALESCE(archived.hr, 0) + COALESCE(live.hr, 0)),
        career_rbi = FLOOR(COALESCE(archived.rbi, 0) + COALESCE(live.rbi, 0)),
        career_stats_updated_at = ${now}
    FROM (
      SELECT player_id,
             SUM(CASE WHEN team_id = ${USER_TEAM_ID} THEN hits ELSE hits / ${DIV}::numeric END) AS hits,
             SUM(CASE WHEN team_id = ${USER_TEAM_ID} THEN home_runs ELSE home_runs / ${DIV}::numeric END) AS hr,
             SUM(CASE WHEN team_id = ${USER_TEAM_ID} THEN rbi ELSE rbi / ${DIV}::numeric END) AS rbi
      FROM player_season_records
      GROUP BY player_id
    ) archived
    FULL OUTER JOIN (
      SELECT player_id,
             SUM(CASE WHEN result IN ('1B','2B','3B','HR')
                      THEN (CASE WHEN batting_team_id = ${USER_TEAM_ID} THEN 1 ELSE 1.0 / ${DIV} END)
                      ELSE 0 END) AS hits,
             SUM(CASE WHEN result = 'HR'
                      THEN (CASE WHEN batting_team_id = ${USER_TEAM_ID} THEN 1 ELSE 1.0 / ${DIV} END)
                      ELSE 0 END) AS hr,
             COALESCE(SUM(runs_scored * CASE WHEN batting_team_id = ${USER_TEAM_ID} THEN 1 ELSE 1.0 / ${DIV} END), 0) AS rbi
      FROM game_events
      WHERE player_id IS NOT NULL
      GROUP BY player_id
    ) live ON live.player_id = archived.player_id
    WHERE p.id = COALESCE(archived.player_id, live.player_id)
  `;

  await prisma.$executeRaw`
    WITH archived_pitching AS (
      SELECT player_id,
             SUM(pitching_outs) AS outs,
             SUM(CASE WHEN team_id = ${USER_TEAM_ID} THEN pitching_strikeouts ELSE pitching_strikeouts / ${DIV}::numeric END) AS so,
             SUM(earned_runs) AS er,
             SUM(CASE WHEN team_id = ${USER_TEAM_ID} THEN wins ELSE wins / ${DIV}::numeric END) AS wins
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
             SUM(CASE WHEN ge.result = 'SO'
                      THEN (CASE WHEN pg.team_id = ${USER_TEAM_ID} THEN 1 ELSE 1.0 / ${DIV} END)
                      ELSE 0 END) AS so,
             COALESCE(SUM(ge.runs_scored), 0) AS er
      FROM pitcher_games pg
      JOIN game_events ge ON ge.game_id = pg.game_id AND ge.batting_team_id <> pg.team_id
      GROUP BY pg.player_id
    ),
    live_pitching_wins AS (
      SELECT pg.player_id,
             SUM(CASE WHEN
               (s.home_team_id = pg.team_id AND s.home_score > s.away_score) OR
               (s.away_team_id = pg.team_id AND s.away_score > s.home_score)
               THEN (CASE WHEN pg.team_id = ${USER_TEAM_ID} THEN 1 ELSE 1.0 / ${DIV} END)
               ELSE 0 END) AS wins
      FROM pitcher_games pg
      JOIN schedule s ON s.id = pg.game_id
      GROUP BY pg.player_id
    )
    UPDATE "Player" p
    SET career_wins = FLOOR(COALESCE(ap.wins, 0) + COALESCE(lpw.wins, 0)),
        career_strikeouts = FLOOR(COALESCE(ap.so, 0) + COALESCE(lp.so, 0)),
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
