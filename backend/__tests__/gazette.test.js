const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { buildLinescore } = require('../services/gazetteService');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

const game = {
  id: 10, home_team_id: 1, away_team_id: 2, home_score: 3, away_score: 1, playoff_series_id: null,
  home_team: { name: 'Home' }, away_team: { name: 'Away' },
};

describe('buildLinescore', () => {
  it('sums runs and hits per half and marks the unplayed bottom 9th', () => {
    const events = [
      { inning: 1, half: 'top', runs_scored: 1, result: 'HR' },
      { inning: 2, half: 'bot', runs_scored: 0, result: '1B' },
      { inning: 2, half: 'bot', runs_scored: 3, result: '2B' },
      { inning: 9, half: 'top', runs_scored: 0, result: 'SO' },
    ];
    const ls = buildLinescore(game, events);
    expect(ls.innings).toBe(9);
    expect(ls.away.line).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ls.home.line).toEqual([0, 3, 0, 0, 0, 0, 0, 0, 'x']);
    expect(ls.away.hits).toBe(1);
    expect(ls.home.hits).toBe(2);
    expect(ls.winner).toBe('home');
    expect(ls.mine).toBe(true);
  });

  it('extends to extra innings and keeps the bottom half when the home team batted', () => {
    const events = [
      { inning: 11, half: 'top', runs_scored: 0, result: 'GO' },
      { inning: 11, half: 'bot', runs_scored: 1, result: '1B' },
    ];
    const ls = buildLinescore(game, events);
    expect(ls.innings).toBe(11);
    expect(ls.home.line[10]).toBe(1);
  });
});

describe('GET /api/news/gazette', () => {
  it('returns the latest day edition with games, standings and flags for the user team', async () => {
    prisma.season.findFirst.mockResolvedValue({ id: 3, year: 2026, current_day: 40, status: 'active' });
    prisma.season.count.mockResolvedValue(3);
    prisma.team.findUnique.mockResolvedValue({ id: 1, name: 'Home' });
    prisma.newsItem.findMany
      .mockResolvedValueOnce([{ season_day: 38 }, { season_day: 39 }])
      .mockResolvedValueOnce([
        { id: 1, type: 'game', headline: 'Home derrotó a Away 3-1', season_day: 39, team_id: null },
        { id: 2, type: 'game', headline: 'Foo derrotó a Bar 2-0', season_day: 39, team_id: null },
      ])
      .mockResolvedValueOnce([]);
    prisma.gameSchedule.findMany.mockResolvedValue([game]);
    prisma.team.findMany.mockResolvedValue([
      { id: 2, name: 'Away', wins: 10, losses: 5, runs_scored: 50, runs_allowed: 40, division: { name: 'Norte' } },
      { id: 1, name: 'Home', wins: 12, losses: 3, runs_scored: 60, runs_allowed: 30, division: { name: 'Norte' } },
    ]);
    prisma.luxuryTaxRecord.findFirst.mockResolvedValue(null);
    prisma.gameEvent.findMany.mockResolvedValue([{ game_id: 10, inning: 1, half: 'top', runs_scored: 1, result: 'HR' }]);

    const res = await request(app).get('/api/news/gazette');
    expect(res.status).toBe(200);
    expect(res.body.day).toBe(39);
    expect(res.body.days).toEqual([38, 39]);
    expect(res.body.season.edition).toBe(3);
    expect(res.body.items.map((i) => i.mine)).toEqual([true, false]);
    expect(res.body.games).toHaveLength(1);
    expect(res.body.standings[0]).toMatchObject({ id: 1, mine: true, run_diff: 30 });
    expect(prisma.gameSchedule.findMany.mock.calls[0][0].where).toMatchObject({ day_number: 39, status: 'finished' });
    expect(prisma.newsItem.findMany.mock.calls[1][0].where).toMatchObject({ season_id: 3, season_day: 39 });
  });

  it('returns an empty edition when there is no season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/news/gazette');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it('rejects a non-numeric day', async () => {
    const res = await request(app).get('/api/news/gazette?day=abc');
    expect(res.status).toBe(400);
  });
});
