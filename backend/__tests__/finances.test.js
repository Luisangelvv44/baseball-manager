const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { mockTeam, mockFinance } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/finances', () => {
  it('returns budget, transactions, and summary', async () => {
    prisma.finance.findMany.mockResolvedValue([mockFinance]);
    prisma.$queryRaw
      .mockResolvedValueOnce([{ type: 'ticket_sales', total: 50000 }])
      .mockResolvedValueOnce([{ income: 60000, profit: 50000 }]);
    prisma.team.findUnique.mockResolvedValue({ budget: mockTeam.budget });
    prisma.season.count.mockResolvedValue(2);
    prisma.player.aggregate
      .mockResolvedValueOnce({ _avg: { salary: 500000 }, _count: { _all: 400 } })
      .mockResolvedValueOnce({ _avg: { salary: 450000 }, _count: { _all: 25 } });
    prisma.player.findMany.mockResolvedValue([
      { id: 1, first_name: 'A', last_name: 'B', position: 'SP', salary: 9000000, team: { id: 1, name: 'Test Team' } },
    ]);

    const res = await request(app).get('/api/finances');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('budget', mockTeam.budget);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.summary).toHaveLength(1);
    expect(res.body.totalIncome).toBe(60000);
    expect(res.body.totalProfit).toBe(50000);
    expect(res.body.seasonsCount).toBe(2);
    expect(res.body.avgIncomePerSeason).toBe(30000);
    expect(res.body.avgProfitPerSeason).toBe(25000);
    expect(res.body.leagueAvgSalary).toBe(500000);
    expect(res.body.leagueActivePlayerCount).toBe(400);
    expect(res.body.teamAvgSalary).toBe(450000);
    expect(res.body.teamActivePlayerCount).toBe(25);
    expect(res.body.topSalaries).toHaveLength(1);
  });

  it('returns null budget when team is not found', async () => {
    prisma.finance.findMany.mockResolvedValue([]);
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ income: 0, profit: 0 }]);
    prisma.team.findUnique.mockResolvedValue(null);
    prisma.season.count.mockResolvedValue(0);
    prisma.player.aggregate.mockResolvedValue({ _avg: { salary: null }, _count: { _all: 0 } });
    prisma.player.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/finances');
    expect(res.status).toBe(200);
    expect(res.body.budget).toBeUndefined();
    expect(res.body.transactions).toEqual([]);
    expect(res.body.avgIncomePerSeason).toBe(0);
    expect(res.body.avgProfitPerSeason).toBe(0);
    expect(res.body.leagueAvgSalary).toBe(0);
    expect(res.body.topSalaries).toEqual([]);
  });
});
