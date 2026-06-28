const express = require('express');
const router = express.Router();
const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { calculateSalary } = require('../seeders/generators/playerGenerator');
const { createNews } = require('../services/newsService');

// GET /api/players/team-stats -> estadísticas de la temporada actual para todos los jugadores del usuario
router.get('/team-stats', async (req, res) => {
  try {
    const season = await prisma.season.findFirst({ orderBy: { id: 'desc' } });
    if (!season) return res.json({ stats: [], seasonYear: null });

    const games = await prisma.gameSchedule.findMany({
      where: { season_id: season.id, status: 'finished' },
      select: { id: true, home_team_id: true, away_team_id: true, home_score: true, away_score: true },
    });
    const gameIds = games.map(g => g.id);

    const players = await prisma.player.findMany({
      where: { team_id: USER_TEAM_ID },
      select: { id: true, first_name: true, last_name: true, position: true },
    });
    if (players.length === 0) return res.json({ stats: [], seasonYear: season.year });

    const playerIds = players.map(p => p.id);

    const batterEvents = gameIds.length > 0
      ? await prisma.gameEvent.findMany({
          where: { game_id: { in: gameIds }, player_id: { in: playerIds } },
          select: { game_id: true, player_id: true, result: true, runs_scored: true },
        })
      : [];

    const pitcherLineups = gameIds.length > 0
      ? await prisma.gameLineup.findMany({
          where: { game_id: { in: gameIds }, player_id: { in: playerIds }, position: 'P' },
          select: { game_id: true, player_id: true, team_id: true },
        })
      : [];

    const pitcherGameIds = [...new Set(pitcherLineups.map(l => l.game_id))];
    const pitcherGameEvents = pitcherGameIds.length > 0
      ? await prisma.gameEvent.findMany({
          where: { game_id: { in: pitcherGameIds } },
          select: { game_id: true, batting_team_id: true, result: true, runs_scored: true },
        })
      : [];

    // Agrupar eventos de pitcher por game_id para búsqueda eficiente
    const pitcherEventsByGame = {};
    for (const e of pitcherGameEvents) {
      if (!pitcherEventsByGame[e.game_id]) pitcherEventsByGame[e.game_id] = [];
      pitcherEventsByGame[e.game_id].push(e);
    }

    // Stats de bateadores
    const batterStats = {};
    for (const e of batterEvents) {
      if (!batterStats[e.player_id]) batterStats[e.player_id] = { games: new Set(), ab: 0, h: 0, hr: 0, bb: 0, so: 0, rbi: 0 };
      const s = batterStats[e.player_id];
      s.games.add(e.game_id);
      if (['SO', 'GO', 'FO', '1B', '2B', '3B', 'HR'].includes(e.result)) s.ab++;
      if (['1B', '2B', '3B', 'HR'].includes(e.result)) s.h++;
      if (e.result === 'HR') s.hr++;
      if (e.result === 'BB') s.bb++;
      if (e.result === 'SO') s.so++;
      s.rbi += e.runs_scored || 0;
    }

    // Mapa pitcher_id -> [{gameId, teamId}]
    const pitcherGameMap = {};
    for (const l of pitcherLineups) {
      if (!pitcherGameMap[l.player_id]) pitcherGameMap[l.player_id] = [];
      pitcherGameMap[l.player_id].push({ gameId: l.game_id, teamId: l.team_id });
    }

    // Stats de lanzadores
    const pitcherStats = {};
    for (const [pid, entries] of Object.entries(pitcherGameMap)) {
      const id = Number(pid);
      const ps = { games: new Set(), outs: 0, er: 0, so: 0, bb: 0, h: 0, w: 0, l: 0 };
      for (const { gameId, teamId } of entries) {
        ps.games.add(gameId);
        const events = (pitcherEventsByGame[gameId] || []).filter(e => e.batting_team_id !== teamId);
        for (const e of events) {
          if (['SO', 'GO', 'FO'].includes(e.result)) ps.outs++;
          if (e.result === 'SO') ps.so++;
          if (e.result === 'BB') ps.bb++;
          if (['1B', '2B', '3B', 'HR'].includes(e.result)) ps.h++;
          ps.er += e.runs_scored || 0;
        }
        const game = games.find(g => g.id === gameId);
        if (game) {
          const won = (game.home_team_id === teamId && game.home_score > game.away_score) ||
                      (game.away_team_id === teamId && game.away_score > game.home_score);
          if (won) ps.w++; else ps.l++;
        }
      }
      pitcherStats[id] = ps;
    }

    const stats = players.map(p => {
      const b = batterStats[p.id] || { games: new Set(), ab: 0, h: 0, hr: 0, bb: 0, so: 0, rbi: 0 };
      const batting = {
        g: b.games.size,
        ab: b.ab,
        h: b.h,
        avg: b.ab > 0 ? (b.h / b.ab).toFixed(3) : null,
        hr: b.hr,
        rbi: b.rbi,
        bb: b.bb,
        so: b.so,
      };

      let pitching = null;
      if (pitcherStats[p.id]) {
        const ps = pitcherStats[p.id];
        const ip_raw = ps.outs / 3;
        pitching = {
          g: ps.games.size,
          w: ps.w,
          l: ps.l,
          ip: ip_raw.toFixed(1),
          era: ip_raw > 0 ? ((ps.er / ip_raw) * 9).toFixed(2) : null,
          so: ps.so,
          bb: ps.bb,
          whip: ip_raw > 0 ? ((ps.bb + ps.h) / ip_raw).toFixed(2) : null,
        };
      }

      return { player_id: p.id, first_name: p.first_name, last_name: p.last_name, position: p.position, batting, pitching };
    });

    res.json({ stats, seasonYear: season.year });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas del equipo' });
  }
});

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

    const maxYears = Math.max(0, 40 - player.age);
    if (maxYears === 0) {
      return res.status(400).json({ error: 'Este jugador tiene 40 años o más y no puede ser contratado' });
    }
    const contractCap = player.rookie_contract ? Math.min(maxYears, 3) : maxYears;
    if (years > contractCap) {
      return res.status(400).json({ error: `Contrato rookie: máximo ${contractCap} año(s)` });
    }

    const rosterCount = await prisma.player.count({
      where: { team_id: USER_TEAM_ID, status: 'active' },
    });
    if (rosterCount >= 20) {
      return res.status(400).json({ error: 'Tu roster está lleno (máximo 20 jugadores)' });
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

    const totalValue = salary * years;
    const totalM = (totalValue / 1_000_000).toFixed(1);
    const salaryM = (salary / 1_000_000).toFixed(2);
    await createNews('signing',
      `${team.name} firmó a ${player.first_name} ${player.last_name}: ${years} año(s), $${salaryM}M/año ($${totalM}M total)`,
      day
    );

    res.json({ success: true, signingBonus, newBudget });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al fichar jugador' });
  }
});

// POST /api/players/:id/renew  { salary, years }
// Renueva el contrato de un jugador propio con <= 2 años restantes, ofreciendo mayor salario.
router.post('/:id/renew', async (req, res) => {
  const { id } = req.params;
  const newSalary = Math.round(Number(req.body.salary));
  const years = parseInt(req.body.years, 10);

  try {
    const player = await prisma.player.findUnique({ where: { id: Number(id) } });
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });
    if (player.team_id !== USER_TEAM_ID) return res.status(400).json({ error: 'Este jugador no pertenece a tu equipo' });
    if (player.contract_years_remaining > 2) return res.status(400).json({ error: 'El jugador debe tener 2 años o menos restantes para renovar' });
    if (!years || years < 1) return res.status(400).json({ error: 'Años de contrato inválidos' });

    const maxYears = Math.max(0, 40 - player.age);
    if (maxYears === 0) {
      return res.status(400).json({ error: 'El jugador ya no puede renovar (tiene 40 años o más)' });
    }
    if (years > maxYears) {
      return res.status(400).json({ error: `Máximo ${maxYears} año(s) de contrato para este jugador` });
    }

    // Renovar un rookie convierte el contrato a precio de mercado real
    const isRookie = player.rookie_contract;
    const marketSalary = isRookie
      ? calculateSalary(player.potential_coefficient, player.current_skill, player.age)
      : null;

    if (isRookie && newSalary < marketSalary) {
      return res.status(400).json({
        error: `Al renovar un rookie el salario mínimo es su valor de mercado: $${marketSalary.toLocaleString()}`,
        marketSalary,
      });
    }

    if (!isRookie && newSalary <= Number(player.salary)) {
      return res.status(400).json({ error: 'El nuevo salario debe ser mayor al salario actual' });
    }

    const updated = await prisma.player.update({
      where: { id: Number(id) },
      data: {
        salary: newSalary,
        contract_years_remaining: years,
        ...(isRookie && { rookie_contract: false }),
      },
    });

    res.json({ success: true, player: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al renovar contrato' });
  }
});

// GET /api/players/:id/stats -> estadísticas de la temporada para un jugador específico
router.get('/:id/stats', async (req, res) => {
  const playerId = Number(req.params.id);
  try {
    const season = await prisma.season.findFirst({ orderBy: { id: 'desc' } });
    if (!season) return res.json({ batting: null, pitching: null, seasonYear: null });

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, first_name: true, last_name: true, position: true, team_id: true },
    });
    if (!player) return res.status(404).json({ error: 'Jugador no encontrado' });

    const games = await prisma.gameSchedule.findMany({
      where: { season_id: season.id, status: 'finished' },
      select: { id: true, home_team_id: true, away_team_id: true, home_score: true, away_score: true },
    });
    const gameIds = games.map(g => g.id);

    if (gameIds.length === 0) {
      return res.json({ batting: { g: 0, ab: 0, h: 0, avg: null, hr: 0, rbi: 0, bb: 0, so: 0 }, pitching: null, seasonYear: season.year, player });
    }

    const batterEvents = await prisma.gameEvent.findMany({
      where: { game_id: { in: gameIds }, player_id: playerId },
      select: { game_id: true, result: true, runs_scored: true },
    });

    const b = { games: new Set(), ab: 0, h: 0, hr: 0, bb: 0, so: 0, rbi: 0 };
    for (const e of batterEvents) {
      b.games.add(e.game_id);
      if (['SO', 'GO', 'FO', '1B', '2B', '3B', 'HR'].includes(e.result)) b.ab++;
      if (['1B', '2B', '3B', 'HR'].includes(e.result)) b.h++;
      if (e.result === 'HR') b.hr++;
      if (e.result === 'BB') b.bb++;
      if (e.result === 'SO') b.so++;
      b.rbi += e.runs_scored || 0;
    }

    const batting = {
      g: b.games.size,
      ab: b.ab,
      h: b.h,
      avg: b.ab > 0 ? (b.h / b.ab).toFixed(3) : null,
      hr: b.hr,
      rbi: b.rbi,
      bb: b.bb,
      so: b.so,
    };

    let pitching = null;
    const pitcherLineups = await prisma.gameLineup.findMany({
      where: { game_id: { in: gameIds }, player_id: playerId, position: 'P' },
      select: { game_id: true, team_id: true },
    });

    if (pitcherLineups.length > 0) {
      const pitcherGameIds = pitcherLineups.map(l => l.game_id);
      const pitcherEvents = await prisma.gameEvent.findMany({
        where: { game_id: { in: pitcherGameIds } },
        select: { game_id: true, batting_team_id: true, result: true, runs_scored: true },
      });
      const eventsByGame = {};
      for (const e of pitcherEvents) {
        if (!eventsByGame[e.game_id]) eventsByGame[e.game_id] = [];
        eventsByGame[e.game_id].push(e);
      }

      const ps = { games: new Set(), outs: 0, er: 0, so: 0, bb: 0, h: 0, w: 0, l: 0 };
      for (const lineup of pitcherLineups) {
        ps.games.add(lineup.game_id);
        const events = (eventsByGame[lineup.game_id] || []).filter(e => e.batting_team_id !== lineup.team_id);
        for (const e of events) {
          if (['SO', 'GO', 'FO'].includes(e.result)) ps.outs++;
          if (e.result === 'SO') ps.so++;
          if (e.result === 'BB') ps.bb++;
          if (['1B', '2B', '3B', 'HR'].includes(e.result)) ps.h++;
          ps.er += e.runs_scored || 0;
        }
        const game = games.find(g => g.id === lineup.game_id);
        if (game) {
          const won = (game.home_team_id === lineup.team_id && game.home_score > game.away_score) ||
                      (game.away_team_id === lineup.team_id && game.away_score > game.home_score);
          if (won) ps.w++; else ps.l++;
        }
      }

      const ip_raw = ps.outs / 3;
      pitching = {
        g: ps.games.size,
        w: ps.w,
        l: ps.l,
        ip: ip_raw.toFixed(1),
        era: ip_raw > 0 ? ((ps.er / ip_raw) * 9).toFixed(2) : null,
        so: ps.so,
        bb: ps.bb,
        whip: ip_raw > 0 ? ((ps.bb + ps.h) / ip_raw).toFixed(2) : null,
      };
    }

    res.json({ batting, pitching, seasonYear: season.year, player });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener estadísticas del jugador' });
  }
});

module.exports = router;
