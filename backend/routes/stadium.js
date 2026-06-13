const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { getUpgradeCost, BUILD_COST, BASE_PRICE } = require('../seeders/generators/stadiumGenerator');

// GET /api/stadium -> grid 3x3 de secciones del estadio del usuario
router.get('/', async (req, res) => {
  try {
    const sections = await prisma.stadiumSection.findMany({
      where: { team_id: USER_TEAM_ID },
      orderBy: [{ row_pos: 'asc' }, { col_pos: 'asc' }],
    });
    res.json(
      sections.map((s) => ({
        ...s,
        next_upgrade_cost: s.section_type === 'grandstand' ? getUpgradeCost(s.upgrade_level) : null,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el estadio' });
  }
});

// PUT /api/stadium/:id/price  { price }
router.put('/:id/price', async (req, res) => {
  const price = Number(req.body.price);
  if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Precio invalido' });

  try {
    const section = await prisma.stadiumSection.findUnique({ where: { id: Number(req.params.id) } });
    if (!section) return res.status(404).json({ error: 'Seccion no encontrada' });
    if (section.section_type !== 'grandstand') {
      return res.status(400).json({ error: 'Solo las gradas tienen precio de entrada' });
    }

    await prisma.stadiumSection.update({
      where: { id: Number(req.params.id) },
      data: { price_per_ticket: price },
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar precio' });
  }
});

// POST /api/stadium/:id/upgrade -> sube de nivel, costo = 5000 * 2^(nivel-1)
router.post('/:id/upgrade', async (req, res) => {
  try {
    const section = await prisma.stadiumSection.findUnique({ where: { id: Number(req.params.id) } });
    if (!section) return res.status(404).json({ error: 'Seccion no encontrada' });

    if (section.section_type !== 'grandstand') {
      return res.status(400).json({ error: 'Solo se pueden mejorar gradas' });
    }

    const cost = getUpgradeCost(section.upgrade_level);

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (Number(team.budget) < cost) {
      return res.status(400).json({ error: 'Presupuesto insuficiente', cost });
    }

    const newLevel = section.upgrade_level + 1;
    const newCapacity = 100 * Math.pow(2, newLevel - 1);

    await prisma.stadiumSection.update({
      where: { id: Number(req.params.id) },
      data: { upgrade_level: newLevel, capacity: newCapacity },
    });

    const newBudget = Number(team.budget) - cost;
    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { budget: newBudget },
    });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const day = season?.current_day ?? 0;

    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: day,
        type: 'stadium_upgrade',
        amount: -cost,
        description: `Mejora de ${section.label} a nivel ${newLevel}`,
      },
    });

    res.json({ success: true, newLevel, newCapacity, cost, newBudget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al mejorar la seccion' });
  }
});

// POST /api/stadium/:id/build -> convierte una celda 'empty' en grada nivel 1
router.post('/:id/build', async (req, res) => {
  try {
    const section = await prisma.stadiumSection.findUnique({ where: { id: Number(req.params.id) } });
    if (!section) return res.status(404).json({ error: 'Seccion no encontrada' });

    if (section.section_type !== 'empty') {
      return res.status(400).json({ error: 'Esta celda ya esta construida' });
    }

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });
    if (Number(team.budget) < BUILD_COST) {
      return res.status(400).json({ error: 'Presupuesto insuficiente', cost: BUILD_COST });
    }

    await prisma.stadiumSection.update({
      where: { id: Number(req.params.id) },
      data: {
        section_type: 'grandstand',
        label: `Grada (${section.row_pos},${section.col_pos})`,
        price_per_ticket: BASE_PRICE,
        upgrade_level: 1,
        capacity: 100,
      },
    });

    const newBudget = Number(team.budget) - BUILD_COST;
    await prisma.team.update({
      where: { id: USER_TEAM_ID },
      data: { budget: newBudget },
    });

    const season = await prisma.season.findFirst({ where: { status: 'active' } });
    const day = season?.current_day ?? 0;

    await prisma.finance.create({
      data: {
        team_id: USER_TEAM_ID,
        season_day: day,
        type: 'stadium_upgrade',
        amount: -BUILD_COST,
        description: `Construccion de nueva grada en (${section.row_pos},${section.col_pos})`,
      },
    });

    res.json({ success: true, cost: BUILD_COST, newBudget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al construir' });
  }
});

module.exports = router;
