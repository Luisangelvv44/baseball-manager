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
    prisma.$queryRaw.mockResolvedValue([{ type: 'ticket_sales', total: 50000 }]);
    prisma.team.findUnique.mockResolvedValue({ budget: mockTeam.budget });

    const res = await request(app).get('/api/finances');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('budget', mockTeam.budget);
    expect(res.body.transactions).toHaveLength(1);
    expect(res.body.summary).toHaveLength(1);
  });

  it('returns null budget when team is not found', async () => {
    prisma.finance.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.team.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/finances');
    expect(res.status).toBe(200);
    expect(res.body.budget).toBeUndefined();
    expect(res.body.transactions).toEqual([]);
  });
});
