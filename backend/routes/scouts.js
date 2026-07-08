const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { FIRST_NAMES, LAST_NAMES } = require('../seeders/data/names');
const { generateScoutedPlayer, randomInt, randomChoice, POSITIONS } = require('../seeders/generators/playerGenerator');

const HIRE_COST = 50000;
const MISSION_DURATION_DAYS = 5;

// GET /api/scouts -> scouts del equipo
router.get('/', async (req, res) => {
  try {
    const scouts = await prisma.scout.findMany({
      where: { team_id: USER_TEAM_ID },
      orderBy: { id: 'asc' },
    });
    res.json(scouts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener scouts' });
  }
});

// POST /api/scouts -> contrata un nuevo scout (costo fijo)
router.post('/', async (req, res) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });

    if (Number(team.budget) < HIRE_COST) {
      return res.status(400).json({ error: 'Presupuesto insuficiente', cost: HIRE_COST });
    }

    const name = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
    const skillLevel = randomInt(40, 80);

    const scout = await prisma.scout.create({
      data: { team_id: USER_TEAM_ID, name, skill_level: skillLevel, budget_assigned: 0, active_mission: false },
    });

    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { budget: { decrement: HIRE_COST } },
    });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const day = season?.current_day ?? 0;

    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: day,
        type: 'scouting',
        amount: -HIRE_COST,
        description: `Contratacion de scout: ${name}`,
      },
    });

    res.json({ success: true, scout });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al contratar scout' });
  }
});

// POST /api/scouts/:id/assign { budget, target_position? } -> envia al scout a una mision
router.post('/:id/assign', async (req, res) => {
  const budget = Number(req.body.budget);
  if (isNaN(budget) || budget <= 0) return res.status(400).json({ error: 'Presupuesto invalido' });

  const target_position = req.body.target_position || null;
  if (target_position && !POSITIONS.includes(target_position)) {
    return res.status(400).json({ error: 'Posicion invalida' });
  }

  try {
    const scout = await prisma.scout.findFirst({
      where: { id: Number(req.params.id), team_id: USER_TEAM_ID },
    });
    if (!scout) return res.status(404).json({ error: 'Scout no encontrado' });

    if (scout.active_mission) return res.status(400).json({ error: 'Este scout ya esta en una mision' });

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (Number(team.budget) < budget) return res.status(400).json({ error: 'Presupuesto insuficiente' });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const currentDay = season?.current_day ?? 0;

    await prisma.scout.update({
      where: { id: scout.id },
      data: { budget_assigned: budget, active_mission: true, mission_end_day: currentDay + MISSION_DURATION_DAYS, target_position },
    });

    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { budget: { decrement: budget } },
    });

    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: currentDay,
        type: 'scouting',
        amount: -budget,
        description: `Mision de scouting: ${scout.name}`,
      },
    });

    res.json({ success: true, missionEndDay: currentDay + MISSION_DURATION_DAYS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al asignar mision' });
  }
});

// POST /api/scouts/:id/collect -> recoge los prospectos si la mision ya termino
router.post('/:id/collect', async (req, res) => {
  try {
    const scout = await prisma.scout.findFirst({
      where: { id: Number(req.params.id), team_id: USER_TEAM_ID },
    });
    if (!scout) return res.status(404).json({ error: 'Scout no encontrado' });

    if (!scout.active_mission) return res.status(400).json({ error: 'Este scout no tiene una mision activa' });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const currentDay = season?.current_day ?? 0;

    if (currentDay < scout.mission_end_day) {
      return res.status(400).json({
        error: 'La mision aun no termina',
        daysRemaining: scout.mission_end_day - currentDay,
      });
    }

    // Mas presupuesto + mejor scout = mas prospectos (1 a 3)
    const budgetBonus = Number(scout.budget_assigned) >= 200000 ? 1 : 0;
    const skillBonus = scout.skill_level >= 65 ? 1 : 0;
    const numProspects = 1 + budgetBonus + (Math.random() < 0.5 ? skillBonus : 0);

    const prospects = [];
    for (let i = 0; i < numProspects; i++) {
      const p = generateScoutedPlayer(scout.skill_level, scout.target_position || null);
      const created = await prisma.player.create({
        data: {
          first_name: p.first_name,
          last_name: p.last_name,
          age: p.age,
          position: p.position,
          potential_coefficient: p.potential_coefficient,
          growth_age: p.growth_age,
          current_skill: p.current_skill,
          salary: p.salary,
          contract_years_remaining: p.contract_years_remaining,
          rookie_contract: p.rookie_contract,
          team_id: null,
          status: 'scouted',
        },
      });
      prospects.push(created);
    }

    await prisma.scout.update({
      where: { id: scout.id },
      data: { active_mission: false, budget_assigned: 0, mission_end_day: null, target_position: null },
    });

    res.json({ success: true, prospects });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recolectar prospectos' });
  }
});

module.exports = router;
