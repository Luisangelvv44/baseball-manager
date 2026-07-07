const request = require('supertest');

jest.mock('../db/prisma');
jest.mock('../seeders/generators/playerGenerator', () => ({
  calculateSalary: jest.fn().mockReturnValue(120000),
}));

const prisma = require('../db/prisma');
const { mockPlayer, mockFreeAgent, mockTeam, mockSeason } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/players/free-agents', () => {
  it('returns players with status free_agent', async () => {
    prisma.player.findMany.mockResolvedValue([mockFreeAgent]);
    const res = await request(app).get('/api/players/free-agents');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe('free_agent');
  });

  it('returns empty array when no free agents', async () => {
    prisma.player.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/players/free-agents');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('GET /api/players/scouted', () => {
  it('returns players with status scouted', async () => {
    const scoutedPlayer = { ...mockFreeAgent, id: 30, status: 'scouted' };
    prisma.player.findMany.mockResolvedValue([scoutedPlayer]);
    const res = await request(app).get('/api/players/scouted');
    expect(res.status).toBe(200);
    expect(res.body[0].status).toBe('scouted');
  });
});

describe('POST /api/players/:id/sign', () => {
  it('returns 404 when player not found', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/players/999/sign').send({ years: 1, salary: 80000 });
    expect(res.status).toBe(404);
  });

  it('returns 400 when player already has a team', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockFreeAgent, team_id: 3 });
    const res = await request(app).post('/api/players/20/sign').send({ years: 1, salary: 80000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pertenece a un equipo/);
  });

  it('returns 400 when player is 40 or older', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockFreeAgent, team_id: null, age: 40 });
    const res = await request(app).post('/api/players/20/sign').send({ years: 1, salary: 80000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/40 años/);
  });

  it('returns 400 when roster is full', async () => {
    prisma.player.findUnique.mockResolvedValue(mockFreeAgent);
    prisma.player.count.mockResolvedValue(25);
    const res = await request(app).post('/api/players/20/sign').send({ years: 1, salary: 80000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/roster está lleno/);
  });

  it('returns 400 when budget is insufficient for signing bonus', async () => {
    prisma.player.findUnique.mockResolvedValue(mockFreeAgent);
    prisma.player.count.mockResolvedValue(10);
    prisma.team.findUnique.mockResolvedValue({ ...mockTeam, budget: 100 });
    const res = await request(app).post('/api/players/20/sign').send({ years: 1, salary: 80000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/presupuesto/);
  });

  it('signs a player successfully and deducts the signing bonus', async () => {
    prisma.player.findUnique.mockResolvedValue(mockFreeAgent);
    prisma.player.count.mockResolvedValue(10);
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.player.update.mockResolvedValue({ ...mockFreeAgent, team_id: 1, status: 'active' });
    prisma.team.update.mockResolvedValue({ ...mockTeam, budget: mockTeam.budget - 8000 });
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.finance.create.mockResolvedValue({});

    const res = await request(app).post('/api/players/20/sign').send({ years: 2, salary: 80000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.signingBonus).toBe(8000);
  });
});
