const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID, MAX_MINOR_ROSTER_SIZE } = require('../config');
const { FIRST_NAMES, LAST_NAMES } = require('../seeders/data/names');
const { generateScoutedPlayer, randomInt, randomChoice, POSITIONS } = require('../seeders/generators/playerGenerator');
const { assignAppearance } = require('../services/playerAppearanceService');

const MISSION_DURATION_DAYS = 5;

// Niveles de contratacion: a mayor rango de skill_level, mayor costo de contratacion.
// El id es lo que el frontend envia en POST /api/scouts { tier }.
const SCOUT_HIRE_TIERS = [
  { id: 'basico', label: 'Basico', skillMin: 40, skillMax: 55, cost: 50_000 },
  { id: 'intermedio', label: 'Intermedio', skillMin: 56, skillMax: 70, cost: 200_000 },
  { id: 'avanzado', label: 'Avanzado', skillMin: 71, skillMax: 85, cost: 600_000 },
  { id: 'elite', label: 'Elite', skillMin: 86, skillMax: 99, cost: 1_500_000 },
];
const DEFAULT_TIER_ID = 'basico';

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

// GET /api/scouts/tiers -> niveles de contratacion disponibles (costo + rango de skill)
router.get('/tiers', (req, res) => {
  res.json(SCOUT_HIRE_TIERS);
});

// POST /api/scouts { tier? } -> contrata un nuevo scout del nivel indicado (basico por defecto)
router.post('/', async (req, res) => {
  try {
    const tierId = req.body.tier || DEFAULT_TIER_ID;
    const tier = SCOUT_HIRE_TIERS.find((t) => t.id === tierId);
    if (!tier) return res.status(400).json({ error: 'Nivel de scout invalido' });

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });

    if (Number(team.budget) < tier.cost) {
      return res.status(400).json({ error: 'Presupuesto insuficiente', cost: tier.cost });
    }

    const name = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
    const skillLevel = randomInt(tier.skillMin, tier.skillMax);

    const scout = await prisma.scout.create({
      data: { team_id: USER_TEAM_ID, name, skill_level: skillLevel, budget_assigned: 0, active_mission: false },
    });

    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { budget: { decrement: tier.cost } },
    });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const day = season?.current_day ?? 0;

    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: day,
        type: 'scouting',
        amount: -tier.cost,
        description: `Contratacion de scout (${tier.label}): ${name}`,
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

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    let minorRosterCount = await prisma.player.count({
      where: { team_id: USER_TEAM_ID, level: 'MINOR' },
    });
    let budget = Number(team.budget);

    const prospects = [];
    let skipped = 0;
    for (let i = 0; i < numProspects; i++) {
      const p = generateScoutedPlayer(scout.skill_level, Number(scout.budget_assigned), scout.target_position || null);
      const signingBonus = Math.round(p.salary * 0.1);

      if (minorRosterCount >= MAX_MINOR_ROSTER_SIZE || budget < signingBonus) {
        skipped++;
        continue;
      }

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
          demand_factor: p.demand_factor,
          contract_years_remaining: p.contract_years_remaining,
          rookie_contract: p.rookie_contract,
          team_id: USER_TEAM_ID,
          status: 'active',
          level: 'MINOR',
        },
      });
      await assignAppearance(prisma, created.id);
      prospects.push(created);
      minorRosterCount++;
      budget -= signingBonus;

      await prisma.team.update({
        where: { id: USER_TEAM_ID },
        data: { budget: { decrement: signingBonus } },
      });

      const season = await prisma.season.findFirst({ where: { status: 'active' } });
      await prisma.finance.create({
        data: {
          team_id: USER_TEAM_ID,
          season_day: season?.current_day ?? 0,
          type: 'signing',
          amount: -signingBonus,
          description: `Fichaje automático (Minors): ${p.first_name} ${p.last_name}`,
        },
      });
    }

    await prisma.scout.update({
      where: { id: scout.id },
      data: { active_mission: false, budget_assigned: 0, mission_end_day: null, target_position: null },
    });

    res.json({ success: true, prospects, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al recolectar prospectos' });
  }
});

// DELETE /api/scouts/:id/fire -> despide un scout
router.delete('/:id/fire', async (req, res) => {
  const scoutId = Number(req.params.id);
  try {
    const scout = await prisma.scout.findFirst({ where: { id: scoutId, team_id: USER_TEAM_ID } });
    if (!scout) return res.status(404).json({ error: 'Scout no encontrado' });

    if (scout.active_mission) {
      return res.status(400).json({ error: 'No puedes despedir un scout con una mision activa. Espera a que termine y recolecta los prospectos primero.' });
    }

    await prisma.scout.delete({ where: { id: scoutId } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al despedir scout' });
  }
});

module.exports = router;
