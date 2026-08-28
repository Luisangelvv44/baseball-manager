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

// Resumen de bateo/pitcheo por (player_id, team_id) para TODA la liga en una
// temporada dada, agrupado por stint (igual que getPlayerCareerHistory, pero
// para todos los jugadores de una temporada en vez de todas las temporadas de
// un jugador). Usado por seasonArchiveService.js para congelar la temporada en
// PlayerSeasonRecord justo antes de borrar sus game_events/game_lineups.
async function computeSeasonStintRecords(seasonId) {
  const games = await prisma.gameSchedule.findMany({
    where: { season_id: seasonId, status: 'finished' },
    select: { id: true, day_number: true, home_team_id: true, away_team_id: true, home_score: true, away_score: true },
  });
  const gameIds = games.map((g) => g.id);
  if (gameIds.length === 0) return [];
  const gameById = Object.fromEntries(games.map((g) => [g.id, g]));

  const batterEvents = await prisma.gameEvent.findMany({
    where: { game_id: { in: gameIds } },
    select: { game_id: true, player_id: true, result: true, runs_scored: true, batting_team_id: true },
  });

  const pitcherLineups = await prisma.gameLineup.findMany({
    where: { game_id: { in: gameIds }, position: 'P' },
    select: { game_id: true, player_id: true, team_id: true },
  });
  const pitcherGameEvents = await prisma.gameEvent.findMany({
    where: { game_id: { in: gameIds } },
    select: { game_id: true, batting_team_id: true, result: true, runs_scored: true },
  });
  const eventsByGame = {};
  for (const e of pitcherGameEvents) {
    if (!eventsByGame[e.game_id]) eventsByGame[e.game_id] = [];
    eventsByGame[e.game_id].push(e);
  }

  const stints = new Map();
  function getStint(playerId, teamId, dayNumber) {
    const key = `${playerId}:${teamId}`;
    if (!stints.has(key)) {
      stints.set(key, {
        player_id: playerId,
        team_id: teamId,
        first_day: dayNumber,
        batting: { games: new Set(), ab: 0, h: 0, hr: 0, bb: 0, so: 0, rbi: 0 },
        pitching: null,
      });
    }
    const s = stints.get(key);
    if (dayNumber < s.first_day) s.first_day = dayNumber;
    return s;
  }

  for (const e of batterEvents) {
    if (e.player_id == null || e.batting_team_id == null) continue;
    const game = gameById[e.game_id];
    if (!game) continue;
    const b = getStint(e.player_id, e.batting_team_id, game.day_number).batting;
    if (['SO', 'GO', 'FO', '1B', '2B', '3B', 'HR'].includes(e.result)) b.ab++;
    if (['1B', '2B', '3B', 'HR'].includes(e.result)) b.h++;
    if (e.result === 'HR') b.hr++;
    if (e.result === 'BB') b.bb++;
    if (e.result === 'SO') b.so++;
    b.rbi += e.runs_scored || 0;
    b.games.add(e.game_id);
  }

  for (const l of pitcherLineups) {
    if (l.player_id == null || l.team_id == null) continue;
    const game = gameById[l.game_id];
    if (!game) continue;
    const s = getStint(l.player_id, l.team_id, game.day_number);
    if (!s.pitching) s.pitching = { games: new Set(), outs: 0, er: 0, so: 0, bb: 0, h: 0, w: 0, l: 0 };
    const p = s.pitching;
    p.games.add(l.game_id);
    const events = (eventsByGame[l.game_id] || []).filter((e) => e.batting_team_id !== l.team_id);
    for (const e of events) {
      if (['SO', 'GO', 'FO'].includes(e.result)) p.outs++;
      if (e.result === 'SO') p.so++;
      if (e.result === 'BB') p.bb++;
      if (['1B', '2B', '3B', 'HR'].includes(e.result)) p.h++;
      p.er += e.runs_scored || 0;
    }
    const won = (game.home_team_id === l.team_id && game.home_score > game.away_score) ||
                (game.away_team_id === l.team_id && game.away_score > game.home_score);
    if (won) p.w++; else p.l++;
  }

  return [...stints.values()].map((s) => ({
    player_id: s.player_id,
    team_id: s.team_id,
    first_day: s.first_day,
    batting: {
      games: s.batting.games.size,
      at_bats: s.batting.ab,
      hits: s.batting.h,
      home_runs: s.batting.hr,
      walks: s.batting.bb,
      strikeouts: s.batting.so,
      rbi: s.batting.rbi,
    },
    pitching: s.pitching && {
      games: s.pitching.games.size,
      outs: s.pitching.outs,
      earned_runs: s.pitching.er,
      strikeouts: s.pitching.so,
      walks: s.pitching.bb,
      hits_allowed: s.pitching.h,
      wins: s.pitching.w,
      losses: s.pitching.l,
    },
  }));
}

// Historial completo por temporada y equipo de un jugador (para el modal "CV" en
// Mercado/Estrellas). A diferencia de computeSeasonStats, no se limita a una
// temporada ni usa el team_id actual del jugador: agrupa por (season_id, team_id)
// usando batting_team_id/GameLineup.team_id de cada juego, que reflejan el equipo
// real en ese momento (soporta traspasos a mitad de temporada).
async function getPlayerCareerHistory(playerId) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, first_name: true, last_name: true, position: true },
  });
  if (!player) return null;

  const batterEvents = await prisma.gameEvent.findMany({
    where: { player_id: playerId, game: { status: 'finished' } },
    select: {
      game_id: true,
      result: true,
      runs_scored: true,
      batting_team_id: true,
      game: { select: { season_id: true, day_number: true, season: { select: { year: true } } } },
    },
  });

  const pitcherLineups = await prisma.gameLineup.findMany({
    where: { player_id: playerId, position: 'P', game: { status: 'finished' } },
    select: {
      game_id: true,
      team_id: true,
      game: {
        select: {
          season_id: true,
          day_number: true,
          season: { select: { year: true } },
          home_team_id: true,
          away_team_id: true,
          home_score: true,
          away_score: true,
        },
      },
    },
  });

  const pitcherGameIds = [...new Set(pitcherLineups.map((l) => l.game_id))];
  const pitcherGameEvents = pitcherGameIds.length > 0
    ? await prisma.gameEvent.findMany({
        where: { game_id: { in: pitcherGameIds } },
        select: { game_id: true, batting_team_id: true, result: true, runs_scored: true },
      })
    : [];
  const eventsByGame = {};
  for (const e of pitcherGameEvents) {
    if (!eventsByGame[e.game_id]) eventsByGame[e.game_id] = [];
    eventsByGame[e.game_id].push(e);
  }

  const rows = new Map();
  function getRow(seasonId, year, teamId, dayNumber) {
    const key = `${seasonId}:${teamId}`;
    if (!rows.has(key)) {
      rows.set(key, { season_id: seasonId, year, team_id: teamId, min_day: dayNumber, batting: null, pitching: null });
    } else if (dayNumber < rows.get(key).min_day) {
      rows.get(key).min_day = dayNumber;
    }
    return rows.get(key);
  }

  const battingAgg = new Map();
  for (const e of batterEvents) {
    if (!e.game || e.batting_team_id == null) continue;
    const key = `${e.game.season_id}:${e.batting_team_id}`;
    if (!battingAgg.has(key)) {
      battingAgg.set(key, {
        season_id: e.game.season_id,
        year: e.game.season.year,
        team_id: e.batting_team_id,
        min_day: e.game.day_number,
        games: new Set(),
        ab: 0, h: 0, hr: 0, bb: 0, so: 0, rbi: 0,
      });
    }
    const s = battingAgg.get(key);
    s.games.add(e.game_id);
    if (e.game.day_number < s.min_day) s.min_day = e.game.day_number;
    if (['SO', 'GO', 'FO', '1B', '2B', '3B', 'HR'].includes(e.result)) s.ab++;
    if (['1B', '2B', '3B', 'HR'].includes(e.result)) s.h++;
    if (e.result === 'HR') s.hr++;
    if (e.result === 'BB') s.bb++;
    if (e.result === 'SO') s.so++;
    s.rbi += e.runs_scored || 0;
  }
  for (const s of battingAgg.values()) {
    const row = getRow(s.season_id, s.year, s.team_id, s.min_day);
    row.batting = {
      g: s.games.size,
      ab: s.ab,
      h: s.h,
      avg: s.ab > 0 ? (s.h / s.ab).toFixed(3) : null,
      hr: s.hr,
      rbi: s.rbi,
      bb: s.bb,
      so: s.so,
    };
  }

  const pitchingAgg = new Map();
  for (const l of pitcherLineups) {
    if (!l.game) continue;
    const key = `${l.game.season_id}:${l.team_id}`;
    if (!pitchingAgg.has(key)) {
      pitchingAgg.set(key, {
        season_id: l.game.season_id,
        year: l.game.season.year,
        team_id: l.team_id,
        min_day: l.game.day_number,
        games: new Set(),
        outs: 0, er: 0, so: 0, bb: 0, h: 0, w: 0, l: 0,
      });
    }
    const ps = pitchingAgg.get(key);
    ps.games.add(l.game_id);
    if (l.game.day_number < ps.min_day) ps.min_day = l.game.day_number;
    const events = (eventsByGame[l.game_id] || []).filter((e) => e.batting_team_id !== l.team_id);
    for (const e of events) {
      if (['SO', 'GO', 'FO'].includes(e.result)) ps.outs++;
      if (e.result === 'SO') ps.so++;
      if (e.result === 'BB') ps.bb++;
      if (['1B', '2B', '3B', 'HR'].includes(e.result)) ps.h++;
      ps.er += e.runs_scored || 0;
    }
    const g = l.game;
    const won = (g.home_team_id === l.team_id && g.home_score > g.away_score) ||
                (g.away_team_id === l.team_id && g.away_score > g.home_score);
    if (won) ps.w++; else ps.l++;
  }
  for (const ps of pitchingAgg.values()) {
    const row = getRow(ps.season_id, ps.year, ps.team_id, ps.min_day);
    const ip = ps.outs / 3;
    row.pitching = {
      g: ps.games.size,
      w: ps.w,
      l: ps.l,
      ip: ip.toFixed(1),
      era: ip > 0 ? ((ps.er / ip) * 9).toFixed(2) : null,
      so: ps.so,
      bb: ps.bb,
      whip: ip > 0 ? ((ps.bb + ps.h) / ip).toFixed(2) : null,
    };
  }

  // Temporadas ya archivadas (ver seasonArchiveService.js): sus game_events/game_lineups
  // fueron borrados al terminar la temporada, así que su resumen se lee de
  // PlayerSeasonRecord en vez de recalcularlo desde eventos crudos.
  const archivedRecords = await prisma.playerSeasonRecord.findMany({ where: { player_id: playerId } });
  for (const r of archivedRecords) {
    const row = getRow(r.season_id, r.year, r.team_id, r.first_day);
    if (r.games > 0) {
      row.batting = {
        g: r.games,
        ab: r.at_bats,
        h: r.hits,
        avg: r.at_bats > 0 ? (r.hits / r.at_bats).toFixed(3) : null,
        hr: r.home_runs,
        rbi: r.rbi,
        bb: r.walks,
        so: r.strikeouts,
      };
    }
    if (r.pitching_games > 0) {
      const ip = r.pitching_outs / 3;
      row.pitching = {
        g: r.pitching_games,
        w: r.wins,
        l: r.losses,
        ip: ip.toFixed(1),
        era: ip > 0 ? ((r.earned_runs / ip) * 9).toFixed(2) : null,
        so: r.pitching_strikeouts,
        bb: r.pitching_walks,
        whip: ip > 0 ? ((r.pitching_walks + r.hits_allowed) / ip).toFixed(2) : null,
      };
    }
  }

  const teamIds = [...new Set([...rows.values()].map((r) => r.team_id))];
  const teams = teamIds.length > 0
    ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } })
    : [];
  const teamNameById = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  // year no es único por temporada (se fija al año real de creación, ver routes/season.js),
  // así que el orden cronológico real es season_id; min_day solo desempata estadías
  // de distintos equipos dentro de la misma temporada (traspasos).
  const seasons = [...rows.values()]
    .sort((a, b) => b.season_id - a.season_id || a.min_day - b.min_day)
    .map((r) => ({
      season_id: r.season_id,
      year: r.year,
      team_id: r.team_id,
      team_name: teamNameById[r.team_id] || 'Desconocido',
      batting: r.batting,
      pitching: r.pitching,
    }));

  return { player, seasons };
}

module.exports = { computeSeasonStats, getPlayerCareerHistory, computeSeasonStintRecords };
