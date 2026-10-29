jest.mock('../db/prisma');
jest.mock('../services/statsService', () => ({ computeSeasonStats: jest.fn() }));
jest.mock('../services/newsService', () => ({ createNews: jest.fn() }));
jest.mock('../services/contractService', () => ({ payAchievementBonus: jest.fn() }));

const prisma = require('../db/prisma');
const { computeSeasonStats } = require('../services/statsService');
const {
  getLeagueLeaders, getCachedLeagueLeaders, resetLeagueLeadersCache, seasonProgress,
} = require('../services/leagueLeadersService');
const { rankRookies } = require('../services/seasonAwardsService');

function batter(id, teamId, { ab, h, hr = 0, rbi = 0, rookie = false }) {
  return {
    player_id: id, first_name: `B${id}`, last_name: 'X', position: 'CF', team_id: teamId, rookie_contract: rookie,
    batting: { g: 10, ab, h, avg: (h / ab).toFixed(3), hr, rbi, bb: 0, so: 0 },
    pitching: null,
  };
}

function pitcher(id, teamId, { ip, era, w = 0, l = 0, so = 0, rookie = false }) {
  return {
    player_id: id, first_name: `P${id}`, last_name: 'Y', position: 'P', team_id: teamId, rookie_contract: rookie,
    batting: { g: 0, ab: 0, h: 0, avg: null, hr: 0, rbi: 0, bb: 0, so: 0 },
    pitching: { g: 5, w, l, ip, era, so, bb: 0, er: 0, whip: 1 },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.team.findMany.mockResolvedValue([{ id: 1, name: 'Wolves' }, { id: 2, name: 'Miners' }]);
});

describe('seasonProgress', () => {
  it('prorates finished regular-season games per team', () => {
    expect(seasonProgress(45, 2)).toBe(0.5); // 45 juegos x 2 equipos / 2 equipos / 90
    expect(seasonProgress(1000, 2)).toBe(1);
    expect(seasonProgress(10, 0)).toBe(0);
  });
});

describe('rankRookies', () => {
  it('ranks rookies by percentile within their category, counting each player once', () => {
    const batters = [batter(1, 1, { ab: 10, h: 5 }), batter(2, 1, { ab: 10, h: 4, rookie: true })];
    const twoWay = pitcher(3, 2, { ip: 10, era: 1, rookie: true });
    const pitchers = [twoWay, pitcher(4, 2, { ip: 10, era: 2, rookie: true })];
    const ranked = rankRookies([...batters, twoWay], pitchers);
    expect(ranked.map((c) => c.player.player_id)).toEqual([3, 2, 4]);
    expect(ranked[0].kind).toBe('pitcher');
  });
});

describe('getLeagueLeaders', () => {
  it('returns league and user-team leaders, categories and award races with prorated minimums', async () => {
    prisma.gameSchedule.count.mockResolvedValue(45); // mitad de temporada -> minAB 68, minIP 30
    computeSeasonStats.mockResolvedValue({
      stats: [
        batter(1, 1, { ab: 100, h: 40, hr: 10, rbi: 30 }),
        batter(2, 2, { ab: 100, h: 50, hr: 5, rbi: 20, rookie: true }),
        batter(3, 2, { ab: 20, h: 15, hr: 12, rbi: 40 }), // no califica para AVG
        pitcher(4, 1, { ip: 40, era: 2.5, w: 5, so: 50 }),
        pitcher(5, 2, { ip: 40, era: 1.5, w: 3, so: 60, rookie: true }),
      ],
    });

    const result = await getLeagueLeaders(7);

    expect(result.qualification).toEqual({ minAB: 68, minIP: 30 });
    expect(result.best.league.batter.player_id).toBe(2);
    expect(result.best.league.batter.team_name).toBe('Miners');
    expect(result.best.team.batter.player_id).toBe(1);
    expect(result.best.league.pitcher.player_id).toBe(5);
    expect(result.best.team.pitcher.player_id).toBe(4);
    expect(result.categories.avg.map((p) => p.player_id)).toEqual([2, 1]);
    expect(result.categories.hr[0].player_id).toBe(3);
    expect(result.categories.so[0].player_id).toBe(5);
    expect(result.races.mvp.map((p) => p.player_id)).toEqual([1, 2]); // 90 vs 80 de battingScore
    expect(result.races.cy_young.map((p) => p.player_id)).toEqual([5, 4]);
    expect(result.races.rookie.map((p) => [p.player_id, p.kind])).toEqual([[5, 'pitcher'], [2, 'batter']]);
  });
});

describe('getCachedLeagueLeaders', () => {
  const flush = () => new Promise((r) => setImmediate(r));
  // 2 equipos: cada juego terminado suma 1 juego por equipo
  const setFinished = (n) => prisma.gameSchedule.count.mockResolvedValue(n);

  beforeEach(() => {
    resetLeagueLeadersCache();
    prisma.team.count.mockResolvedValue(2);
    computeSeasonStats.mockResolvedValue({ stats: [batter(1, 1, { ab: 10, h: 5 })] });
  });

  it('computes inline only when nothing is cached, then serves the cache', async () => {
    setFinished(10);
    await getCachedLeagueLeaders(7);
    await getCachedLeagueLeaders(7);
    expect(computeSeasonStats).toHaveBeenCalledTimes(1);
  });

  it('serves the stale cache and refreshes in background after 5 games per team', async () => {
    setFinished(10);
    const first = await getCachedLeagueLeaders(7);

    setFinished(14); // 4 juegos: sigue fresco
    expect(await getCachedLeagueLeaders(7)).toBe(first);
    expect(computeSeasonStats).toHaveBeenCalledTimes(1);

    setFinished(15); // 5 juegos: devuelve lo cacheado y recalcula de fondo
    expect(await getCachedLeagueLeaders(7)).toBe(first);
    await flush();
    expect(computeSeasonStats).toHaveBeenCalledTimes(2);
    const next = await getCachedLeagueLeaders(7);
    expect(next).not.toBe(first);
    expect(computeSeasonStats).toHaveBeenCalledTimes(2);
  });

  it('refreshes as soon as games start when the cache was built with none', async () => {
    setFinished(0);
    await getCachedLeagueLeaders(7);
    setFinished(1);
    await getCachedLeagueLeaders(7);
    await flush();
    expect(computeSeasonStats).toHaveBeenCalledTimes(2);
  });

  it('computes inline for a new season', async () => {
    setFinished(10);
    await getCachedLeagueLeaders(7);
    await getCachedLeagueLeaders(8);
    expect(computeSeasonStats).toHaveBeenCalledTimes(2);
    expect(computeSeasonStats).toHaveBeenLastCalledWith(8);
  });
});
