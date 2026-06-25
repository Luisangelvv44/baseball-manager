const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { mockTeam, mockCpuTeam, mockPlayer } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/teams', () => {
  it('returns all teams with division_name', async () => {
    prisma.team.findMany.mockResolvedValue([
      { ...mockTeam, division: { id: 1, name: 'East' } },
      { ...mockCpuTeam, division: { id: 1, name: 'East' } },
    ]);

    const res = await request(app).get('/api/teams');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toHaveProperty('division_name', 'East');
  });
});

describe('GET /api/teams/user', () => {
  it('returns the user team with its roster', async () => {
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.player.findMany.mockResolvedValue([mockPlayer]);

    const res = await request(app).get('/api/teams/user');
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(1);
    expect(res.body.players).toHaveLength(1);
  });
});

describe('GET /api/teams/:id', () => {
  it('returns the requested team with its roster', async () => {
    prisma.team.findUnique.mockResolvedValue(mockCpuTeam);
    prisma.player.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/teams/2');
    expect(res.status).toBe(200);
    expect(res.body.team.id).toBe(2);
    expect(res.body.players).toEqual([]);
  });

  it('returns 404 when team is not found', async () => {
    prisma.team.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/teams/999');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
