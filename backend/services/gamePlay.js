const prisma = require('../db/prisma');
const { getLineup } = require('./lineup');
const { simulateGame } = require('./gameSimulator');
const { checkAndApplyGameInjuries } = require('./injuryService');
const { backfillInjuredCpuPositions } = require('./cpuTeamManagement');
const { createNews } = require('./newsService');
const {
  detectPitcherGems,
  detectCycles,
  detectMultiHomerGames,
  isExtraInningsGame,
  computeTrailingStreak,
} = require('./newsDetection');
const { NEWS_STREAK_MILESTONE, NEWS_STREAK_LOOKBACK_GAMES } = require('../config');

// Simula un partido (schedule row), actualiza marcador/standings,
// y opcionalmente guarda el play-by-play en game_events.
// Devuelve { homeScore, awayScore, events, homeTeam, awayTeam, feats }
async function playGame(gameRow, saveEvents = false, skipStandings = false) {
  const homeLineup = await getLineup(gameRow.home_team_id, gameRow);
  const awayLineup = await getLineup(gameRow.away_team_id, gameRow);

  if (!homeLineup || !awayLineup) {
    const err = new Error('ROSTER_INCOMPLETO');
    err.code = 'ROSTER_INCOMPLETO';
    throw err;
  }

  const result = simulateGame(homeLineup, awayLineup, homeLineup.pitcher, awayLineup.pitcher);

  const injuredIds = await checkAndApplyGameInjuries(homeLineup, awayLineup);

  // Si una lesion deja a un equipo CPU sin ningun jugador sano en esa posicion, se le genera un
  // rookie para cubrirla (nunca al equipo del usuario; no corta a nadie ni respeta el tope de roster).
  const backfilledRookies = await backfillInjuredCpuPositions(injuredIds);

  await prisma.gameSchedule.update({
    where: { id: gameRow.id },
    data: { home_score: result.homeScore, away_score: result.awayScore, status: 'finished' },
  });

  const homeTeam = await prisma.team.findUnique({ where: { id: gameRow.home_team_id } });
  const awayTeam = await prisma.team.findUnique({ where: { id: gameRow.away_team_id } });

  if (!skipStandings) {
    const homeWon = result.homeScore > result.awayScore;
    await updateStandings(gameRow.home_team_id, result.homeScore, result.awayScore, homeWon);
    await updateStandings(gameRow.away_team_id, result.awayScore, result.homeScore, !homeWon);

    await checkAndCreateStreakNews(gameRow.home_team_id, homeTeam.name, gameRow.day_number, gameRow.season_id);
    await checkAndCreateStreakNews(gameRow.away_team_id, awayTeam.name, gameRow.day_number, gameRow.season_id);
  }

  if (saveEvents) {
    await prisma.gameEvent.createMany({
      data: result.events.map((ev) => ({
        game_id: gameRow.id,
        inning: ev.inning,
        half: ev.half,
        batting_team_id: ev.batting_team_id,
        player_id: ev.player_id,
        result: ev.result,
        outs_after: ev.outs_after,
        runs_scored: ev.runs_scored,
        event_order: ev.event_order,
      })),
    });
    await prisma.gameLineup.createMany({
      data: [
        { game_id: gameRow.id, player_id: homeLineup.pitcher.id, team_id: homeLineup.teamId, position: 'P' },
        { game_id: gameRow.id, player_id: awayLineup.pitcher.id, team_id: awayLineup.teamId, position: 'P' },
        ...homeLineup.players.map((p, i) => ({
          game_id: gameRow.id,
          player_id: p.id,
          team_id: homeLineup.teamId,
          position: p.position,
          batting_order: i + 1,
        })),
        ...awayLineup.players.map((p, i) => ({
          game_id: gameRow.id,
          player_id: p.id,
          team_id: awayLineup.teamId,
          position: p.position,
          batting_order: i + 1,
        })),
      ],
    });
  }

  const winner = result.homeScore > result.awayScore ? homeTeam.name : awayTeam.name;
  const loser  = result.homeScore > result.awayScore ? awayTeam.name : homeTeam.name;
  const hi = Math.max(result.homeScore, result.awayScore);
  const lo = Math.min(result.homeScore, result.awayScore);
  await createNews('game', `${winner} derrotó a ${loser} ${hi}-${lo}`, gameRow.day_number, gameRow.season_id);

  if (result.walkOff) {
    await createNews(
      'walkoff',
      `¡Walk-off! ${homeTeam.name} remontó para vencer a ${awayTeam.name} ${hi}-${lo}`,
      gameRow.day_number,
      gameRow.season_id
    );
  }

  if (isExtraInningsGame(result.finalInning)) {
    await createNews(
      'extra_innings',
      `${winner} superó a ${loser} ${hi}-${lo} en un duelo de innings extra (${result.finalInning} entradas)`,
      gameRow.day_number,
      gameRow.season_id
    );
  }

  const gems = detectPitcherGems(result.events, {
    homePitcherId: homeLineup.pitcher.id,
    awayPitcherId: awayLineup.pitcher.id,
    homeTeamId: gameRow.home_team_id,
    awayTeamId: gameRow.away_team_id,
  });
  const cycles = detectCycles(result.events);
  const multiHomers = detectMultiHomerGames(result.events);

  const featPlayerIds = [...new Set([
    ...gems.map((g) => g.pitcherId),
    ...cycles.map((c) => c.playerId),
    ...multiHomers.map((m) => m.playerId),
  ])];

  if (featPlayerIds.length > 0) {
    const featPlayers = await prisma.player.findMany({
      where: { id: { in: featPlayerIds } },
      select: { id: true, first_name: true, last_name: true },
    });
    const nameOf = (id) => {
      const p = featPlayers.find((pl) => pl.id === id);
      return p ? `${p.first_name} ${p.last_name}` : 'Un jugador';
    };
    const teamName = (teamId) => (teamId === homeTeam.id ? homeTeam.name : awayTeam.name);

    for (const g of gems) {
      const label = g.perfect ? 'juego perfecto' : 'no-hitter';
      await createNews(
        'no_hitter',
        `${nameOf(g.pitcherId)} (${teamName(g.teamId)}) lanzó un ${label} ante ${teamName(g.opponentTeamId)}`,
        gameRow.day_number,
        gameRow.season_id
      );
    }
    for (const c of cycles) {
      await createNews(
        'cycle',
        `${nameOf(c.playerId)} (${teamName(c.teamId)}) completó el ciclo (sencillo, doble, triple y jonrón)`,
        gameRow.day_number,
        gameRow.season_id
      );
    }
    for (const m of multiHomers) {
      await createNews(
        'multi_hr',
        `${nameOf(m.playerId)} (${teamName(m.teamId)}) conectó ${m.count} jonrones en el partido`,
        gameRow.day_number,
        gameRow.season_id
      );
    }
  }

  if (injuredIds.length > 0) {
    const injuredPlayers = await prisma.player.findMany({
      where: { id: { in: injuredIds.map((i) => i.id) } },
      select: { id: true, first_name: true, last_name: true, position: true },
    });
    const nameMap = Object.fromEntries(injuredPlayers.map((p) => [p.id, p]));
    for (const { id, days } of injuredIds) {
      const p = nameMap[id];
      if (p) await createNews('injury',
        `${p.first_name} ${p.last_name} (${p.position}) se lesionó por ${days} días`,
        gameRow.day_number,
        gameRow.season_id
      );
    }
  }

  for (const r of backfilledRookies) {
    await createNews('injury',
      `${r.teamName} firmó al novato ${r.createdPlayerName} (${r.position}) tras la lesión de ${r.injuredPlayerName}`,
      gameRow.day_number,
      gameRow.season_id
    );
  }

  return {
    homeScore: result.homeScore,
    awayScore: result.awayScore,
    events: result.events,
    homeTeam,
    awayTeam,
    homeLineup: formatLineup(homeLineup),
    awayLineup: formatLineup(awayLineup),
    feats: {
      walkOff: result.walkOff,
      finalInning: result.finalInning,
      noHitters: gems,
      cycles,
      multiHomers,
    },
  };
}

function formatLineup(lineup) {
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

async function checkAndCreateStreakNews(teamId, teamName, dayNumber, seasonId) {
  const recentGames = await prisma.gameSchedule.findMany({
    where: {
      status: 'finished',
      season_id: seasonId,
      OR: [{ home_team_id: teamId }, { away_team_id: teamId }],
    },
    orderBy: { day_number: 'desc' },
    take: NEWS_STREAK_LOOKBACK_GAMES,
    select: { home_team_id: true, away_team_id: true, home_score: true, away_score: true },
  });

  const { length, type } = computeTrailingStreak(recentGames, teamId);
  if (length === 0 || length % NEWS_STREAK_MILESTONE !== 0) return;

  const headline = type === 'W'
    ? `${teamName} extendió su racha ganadora a ${length} partidos`
    : `${teamName} acumula ${length} derrotas consecutivas`;
  await createNews('streak', headline, dayNumber, seasonId);
}

const FAN_MIN_REGULAR = 1000;
const FAN_MAX_REGULAR = 10000;

function randomFanMagnitude(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

async function applyRandomFanChange(teamId, won, min, max) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { fan_base: true } });
  const magnitude = randomFanMagnitude(min, max);
  const newFanBase = Math.max(10000, team.fan_base + (won ? magnitude : -magnitude));
  await prisma.team.update({ where: { id: teamId }, data: { fan_base: newFanBase } });
}

async function updateStandings(teamId, runsFor, runsAgainst, won) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { reputation: true, fan_base: true },
  });
  const newRep = Math.min(100, Math.max(1, team.reputation + (won ? 1 : -1)));

  // Ganar o perder mueve la fanaticada un monto aleatorio simétrico entre 1 000 y 10 000.
  const change = won
    ? randomFanMagnitude(FAN_MIN_REGULAR, FAN_MAX_REGULAR)
    : -randomFanMagnitude(FAN_MIN_REGULAR, FAN_MAX_REGULAR);
  const newFanBase = Math.max(10000, team.fan_base + change);

  await prisma.team.update({
    where: { id: teamId },
    data: {
      wins: { increment: won ? 1 : 0 },
      losses: { increment: won ? 0 : 1 },
      runs_scored: { increment: runsFor },
      runs_allowed: { increment: runsAgainst },
      reputation: newRep,
      fan_base: newFanBase,
    },
  });
}

module.exports = { playGame, randomFanMagnitude, applyRandomFanChange };
