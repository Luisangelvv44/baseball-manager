const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');

// GET /api/finances -> historial de transacciones del equipo del usuario
router.get('/', async (req, res) => {
  try {
    const transactions = await prisma.finance.findMany({
      where: { team_id: USER_TEAM_ID },
      orderBy: { id: 'desc' },
      take: 200,
    });

    const summary = await prisma.$queryRaw`
      SELECT type, SUM(amount) as total
      FROM finances
      WHERE team_id = ${USER_TEAM_ID}
      GROUP BY type
    `;

    const team = await prisma.team.findUnique({
      where: { id: USER_TEAM_ID },
      select: { budget: true },
    });

    res.json({
      budget: team?.budget,
      transactions,
      summary,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener finanzas' });
  }
});

module.exports = router;
