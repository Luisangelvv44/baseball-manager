const request = require('supertest');

jest.mock('../db/prisma');
jest.mock('../services/gamePlay', () => ({ playGame: jest.fn() }));
jest.mock('../services/economy', () => ({
  computeHomeGameRevenue: jest.fn(),
  computeAwayGameRevenue: jest.fn(),
}));
jest.mock('../services/playoffService', () => ({
  updateSeriesAfterGame: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../db/prisma');
const { playGame } = require('../services/gamePlay');
const { computeHomeGameRevenue, computeAwayGameRevenue } = require('../services/economy');
const { mockGame, mockFinishedGame, mockTeam, mockCpuTeam, mockGameEvent, mockSeason } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/games/:id', () => {
  it('returns 404 when game not found', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/games/999');
    expect(res.status).toBe(404);
  });

  it('returns game data with teams and events', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(mockGame);
    prisma.team.findUnique
      .mockResolvedValueOnce(mockTeam)
      .mockResolvedValueOnce(mockCpuTeam);
    prisma.gameEvent.findMany.mockResolvedValue([mockGameEvent]);

    const res = await request(app).get('/api/games/100');
    expect(res.status).toBe(200);
    expect(res.body.game.id).toBe(100);
    expect(res.body.homeTeam.id).toBe(1);
    expect(res.body.awayTeam.id).toBe(2);
    expect(res.body.events).toHaveLength(1);
  });
});

describe('POST /api/games/:id/simulate', () => {
  it('returns 404 when game not found', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/games/999/simulate');
    expect(res.status).toBe(404);
  });

  it('returns 400 when game is already finished', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(mockFinishedGame);
    const res = await request(app).post('/api/games/100/simulate');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/ya fue jugado/);
  });

  it('simulates a home game and returns economy data', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(mockGame);
    playGame.mockResolvedValue({
      homeScore: 5,
      awayScore: 3,
      events: [mockGameEvent],
      homeTeam: mockTeam,
      awayTeam: mockCpuTeam,
    });
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.stadiumSection.findMany.mockResolvedValue([]);
    computeHomeGameRevenue.mockReturnValue({
      ticketRevenue: 50000,
      merchRevenue: 7500,
      operatingCost: 5000,
      attendance: 1000,
      total: 52500,
    });
    prisma.team.update.mockResolvedValue(mockTeam);
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.finance.create.mockResolvedValue({});

    const res = await request(app).post('/api/games/100/simulate');
    expect(res.status).toBe(200);
    expect(res.body.homeScore).toBe(5);
    expect(res.body.awayScore).toBe(3);
    expect(res.body.isUserHome).toBe(true);
    expect(res.body.economy).toBeDefined();
  });

  it('returns 400 when roster is incomplete', async () => {
    prisma.gameSchedule.findUnique.mockResolvedValue(mockGame);
    const err = new Error('Roster incompleto');
    err.code = 'ROSTER_INCOMPLETO';
    playGame.mockRejectedValue(err);

    const res = await request(app).post('/api/games/100/simulate');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/roster/i);
  });
});
