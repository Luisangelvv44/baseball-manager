const prisma = require('../db/prisma');
const { computeSeasonStats } = require('./statsService');
const { battingScore, qualifyStats, rankRookies } = require('./seasonAwardsService');
const {
  GAMES_PER_SEASON, SEASON_AWARD_MIN_AB, SEASON_AWARD_MIN_IP, USER_TEAM_ID, LEAGUE_LEADERS_CACHE_GAMES,
} = require('../config');

const CATEGORY_LIMIT = 5;
const RACE_LIMIT = 3;

// Fraccion de la temporada regular ya jugada (0..1), a partir de los partidos terminados:
// cada partido cuenta para dos equipos.
function seasonProgress(finishedRegularGames, teamCount) {
  if (teamCount === 0) return 0;
  return Math.min(1, (finishedRegularGames * 2) / teamCount / GAMES_PER_SEASON);
}

function toEntry(p, teamName) {
  return {
    player_id: p.player_id,
    first_name: p.first_name,
    last_name: p.last_name,
    position: p.position,
    team_id: p.team_id,
    team_name: teamName(p.team_id),
    rookie: !!p.rookie_contract,
    batting: p.batting,
    pitching: p.pitching,
  };
}

// Lideres de la temporada para el Dashboard: mejor bateador/lanzador de la liga y del equipo
// del usuario, top por categoria y la carrera por MVP / Cy Young / Novato del Año. Los minimos
// de calificacion (AB/IP) se prorratean segun lo jugado, con el mismo criterio que los premios.
async function getLeagueLeaders(seasonId) {
  const [{ stats }, teams, finishedRegularGames] = await Promise.all([
    computeSeasonStats(seasonId),
    prisma.team.findMany({ select: { id: true, name: true } }),
    prisma.gameSchedule.count({ where: { season_id: seasonId, status: 'finished', playoff_series_id: null } }),
  ]);
  const teamName = (id) => teams.find((t) => t.id === id)?.name ?? 'Agente libre';
  const entry = (p) => toEntry(p, teamName);

  const progress = seasonProgress(finishedRegularGames, teams.length);
  const minAB = Math.max(1, Math.round(SEASON_AWARD_MIN_AB * progress));
  const minIP = Math.max(1, Math.round(SEASON_AWARD_MIN_IP * progress));

  const { qualifiedBatters, qualifiedPitchers } = qualifyStats(stats, minAB, minIP);
  const byAvg = (a, b) => parseFloat(b.batting.avg) - parseFloat(a.batting.avg) || b.batting.h - a.batting.h;
  const byEra = (a, b) => a.pitching.era - b.pitching.era || b.pitching.ip - a.pitching.ip;

  const top = (list, cmp, limit = CATEGORY_LIMIT) => [...list].sort(cmp).slice(0, limit).map(entry);
  const batters = stats.filter((p) => p.batting.ab > 0);
  const pitchers = stats.filter((p) => p.pitching && p.pitching.ip > 0);

  const bestOf = (list, cmp) => (list.length > 0 ? entry([...list].sort(cmp)[0]) : null);
  const isUser = (p) => p.team_id === USER_TEAM_ID;

  return {
    progress,
    qualification: { minAB, minIP },
    best: {
      league: { batter: bestOf(qualifiedBatters, byAvg), pitcher: bestOf(qualifiedPitchers, byEra) },
      team: {
        batter: bestOf(qualifiedBatters.filter(isUser), byAvg),
        pitcher: bestOf(qualifiedPitchers.filter(isUser), byEra),
      },
    },
    categories: {
      avg: top(qualifiedBatters, byAvg),
      hr: top(batters, (a, b) => b.batting.hr - a.batting.hr || b.batting.rbi - a.batting.rbi),
      rbi: top(batters, (a, b) => b.batting.rbi - a.batting.rbi || b.batting.hr - a.batting.hr),
      era: top(qualifiedPitchers, byEra),
      w: top(pitchers, (a, b) => b.pitching.w - a.pitching.w || a.pitching.l - b.pitching.l),
      so: top(pitchers, (a, b) => b.pitching.so - a.pitching.so || b.pitching.w - a.pitching.w),
    },
    races: {
      mvp: qualifiedBatters.slice(0, RACE_LIMIT).map((p) => ({ ...entry(p), score: battingScore(p.batting) })),
      cy_young: qualifiedPitchers.slice(0, RACE_LIMIT).map(entry),
      rookie: rankRookies(qualifiedBatters, qualifiedPitchers)
        .slice(0, RACE_LIMIT)
        .map((c) => ({ ...entry(c.player), kind: c.kind, percentile: c.percentile })),
    },
  };
}

// Cache en memoria (stale-while-revalidate): se sirve siempre lo cacheado y, cuando la liga avanzo
// LEAGUE_LEADERS_CACHE_GAMES juegos por equipo desde el ultimo calculo, se recalcula en segundo plano
// para que la siguiente consulta ya traiga lo nuevo. Solo se calcula en linea si no hay nada cacheado
// para la temporada.
let cache = null; // { seasonId, gamesPerTeam, data }
let refreshing = null; // { seasonId, promise } del recalculo en curso (evita duplicados)

async function gamesPlayedPerTeam(seasonId) {
  const [finished, teamCount] = await Promise.all([
    prisma.gameSchedule.count({ where: { season_id: seasonId, status: 'finished' } }),
    prisma.team.count(),
  ]);
  return teamCount === 0 ? 0 : (finished * 2) / teamCount;
}

function refreshLeagueLeaders(seasonId, gamesPerTeam) {
  if (refreshing && refreshing.seasonId === seasonId) return refreshing.promise;
  const current = { seasonId };
  current.promise = getLeagueLeaders(seasonId)
    .then((data) => {
      cache = { seasonId, gamesPerTeam, data };
      return data;
    })
    .finally(() => {
      if (refreshing === current) refreshing = null;
    });
  refreshing = current;
  return current.promise;
}

async function getCachedLeagueLeaders(seasonId) {
  const gamesPerTeam = await gamesPlayedPerTeam(seasonId);
  if (!cache || cache.seasonId !== seasonId) return refreshLeagueLeaders(seasonId, gamesPerTeam);

  const advanced = gamesPerTeam - cache.gamesPerTeam;
  // Cache sin juegos (pre-temporada) se refresca apenas haya alguno, para no esperar 5 dias vacio
  const stale = advanced >= LEAGUE_LEADERS_CACHE_GAMES || advanced < 0 || (cache.gamesPerTeam === 0 && advanced > 0);
  if (stale) {
    refreshLeagueLeaders(seasonId, gamesPerTeam).catch((err) => console.error('Error refrescando líderes:', err));
  }
  return cache.data;
}

function resetLeagueLeadersCache() {
  cache = null;
  refreshing = null;
}

module.exports = { getLeagueLeaders, getCachedLeagueLeaders, resetLeagueLeadersCache, seasonProgress };
