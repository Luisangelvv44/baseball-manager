const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const {
  USER_TEAM_ID,
  TODDLER_PROGRAM_SEASONS,
  TODDLER_PROGRAM_PICKS_PER_TEAM,
} = require('../config');
const {
  generateToddlerCycle,
  advanceOnePick,
  userPickToddler,
  improveProbForSeason,
} = require('../services/toddlerProgramService');

// GET /api/toddlers -> estado del programa (ciclo activo + eleccion en curso si la hay)
router.get('/', async (req, res) => {
  try {
    // Bootstrap perezoso: partidas ya empezadas antes de esta feature
    if ((await prisma.toddlerProgram.count()) === 0) {
      await generateToddlerCycle(prisma, 1);
    }

    const active = await prisma.toddlerProgram.findFirst({ where: { status: 'active' }, orderBy: { id: 'desc' } });
    const selecting = await prisma.toddlerProgram.findFirst({ where: { status: 'selecting' }, orderBy: { id: 'desc' } });

    const teams = await prisma.team.findMany({
      select: { id: true, name: true, is_user_team: true },
      orderBy: { id: 'asc' },
    });
    const teamName = (id) => teams.find((t) => t.id === id)?.name ?? `Equipo ${id}`;

    let activeView = null;
    if (active) {
      const toddlers = await prisma.player.findMany({
        where: { toddler_program_id: active.id, status: 'toddler_program' },
        orderBy: [{ current_skill: 'desc' }, { id: 'asc' }],
        select: {
          id: true, first_name: true, last_name: true, position: true,
          age: true, current_skill: true, potential_coefficient: true,
        },
      });
      const contribs = await prisma.toddlerContribution.findMany({ where: { program_id: active.id } });
      const contribMap = new Map(contribs.map((c) => [c.team_id, Number(c.amount)]));
      const contributions = teams
        .map((t) => ({
          team_id: t.id,
          team_name: t.name,
          is_user_team: t.is_user_team,
          amount: contribMap.get(t.id) || 0,
        }))
        .sort((a, b) => b.amount - a.amount || a.team_id - b.team_id);

      const userBudgetRow = await prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { budget: true } });

      activeView = {
        id: active.id,
        cycle_number: active.cycle_number,
        seasons_elapsed: active.seasons_elapsed,
        seasons_total: TODDLER_PROGRAM_SEASONS,
        years_remaining: TODDLER_PROGRAM_SEASONS - active.seasons_elapsed,
        budget: Number(active.budget),
        next_improve_prob: improveProbForSeason(active.seasons_elapsed),
        toddlers,
        contributions,
        user_total: contribMap.get(USER_TEAM_ID) || 0,
        user_budget: Number(userBudgetRow?.budget ?? 0),
      };
    }

    let selectingView = null;
    if (selecting) {
      const order = selecting.pick_order || [];
      const rows = await prisma.player.findMany({
        where: { toddler_program_id: selecting.id },
        orderBy: [{ current_skill: 'desc' }, { id: 'asc' }],
        select: {
          id: true, first_name: true, last_name: true, position: true,
          age: true, current_skill: true, potential_coefficient: true,
          team_id: true, status: true,
        },
      });
      const currentTeamId = selecting.current_pick <= order.length ? order[selecting.current_pick - 1] : null;

      selectingView = {
        id: selecting.id,
        cycle_number: selecting.cycle_number,
        current_pick: selecting.current_pick,
        total_picks: order.length,
        picks_per_team: TODDLER_PROGRAM_PICKS_PER_TEAM,
        is_user_turn: currentTeamId === USER_TEAM_ID,
        current_team: currentTeamId
          ? { team_id: currentTeamId, team_name: teamName(currentTeamId), is_user_team: currentTeamId === USER_TEAM_ID }
          : null,
        pick_order: order.map((id, i) => ({
          pick: i + 1,
          team_id: id,
          team_name: teamName(id),
          is_user_team: id === USER_TEAM_ID,
        })),
        toddlers: rows.map((r) => ({
          ...r,
          owner_team_id: r.team_id,
          owner_team_name: r.team_id ? teamName(r.team_id) : null,
        })),
      };
    }

    res.json({ active: activeView, selecting: selectingView });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el Programa de Toddlers' });
  }
});

// POST /api/toddlers/contribute { amount } -> aporte manual del equipo del usuario
router.post('/contribute', async (req, res) => {
  try {
    const amount = Math.round(Number(req.body?.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Monto invalido' });
    }

    const program = await prisma.toddlerProgram.findFirst({ where: { status: 'active' }, orderBy: { id: 'desc' } });
    if (!program) return res.status(400).json({ error: 'No hay un ciclo activo del programa' });

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { budget: true } });
    if (!team || Number(team.budget) < amount) {
      return res.status(400).json({ error: 'Presupuesto insuficiente' });
    }

    await prisma.team.update({ where: { id: USER_TEAM_ID }, data: { budget: { decrement: amount } } });
    await prisma.toddlerProgram.update({ where: { id: program.id }, data: { budget: { increment: amount } } });
    await prisma.toddlerContribution.upsert({
      where: { program_id_team_id: { program_id: program.id, team_id: USER_TEAM_ID } },
      create: { program_id: program.id, team_id: USER_TEAM_ID, amount },
      update: { amount: { increment: amount } },
    });

    const currentSeason = await prisma.season.findFirst({
      where: { status: { in: ['active', 'playoffs', 'draft', 'completed'] } },
      orderBy: { id: 'desc' },
      select: { current_day: true },
    });
    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: currentSeason?.current_day ?? 0,
        type: 'toddlers_program',
        amount: -amount,
        description: `Aporte al Programa de Toddlers (ciclo ${program.cycle_number})`,
      },
    });

    const [updated, contrib] = await Promise.all([
      prisma.toddlerProgram.findUnique({ where: { id: program.id }, select: { budget: true } }),
      prisma.toddlerContribution.findUnique({
        where: { program_id_team_id: { program_id: program.id, team_id: USER_TEAM_ID } },
        select: { amount: true },
      }),
    ]);
    res.json({ budget: Number(updated.budget), userTotal: Number(contrib.amount) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al aportar al programa' });
  }
});

// POST /api/toddlers/advance-pick -> avanza un pick de la CPU en la ronda de eleccion
router.post('/advance-pick', async (req, res) => {
  try {
    const program = await prisma.toddlerProgram.findFirst({ where: { status: 'selecting' }, orderBy: { id: 'desc' } });
    if (!program) return res.status(400).json({ error: 'No hay una eleccion en curso' });

    const result = await advanceOnePick(prisma, program, { allowUser: false });
    res.json({
      picked: result.picked
        ? { id: result.picked.id, name: `${result.picked.first_name} ${result.picked.last_name}` }
        : null,
      isUserTurn: !!result.isUserTurn,
      complete: !!result.complete,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al avanzar la eleccion' });
  }
});

// POST /api/toddlers/pick { playerId } -> el usuario elige un toddler en su turno
router.post('/pick', async (req, res) => {
  try {
    const playerId = Number(req.body?.playerId);
    if (!Number.isFinite(playerId)) return res.status(400).json({ error: 'playerId invalido' });

    const program = await prisma.toddlerProgram.findFirst({ where: { status: 'selecting' }, orderBy: { id: 'desc' } });
    if (!program) return res.status(400).json({ error: 'No hay una eleccion en curso' });

    const result = await userPickToddler(prisma, program, playerId);
    res.json({
      player: { id: result.player.id, name: `${result.player.first_name} ${result.player.last_name}` },
      complete: !!result.complete,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Error al elegir el toddler' });
  }
});

module.exports = router;
