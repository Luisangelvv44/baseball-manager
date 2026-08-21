const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');

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

// POST /api/history/alltime/recalculate -> recalcula HR/H/RBI de todos los jugadores desde game_events
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
    res.json({ updated_at: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recalcular el ranking historico' });
  }
});

module.exports = router;
