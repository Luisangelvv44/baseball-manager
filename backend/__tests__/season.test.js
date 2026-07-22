const request = require('supertest');

jest.mock('../db/prisma');
jest.mock('../services/scheduleGenerator', () => ({ generateSchedule: jest.fn() }));
jest.mock('../services/gamePlay', () => ({ playGame: jest.fn() }));
jest.mock('../services/auctionService', () => ({
  createAuctionsForFreeAgents: jest.fn().mockResolvedValue(0),
  runCpuBidding: jest.fn().mockResolvedValue(undefined),
  closeExpiredAuctions: jest.fn().mockResolvedValue(0),
  cancelAllActiveAuctions: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/broadcastService', () => ({
  generateOffersForSeason: jest.fn().mockResolvedValue(undefined),
  processCpuTeamResponses: jest.fn().mockResolvedValue(undefined),
  finalizeContracts: jest.fn().mockResolvedValue(undefined),
  payBroadcastRevenue: jest.fn().mockResolvedValue(undefined),
  decrementContractSeasons: jest.fn().mockResolvedValue(undefined),
  OFFER_WINDOW_END_DAY: 999,
}));
jest.mock('../services/playoffService', () => ({
  generatePlayoffBracket: jest.fn().mockResolvedValue(undefined),
  updateSeriesAfterGame: jest.fn().mockResolvedValue(undefined),
  advancePlayoffRound: jest.fn().mockResolvedValue({ champion: false }),
}));
jest.mock('../services/retiredPlayer', () => ({ retireOldPlayers: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/playerService', () => ({
  fluctuatePlayerSkills: jest.fn().mockResolvedValue(undefined),
  updatePlayersContracts: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/cpuTeamManagement', () => ({ giveCpuTeamsRevenue: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/coachService', () => ({
  applyCoachBonuses: jest.fn().mockResolvedValue(undefined),
  deductCoachSalaries: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/draftService', () => ({ createDraft: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../services/injuryService', () => ({
  processInjuryRecovery: jest.fn().mockResolvedValue(undefined),
  clearAllInjuries: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/tradeService', () => ({
  generateCpuTradeOffers: jest.fn().mockResolvedValue(undefined),
  expireStaleTrades: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../seeders/generators/playerGenerator', () => ({
  calculateSalary: jest.fn().mockReturnValue(100000),
  generatePlayer: jest.fn().mockReturnValue({ name: 'Rookie', position: 'OF', age: 18, current_skill: 50, potential_coefficient: 0.6 }),
}));

const prisma = require('../db/prisma');
const { generateSchedule } = require('../services/scheduleGenerator');
const { mockSeason, mockTeam, mockCpuTeam, mockPlayer, mockGame } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/season', () => {
  it('returns null when no active season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/season');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('returns season with preSeasonDays when active', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    const res = await request(app).get('/api/season');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(res.body.status).toBe('active');
    expect(res.body).toHaveProperty('preSeasonDays');
  });
});

describe('POST /api/season/start', () => {
  it('returns 400 if active season already exists', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    const res = await request(app).post('/api/season/start');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('creates a new season when none exists', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    prisma.team.findMany
      .mockResolvedValueOnce([mockTeam, mockCpuTeam])
      .mockResolvedValueOnce([mockCpuTeam]);
    generateSchedule.mockReturnValue([
      { day_number: 1, home_team_id: 1, away_team_id: 2 },
      { day_number: 2, home_team_id: 2, away_team_id: 1 },
    ]);
    prisma.season.create.mockResolvedValue({ ...mockSeason, id: 2 });
    prisma.gameSchedule.createMany.mockResolvedValue({ count: 2 });
    prisma.player.findMany.mockResolvedValue([mockPlayer]);
    prisma.team.update.mockResolvedValue(mockTeam);
    prisma.finance.create.mockResolvedValue({});

    const res = await request(app).post('/api/season/start');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.season).toBeDefined();
    expect(res.body.totalGames).toBe(2);
  });
});

describe('POST /api/season/advance-day', () => {
  it('returns 400 if no active season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/season/advance-day');
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('returns userGameId when user game is pending for current day', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.gameSchedule.findMany.mockResolvedValue([
      { ...mockGame, status: 'scheduled', is_user_game: true },
    ]);
    const res = await request(app).post('/api/season/advance-day');
    expect(res.status).toBe(200);
    expect(res.body.advanced).toBe(false);
    expect(res.body.userGameId).toBe(mockGame.id);
  });

  it('advances the day and simulates CPU games', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.gameSchedule.findMany.mockResolvedValue([
      { id: 200, season_id: 1, day_number: 5, home_team_id: 2, away_team_id: 3, status: 'scheduled', is_user_game: false },
    ]);
    const { playGame } = require('../services/gamePlay');
    playGame.mockResolvedValue({ homeScore: 3, awayScore: 1 });
    prisma.season.update.mockResolvedValue({ ...mockSeason, current_day: 6 });
    prisma.gameSchedule.findFirst.mockResolvedValue(null);

    const res = await request(app).post('/api/season/advance-day');
    expect(res.status).toBe(200);
    expect(res.body.advanced).toBe(true);
    expect(res.body.simulated).toBe(1);
    expect(res.body.day).toBe(6);
  });
});

describe('GET /api/season/schedule', () => {
  it('returns empty array when no active season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).get('/api/season/schedule');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns schedule games with team names when season exists', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.gameSchedule.findMany.mockResolvedValue([mockGame]);
    const res = await request(app).get('/api/season/schedule');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].home_team).toBeDefined();
    expect(res.body[0].away_team).toBeDefined();
  });
});
