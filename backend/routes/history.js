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

module.exports = router;
