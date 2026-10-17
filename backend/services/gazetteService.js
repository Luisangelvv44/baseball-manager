const prisma = require('../db/prisma');
const { USER_TEAM_ID } = require('../config');
const { getSeasonEdition } = require('./seasonEdition');

// Datos de una edición de "La Gaceta del Diamante": las noticias de un día de temporada más
// el contexto que el periódico muestra alrededor (marcadores por entrada, clasificación,
// mercado reciente e impuesto de lujo del equipo del usuario).

const HIT_RESULTS = new Set(['1B', '2B', '3B', 'HR']);
const MARKET_TYPES = ['auction', 'signing', 'trade'];
const MARKET_LIMIT = 6;
const MIN_INNINGS = 9;

const toNumber = (v) => (v == null ? null : Number(v));

// Marcador por entradas de un partido a partir de sus GameEvent. 'x' marca la baja de la
// última entrada que el local no necesitó batear.
function buildLinescore(game, events) {
  const lastInning = events.reduce((max, e) => Math.max(max, e.inning ?? 0), 0);
  const innings = Math.max(MIN_INNINGS, lastInning);
  const away = Array(innings).fill(0);
  const home = Array(innings).fill(0);
  let awayHits = 0;
  let homeHits = 0;
  let homeBatsLast = false;

  for (const e of events) {
    const idx = (e.inning ?? 1) - 1;
    if (idx < 0 || idx >= innings) continue;
    const hit = HIT_RESULTS.has(e.result);
    if (e.half === 'top') {
      away[idx] += e.runs_scored ?? 0;
      if (hit) awayHits++;
    } else {
      home[idx] += e.runs_scored ?? 0;
      if (hit) homeHits++;
      if (e.inning === lastInning) homeBatsLast = true;
    }
  }

  const homeLine = home.map((r, i) => (i === innings - 1 && !homeBatsLast && lastInning > 0 ? 'x' : r));

  return {
    id: game.id,
    playoff: game.playoff_series_id != null,
    innings,
    away: {
      team_id: game.away_team_id,
      name: game.away_team?.name ?? null,
      runs: game.away_score ?? 0,
      hits: awayHits,
      line: away,
    },
    home: {
      team_id: game.home_team_id,
      name: game.home_team?.name ?? null,
      runs: game.home_score ?? 0,
      hits: homeHits,
      line: homeLine,
    },
    winner: (game.home_score ?? 0) > (game.away_score ?? 0) ? 'home' : 'away',
    mine: game.home_team_id === USER_TEAM_ID || game.away_team_id === USER_TEAM_ID,
  };
}

function isMine(item, userTeamName) {
  if (item.team_id === USER_TEAM_ID) return true;
  return Boolean(userTeamName && item.headline?.includes(userTeamName));
}

async function resolveSeason(seasonId) {
  if (seasonId) return prisma.season.findUnique({ where: { id: seasonId } });
  return (await prisma.season.findFirst({ where: { status: 'active' } }))
    ?? prisma.season.findFirst({ orderBy: { id: 'desc' } });
}

async function buildGazette({ seasonId, day } = {}) {
  const season = await resolveSeason(seasonId);
  if (!season) return { season: null, day: null, days: [], items: [], games: [], standings: [], market: [], luxuryTax: null };

  const dayRows = await prisma.newsItem.findMany({
    where: { season_id: season.id },
    distinct: ['season_day'],
    select: { season_day: true },
    orderBy: { season_day: 'asc' },
  });
  const days = (dayRows || []).map((r) => r.season_day);
  const resolvedDay = day ?? (days.length ? days[days.length - 1] : season.current_day);

  const [edition, userTeam, items, games, teams, market, luxury] = await Promise.all([
    getSeasonEdition(season.id),
    prisma.team.findUnique({ where: { id: USER_TEAM_ID }, select: { id: true, name: true } }),
    prisma.newsItem.findMany({
      where: { season_id: season.id, season_day: resolvedDay },
      orderBy: { created_at: 'asc' },
      take: 200,
    }),
    prisma.gameSchedule.findMany({
      where: { season_id: season.id, day_number: resolvedDay, status: 'finished' },
      include: {
        home_team: { select: { name: true } },
        away_team: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.team.findMany({
      select: {
        id: true, name: true, wins: true, losses: true, runs_scored: true, runs_allowed: true,
        division: { select: { name: true } },
      },
    }),
    prisma.newsItem.findMany({
      where: { season_id: season.id, type: { in: MARKET_TYPES }, season_day: { lte: resolvedDay } },
      orderBy: [{ season_day: 'desc' }, { created_at: 'desc' }],
      take: MARKET_LIMIT,
    }),
    prisma.luxuryTaxRecord.findFirst({
      where: { season_id: season.id, team_id: USER_TEAM_ID, day: { lte: resolvedDay } },
      orderBy: { day: 'desc' },
    }),
  ]);

  const gameIds = (games || []).map((g) => g.id);
  const events = gameIds.length
    ? await prisma.gameEvent.findMany({
      where: { game_id: { in: gameIds } },
      select: { game_id: true, inning: true, half: true, runs_scored: true, result: true },
    })
    : [];
  const eventsByGame = new Map();
  for (const e of events || []) {
    if (!eventsByGame.has(e.game_id)) eventsByGame.set(e.game_id, []);
    eventsByGame.get(e.game_id).push(e);
  }

  const userTeamName = userTeam?.name ?? null;
  const standings = (teams || [])
    .map((t) => ({
      id: t.id,
      name: t.name,
      division: t.division?.name ?? null,
      wins: t.wins,
      losses: t.losses,
      run_diff: (t.runs_scored ?? 0) - (t.runs_allowed ?? 0),
      mine: t.id === USER_TEAM_ID,
    }))
    .sort((a, b) => b.wins - a.wins || a.losses - b.losses || b.run_diff - a.run_diff);

  return {
    season: { id: season.id, year: season.year, edition, current_day: season.current_day, status: season.status },
    userTeam,
    day: resolvedDay,
    days,
    items: (items || []).map((i) => ({ ...i, mine: isMine(i, userTeamName) })),
    games: (games || []).map((g) => buildLinescore(g, eventsByGame.get(g.id) || [])),
    standings,
    market: (market || []).map((i) => ({ ...i, mine: isMine(i, userTeamName) })),
    luxuryTax: luxury ? {
      day: luxury.day,
      charged: luxury.charged,
      payroll: toNumber(luxury.payroll),
      threshold: toNumber(luxury.threshold),
      cost_per_skill: toNumber(luxury.cost_per_skill),
      league_median_cost_per_skill: toNumber(luxury.league_median_cost_per_skill),
      bracket_tax: toNumber(luxury.bracket_tax),
      inefficiency_tax: toNumber(luxury.inefficiency_tax),
      total_tax: toNumber(luxury.total_tax),
    } : null,
  };
}

module.exports = { buildGazette, buildLinescore };
