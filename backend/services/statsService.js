const prisma = require('../db/prisma');

// Agrega bateo (AB/H/HR/BB/SO/RBI) y pitcheo (IP/ERA/WHIP/W/L/SO/BB) por jugador
// para una temporada dada. Si se pasa teamId, se limita a los jugadores de ese
// equipo (comportamiento de GET /api/players/team-stats); si se omite, agrega
// para todos los jugadores de la liga (usado por seasonAwardsService).
async function computeSeasonStats(seasonId, { teamId } = {}) {
  const games = await prisma.gameSchedule.findMany({
    where: { season_id: seasonId, status: 'finished' },
    select: { id: true, home_team_id: true, away_team_id: true, home_score: true, away_score: true },
  });
  const gameIds = games.map((g) => g.id);

  const players = await prisma.player.findMany({
    where: teamId ? { team_id: teamId } : {},
    select: { id: true, first_name: true, last_name: true, position: true, team_id: true, rookie_contract: true },
  });
  if (players.length === 0) return { stats: [] };

  const playerIds = players.map((p) => p.id);

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

  const pitcherGameIds = [...new Set(pitcherLineups.map((l) => l.game_id))];
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
    for (const { gameId, teamId: pitcherTeamId } of entries) {
      ps.games.add(gameId);
      const events = (pitcherEventsByGame[gameId] || []).filter((e) => e.batting_team_id !== pitcherTeamId);
      for (const e of events) {
        if (['SO', 'GO', 'FO'].includes(e.result)) ps.outs++;
        if (e.result === 'SO') ps.so++;
        if (e.result === 'BB') ps.bb++;
        if (['1B', '2B', '3B', 'HR'].includes(e.result)) ps.h++;
        ps.er += e.runs_scored || 0;
      }
      const game = games.find((g) => g.id === gameId);
      if (game) {
        const won = (game.home_team_id === pitcherTeamId && game.home_score > game.away_score) ||
                    (game.away_team_id === pitcherTeamId && game.away_score > game.home_score);
        if (won) ps.w++; else ps.l++;
      }
    }
    pitcherStats[id] = ps;
  }

  const stats = players.map((p) => {
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
        ip: ip_raw,
        era: ip_raw > 0 ? (ps.er / ip_raw) * 9 : null,
        so: ps.so,
        bb: ps.bb,
        er: ps.er,
        whip: ip_raw > 0 ? (ps.bb + ps.h) / ip_raw : null,
      };
    }

    return {
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      position: p.position,
      team_id: p.team_id,
      rookie_contract: p.rookie_contract,
      batting,
      pitching,
    };
  });

  return { stats };
}

module.exports = { computeSeasonStats };
