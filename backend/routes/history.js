const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { SEASON_AWARD_MIN_IP } = require('../config');

// GET /api/history/champions -> cantidad de campeonatos ganados por cada equipo
router.get('/champions', async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const records = await prisma.seasonRecord.findMany({
      where: { champion_name: { not: null } },
      select: { champion_name: true },
    });

    const counts = {};
    for (const r of records) {
      counts[r.champion_name] = (counts[r.champion_name] || 0) + 1;
    }

    const result = teams
      .map((t) => ({ team_id: t.id, name: t.name, championships: counts[t.name] || 0 }))
      .sort((a, b) => b.championships - a.championships || a.name.localeCompare(b.name));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el historial de campeonatos' });
  }
});

// GET /api/history/seasons -> una entrada por temporada finalizada, para la vista de tarjetas
router.get('/seasons', async (req, res) => {
  try {
    const records = await prisma.seasonRecord.findMany({
      orderBy: { season_id: 'desc' },
    });

    const seasonIds = records.map((r) => r.season_id);
    const finals = await prisma.playoffSeries.findMany({
      where: { season_id: { in: seasonIds }, round: 3 },
      include: {
        home_team: { select: { name: true } },
        away_team: { select: { name: true } },
      },
    });
    const finalsBySeasonId = Object.fromEntries(finals.map((f) => [f.season_id, f]));

    const result = records.map((r) => {
      const standingsArr = Array.isArray(r.standings) ? r.standings : [];
      const championEntry = standingsArr.find((s) => s.name === r.champion_name);
      const final = finalsBySeasonId[r.season_id];
      let runnerUp = null;
      if (final) {
        runnerUp = final.winner_id === final.home_team_id ? final.away_team.name : final.home_team.name;
      }

      return {
        id: r.id,
        season_id: r.season_id,
        year: r.year,
        champion_name: r.champion_name,
        champion_wins: championEntry?.wins ?? null,
        champion_losses: championEntry?.losses ?? null,
        champion_division: championEntry?.division ?? null,
        runner_up: runnerUp,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el historial de temporadas' });
  }
});

// GET /api/history/alltime -> ranking historico de bateadores (activos y retirados)
router.get('/alltime', async (req, res) => {
  try {
    const players = await prisma.player.findMany({
      where: { position: { not: 'P' } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        status: true,
        career_home_runs: true,
        career_hits: true,
        career_rbi: true,
        career_stats_updated_at: true,
      },
    });

    const last_calculated = players.reduce((max, p) => {
      if (!p.career_stats_updated_at) return max;
      if (!max || p.career_stats_updated_at > max) return p.career_stats_updated_at;
      return max;
    }, null);

    const result = players
      .map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        retired: p.status === 'retired',
        home_runs: p.career_home_runs,
        hits: p.career_hits,
        rbi: p.career_rbi,
      }))
      .sort((a, b) => (b.home_runs * 2 + b.hits + b.rbi) - (a.home_runs * 2 + a.hits + a.rbi));

    res.json({ players: result, last_calculated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el ranking historico' });
  }
});

// POST /api/history/alltime/recalculate -> recalcula HR/H/RBI (bateo) y W/K/IP/ER (pitcheo) de todos los jugadores
router.post('/alltime/recalculate', async (req, res) => {
  try {
    const now = new Date();
    await prisma.$executeRaw`
      UPDATE "Player" p
      SET career_hits = agg.hits,
          career_home_runs = agg.hr,
          career_rbi = agg.rbi,
          career_stats_updated_at = ${now}
      FROM (
        SELECT player_id,
               COUNT(*) FILTER (WHERE result IN ('1B','2B','3B','HR')) AS hits,
               COUNT(*) FILTER (WHERE result = 'HR') AS hr,
               COALESCE(SUM(runs_scored), 0) AS rbi
        FROM game_events
        WHERE player_id IS NOT NULL
        GROUP BY player_id
      ) agg
      WHERE p.id = agg.player_id
    `;

    await prisma.$executeRaw`
      WITH pitcher_games AS (
        SELECT DISTINCT gl.player_id, gl.game_id, gl.team_id
        FROM game_lineups gl
        WHERE gl.position = 'P'
      ),
      pitcher_agg AS (
        SELECT pg.player_id,
               COUNT(*) FILTER (WHERE ge.result IN ('SO','GO','FO')) AS outs,
               COUNT(*) FILTER (WHERE ge.result = 'SO') AS so,
               COALESCE(SUM(ge.runs_scored), 0) AS er
        FROM pitcher_games pg
        JOIN game_events ge ON ge.game_id = pg.game_id AND ge.batting_team_id <> pg.team_id
        GROUP BY pg.player_id
      ),
      pitcher_wins AS (
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
      SET career_wins = COALESCE(pw.wins, 0),
          career_strikeouts = COALESCE(pa.so, 0),
          career_innings_pitched = COALESCE(pa.outs, 0) / 3.0,
          career_earned_runs = COALESCE(pa.er, 0),
          career_stats_updated_at = ${now}
      FROM (SELECT DISTINCT player_id FROM pitcher_games) dp
      LEFT JOIN pitcher_agg pa ON pa.player_id = dp.player_id
      LEFT JOIN pitcher_wins pw ON pw.player_id = dp.player_id
      WHERE p.id = dp.player_id
    `;

    res.json({ updated_at: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recalcular el ranking historico' });
  }
});

// GET /api/history/awards?season_id= -> premios otorgados en una temporada (la mas reciente si se omite)
router.get('/awards', async (req, res) => {
  try {
    let seasonId = req.query.season_id ? Number(req.query.season_id) : null;
    if (!seasonId) {
      const latest = await prisma.seasonAward.findFirst({ orderBy: { season_id: 'desc' }, select: { season_id: true } });
      seasonId = latest?.season_id ?? null;
    }
    if (!seasonId) return res.json({ season_id: null, awards: [] });

    const awards = await prisma.seasonAward.findMany({
      where: { season_id: seasonId, category: { in: ['MVP', 'CY_YOUNG', 'ROOKIE_OF_YEAR'] } },
      include: {
        player: { select: { first_name: true, last_name: true } },
        team: { select: { name: true } },
      },
      orderBy: { category: 'asc' },
    });

    res.json({
      season_id: seasonId,
      awards: awards.map((a) => ({
        category: a.category,
        value: a.value,
        player_name: a.player ? `${a.player.first_name} ${a.player.last_name}` : null,
        team_name: a.team?.name ?? null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener los premios de la temporada' });
  }
});

// GET /api/history/records -> lideres de carrera (bateo y pitcheo) y records de una sola temporada
router.get('/records', async (req, res) => {
  try {
    const topBatting = async (field) =>
      prisma.player.findMany({
        where: { [field]: { gt: 0 } },
        select: { id: true, first_name: true, last_name: true, status: true, [field]: true },
        orderBy: { [field]: 'desc' },
        take: 10,
      });

    const [hrLeaders, hitLeaders, rbiLeaders, winLeaders, strikeoutLeaders, eraLeadersRaw] = await Promise.all([
      topBatting('career_home_runs'),
      topBatting('career_hits'),
      topBatting('career_rbi'),
      prisma.player.findMany({
        where: { career_wins: { gt: 0 } },
        select: { id: true, first_name: true, last_name: true, status: true, career_wins: true },
        orderBy: { career_wins: 'desc' },
        take: 10,
      }),
      prisma.player.findMany({
        where: { career_strikeouts: { gt: 0 } },
        select: { id: true, first_name: true, last_name: true, status: true, career_strikeouts: true },
        orderBy: { career_strikeouts: 'desc' },
        take: 10,
      }),
      prisma.player.findMany({
        where: { career_innings_pitched: { gte: SEASON_AWARD_MIN_IP } },
        select: { id: true, first_name: true, last_name: true, status: true, career_innings_pitched: true, career_earned_runs: true },
        take: 10,
      }),
    ]);

    const eraLeaders = eraLeadersRaw
      .map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        status: p.status,
        era: (Number(p.career_earned_runs) * 9) / Number(p.career_innings_pitched),
      }))
      .sort((a, b) => a.era - b.era)
      .slice(0, 10);

    const [bestSeasonHr, bestSeasonEra, bestWinStreak] = await Promise.all([
      prisma.seasonAward.findFirst({
        where: { category: 'SEASON_HR_RECORD' },
        orderBy: { value: 'desc' },
        include: { player: { select: { first_name: true, last_name: true } }, team: { select: { name: true } }, season: { select: { year: true } } },
      }),
      prisma.seasonAward.findFirst({
        where: { category: 'SEASON_ERA_RECORD' },
        orderBy: { value: 'asc' },
        include: { player: { select: { first_name: true, last_name: true } }, team: { select: { name: true } }, season: { select: { year: true } } },
      }),
      prisma.seasonAward.findFirst({
        where: { category: 'SEASON_WIN_STREAK_RECORD' },
        orderBy: { value: 'desc' },
        include: { team: { select: { name: true } }, season: { select: { year: true } } },
      }),
    ]);

    const seasonRecord = (award) => award && {
      value: award.value,
      year: award.season.year,
      player_name: award.player ? `${award.player.first_name} ${award.player.last_name}` : null,
      team_name: award.team?.name ?? null,
    };

    res.json({
      career: {
        home_runs: hrLeaders,
        hits: hitLeaders,
        rbi: rbiLeaders,
        wins: winLeaders,
        strikeouts: strikeoutLeaders,
        era: eraLeaders,
      },
      season_records: {
        home_runs: seasonRecord(bestSeasonHr),
        era: seasonRecord(bestSeasonEra),
        win_streak: seasonRecord(bestWinStreak),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el libro de records' });
  }
});

module.exports = router;
