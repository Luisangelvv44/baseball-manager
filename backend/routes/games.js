const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { playGame } = require('../services/gamePlay');
const { getLineup } = require('../services/lineup');
const { computeHomeGameRevenue, computeAwayGameRevenue } = require('../services/economy');
const { updateSeriesAfterGame } = require('../services/playoffService');
const { simulateScheduledGamesForDay, simulateOtherActivePlayoffSeries } = require('../services/dayGamesSimulator');

function formatSavedLineup(rows, teamId) {
  const teamRows = rows.filter((r) => r.team_id === teamId);
  const pitcherRow = teamRows.find((r) => r.batting_order == null);
  const batterRows = teamRows
    .filter((r) => r.batting_order != null)
    .sort((a, b) => a.batting_order - b.batting_order);

  return {
    pitcher: pitcherRow
      ? {
          id: pitcherRow.player.id,
          name: `${pitcherRow.player.first_name} ${pitcherRow.player.last_name}`,
          current_skill: pitcherRow.player.current_skill,
        }
      : null,
    batters: batterRows.map((r) => ({
      id: r.player.id,
      name: `${r.player.first_name} ${r.player.last_name}`,
      position: r.player.position,
      current_skill: r.player.current_skill,
    })),
  };
}

function formatPreviewLineup(lineup) {
  if (!lineup) return { pitcher: null, batters: [] };
  return {
    pitcher: {
      id: lineup.pitcher.id,
      name: `${lineup.pitcher.first_name} ${lineup.pitcher.last_name}`,
      current_skill: lineup.pitcher.current_skill,
    },
    batters: lineup.players.map((p) => ({
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      position: p.position,
      current_skill: p.current_skill,
    })),
  };
}

// GET /api/games/:id -> info basica del partido + eventos guardados (si ya se jugo)
router.get('/:id', async (req, res) => {
  try {
    const game = await prisma.gameSchedule.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) return res.status(404).json({ error: 'Partido no encontrado' });

    const homeTeam = await prisma.team.findUnique({ where: { id: game.home_team_id } });
    const awayTeam = await prisma.team.findUnique({ where: { id: game.away_team_id } });
    const events = await prisma.gameEvent.findMany({
      where: { game_id: game.id },
      orderBy: { event_order: 'asc' },
    });

    let homeLineup;
    let awayLineup;
    if (game.status === 'finished') {
      const lineupRows = await prisma.gameLineup.findMany({
        where: { game_id: game.id },
        include: { player: { select: { id: true, first_name: true, last_name: true, position: true, current_skill: true } } },
      });
      homeLineup = formatSavedLineup(lineupRows, game.home_team_id);
      awayLineup = formatSavedLineup(lineupRows, game.away_team_id);
    } else {
      const [home, away] = await Promise.all([
        getLineup(game.home_team_id, game),
        getLineup(game.away_team_id, game),
      ]);
      homeLineup = formatPreviewLineup(home);
      awayLineup = formatPreviewLineup(away);
    }

    res.json({ game, homeTeam, awayTeam, events, homeLineup, awayLineup });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el partido' });
  }
});

// POST /api/games/:id/simulate -> simula el partido del usuario (play-by-play completo)
// y aplica los efectos economicos (entradas/merch si es local, solo merch si es visita).
router.post('/:id/simulate', async (req, res) => {
  try {
    const game = await prisma.gameSchedule.findUnique({ where: { id: Number(req.params.id) } });
    if (!game) return res.status(404).json({ error: 'Partido no encontrado' });

    if (game.status === 'finished') {
      return res.status(400).json({ error: 'Este partido ya fue jugado' });
    }

    const isPlayoff = !!game.playoff_series_id;
    let result;
    try {
      result = await playGame(game, true, isPlayoff);
    } catch (err) {
      if (err.code === 'ROSTER_INCOMPLETO') {
        return res.status(400).json({
          error: 'Tu equipo no tiene un roster completo (faltan jugadores titulares o pitcher).',
        });
      }
      throw err;
    }

    // ---------- Economia ----------
    const isUserHome = game.home_team_id === USER_TEAM_ID;
    const userTeam = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    const season = await prisma.season.findFirst({ where: { status: { in: ['active', 'playoffs'] } } });
    const day = season?.current_day ?? 0;

    let economy;
    if (isUserHome) {
      const sections = await prisma.stadiumSection.findMany({
        where: { team_id: USER_TEAM_ID, section_type: 'grandstand' },
      });
      economy = computeHomeGameRevenue(sections, userTeam.reputation, userTeam.fan_base, isPlayoff);

      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { increment: economy.total } },
      });

      if (economy.ticketRevenue > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'ticket_sales',
            amount: economy.ticketRevenue,
            description: `Entradas (asistencia: ${economy.attendance})`,
          },
        });
      }
      if (economy.merchRevenue > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'merch_sales',
            amount: economy.merchRevenue,
            description: 'Venta de merchandising (local)',
          },
        });
      }
      if (economy.operatingCost > 0) {
        await prisma.finance.create({
          data: {
            team_id: USER_TEAM_ID,
            season_day: day,
            type: 'operating_cost',
            amount: -economy.operatingCost,
            description: 'Costos operativos del estadio',
          },
        });
      }
    } else {
      economy = computeAwayGameRevenue(userTeam.fan_base);

      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { increment: economy.total } },
      });

      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: day,
          type: 'merch_sales',
          amount: economy.merchRevenue,
          description: 'Venta de merchandising (visitante)',
        },
      });
    }

    if (isPlayoff) {
      await updateSeriesAfterGame(game, result);
    }

    // Simular el resto de la jornada para que los marcadores de los demas equipos
    // esten listos al volver al Dashboard, sin tener que avanzar el dia primero.
    let othersSimulated = 0;
    if (season) {
      const rest = isPlayoff
        ? await simulateOtherActivePlayoffSeries(season.id)
        : await simulateScheduledGamesForDay(season.id, game.day_number);
      othersSimulated = rest.simulated;
    }

    res.json({
      othersSimulated,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      events: result.events,
      homeTeam: result.homeTeam,
      awayTeam: result.awayTeam,
      homeLineup: result.homeLineup,
      awayLineup: result.awayLineup,
      feats: result.feats,
      isUserHome,
      economy,
      isPlayoff,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al simular el partido' });
  }
});

module.exports = router;
