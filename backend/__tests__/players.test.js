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

describe('POST /api/players/:id/promote', () => {
  it('returns 404 when player not found', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/players/999/promote');
    expect(res.status).toBe(404);
  });

  it('returns 400 when player is not in the user Minors roster', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MAJOR' });
    const res = await request(app).post('/api/players/10/promote');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Ligas Menores/);
  });

  it('returns 400 when the Majors roster is full', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MINOR' });
    prisma.player.count.mockResolvedValue(25);
    const res = await request(app).post('/api/players/10/promote');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Mayores está lleno/);
  });

  it('promotes a rookie and multiplies salary by 10', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MINOR', rookie_contract: true, salary: 50000 });
    prisma.player.count.mockResolvedValue(10);
    prisma.player.update.mockResolvedValue({ ...mockPlayer, level: 'MAJOR', rookie_contract: false, salary: 500000 });
    prisma.season.findFirst.mockResolvedValue(mockSeason);

    const res = await request(app).post('/api/players/10/promote');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { level: 'MAJOR', salary: 500000, rookie_contract: false },
    });
  });

  it('promotes a non-rookie without touching salary', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MINOR', rookie_contract: false });
    prisma.player.count.mockResolvedValue(10);
    prisma.player.update.mockResolvedValue({ ...mockPlayer, level: 'MAJOR' });
    prisma.season.findFirst.mockResolvedValue(mockSeason);

    const res = await request(app).post('/api/players/10/promote');
    expect(res.status).toBe(200);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { level: 'MAJOR' },
    });
  });
});

describe('POST /api/players/:id/demote', () => {
  it('returns 404 when player not found', async () => {
    prisma.player.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/players/999/demote');
    expect(res.status).toBe(404);
  });

  it('returns 400 when player is not in the user Majors roster', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MINOR' });
    const res = await request(app).post('/api/players/10/demote');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Mayores/);
  });

  it('returns 400 when the Minors roster is full', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MAJOR' });
    prisma.player.count.mockResolvedValue(15);
    const res = await request(app).post('/api/players/10/demote');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Minors está lleno/);
  });

  it('demotes a player and clears their lineup slot', async () => {
    prisma.player.findUnique.mockResolvedValue({ ...mockPlayer, level: 'MAJOR' });
    prisma.player.count.mockResolvedValue(5);
    prisma.teamLineup.deleteMany.mockResolvedValue({ count: 1 });
    prisma.player.update.mockResolvedValue({ ...mockPlayer, level: 'MINOR' });

    const res = await request(app).post('/api/players/10/demote');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.teamLineup.deleteMany).toHaveBeenCalledWith({ where: { player_id: 10 } });
  });
});

describe('POST /api/players/:id/renew - MINOR level', () => {
  it('rejects a salary lower than the current one', async () => {
    prisma.player.findUnique.mockResolvedValue({
      ...mockPlayer, level: 'MINOR', rookie_contract: true, salary: 50000, contract_years_remaining: 1,
    });
    const res = await request(app).post('/api/players/10/renew').send({ salary: 40000, years: 2 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/igual o mayor/);
  });

  it('accepts the same salary and leaves rookie_contract untouched', async () => {
    prisma.player.findUnique.mockResolvedValue({
      ...mockPlayer, level: 'MINOR', rookie_contract: true, salary: 50000, contract_years_remaining: 1,
    });
    prisma.player.update.mockResolvedValue({ ...mockPlayer, level: 'MINOR', salary: 50000, contract_years_remaining: 2 });

    const res = await request(app).post('/api/players/10/renew').send({ salary: 50000, years: 2 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { salary: 50000, contract_years_remaining: 2 },
    });
  });

  it('accepts a higher salary', async () => {
    prisma.player.findUnique.mockResolvedValue({
      ...mockPlayer, level: 'MINOR', rookie_contract: true, salary: 50000, contract_years_remaining: 1,
    });
    prisma.player.update.mockResolvedValue({ ...mockPlayer, level: 'MINOR', salary: 60000, contract_years_remaining: 3 });

    const res = await request(app).post('/api/players/10/renew').send({ salary: 60000, years: 3 });
    expect(res.status).toBe(200);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { salary: 60000, contract_years_remaining: 3 },
    });
  });
});
