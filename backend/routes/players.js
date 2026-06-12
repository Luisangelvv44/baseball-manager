const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// GET /api/players/free-agents -> jugadores sin equipo (status = free_agent)
router.get('/free-agents', async (req, res) => {
  try {
    const players = await prisma.player.findMany({
      where: { team_id: null, status: 'free_agent' },
      orderBy: { potential_coefficient: 'desc' },
    });
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener agentes libres' });
  }
});

// GET /api/players/scouted -> prospectos traidos por scouts, listos para fichar
router.get('/scouted', async (req, res) => {
  try {
    const players = await prisma.player.findMany({
      where: { team_id: null, status: 'scouted' },
      orderBy: { potential_coefficient: 'desc' },
    });
    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener prospectos' });
  }
});

// POST /api/players/:id/sign  { years, salary }
// Ficha a un jugador (agente libre o prospecto de scout) para tu equipo.
router.post('/:id/sign', async (req, res) => {
  const { id } = req.params;
  const years = parseInt(req.body.years, 10) || 1;
  let salary = req.body.salary;

  try {
    const player = await prisma.player.findUnique({ where: { id: Number(id) } });
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    if (player.team_id !== null) {
      return res.status(400).json({ error: 'Este jugador ya pertenece a un equipo' });
    }

    if (!salary) salary = player.salary;
    salary = Math.round(Number(salary));

    const team = await prisma.team.findUnique({ where: { id: USER_TEAM_ID } });

    // Bono de firma: 10% del salario anual, pago unico
    const signingBonus = Math.round(salary * 0.1);
    if (Number(team.budget) < signingBonus) {
      return res.status(400).json({ error: 'No tienes suficiente presupuesto para el bono de firma' });
    }

    await prisma.player.update({
      where: { id: Number(id) },
      data: { team_id: USER_TEAM_ID, status: 'active', salary, contract_years_remaining: years },
    });

    const newBudget = Number(team.budget) - signingBonus;
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
        type: 'signing',
        amount: -signingBonus,
        description: `Bono de firma: ${player.first_name} ${player.last_name}`,
      },
    });

    res.json({ success: true, signingBonus, newBudget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al fichar jugador' });
  }
});

module.exports = router;
