const request = require('supertest');

jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { mockSeason } = require('./mockData');
const { TRADE_DEADLINE_DAY } = require('../config');

const app = require('../index');

const userPlayer = {
  id: 10, first_name: 'Juan', last_name: 'Perez', position: 'SS', age: 28,
  current_skill: 85, potential_coefficient: 40, growth_age: 30,
  salary: 200000, contract_years_remaining: 1, rookie_contract: false,
  team_id: 1, status: 'active', injury_days_remaining: 0, level: 'MAJOR',
};

const cpuPlayer = {
  id: 20, first_name: 'Pedro', last_name: 'Gomez', position: '2B', age: 24,
  current_skill: 45, potential_coefficient: 25, growth_age: 26,
  salary: 60000, contract_years_remaining: 1, rookie_contract: false,
  team_id: 2, status: 'active', injury_days_remaining: 0, level: 'MAJOR',
};

const userTeamFull = { id: 1, name: 'Test Team', budget: 5000000, is_user_team: true };
const cpuTeamFull = { id: 2, name: 'CPU Team', budget: 4000000, is_user_team: false, bid_aggressiveness: 0.1 };

function teamById(args) {
  const id = args.where.id;
  if (id === 1) return Promise.resolve(userTeamFull);
  if (id === 2) return Promise.resolve(cpuTeamFull);
  return Promise.resolve(null);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/trades/sent', () => {
  it('returns trades proposed by the user team', async () => {
    prisma.trade.findMany.mockResolvedValue([{ id: 1, proposer_team_id: 1, recipient_team_id: 2, status: 'pending', items: [] }]);
    const res = await request(app).get('/api/trades/sent');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /api/trades validation', () => {
  it('returns 400 when recipientTeamId is missing or equals the user team', async () => {
    const res = await request(app).post('/api/trades').send({ recipientTeamId: 1, offeredPlayerIds: [10], requestedPlayerIds: [20] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/receptor/);
  });

  it('returns 400 when no players are selected on one side', async () => {
    const res = await request(app).post('/api/trades').send({ recipientTeamId: 2, offeredPlayerIds: [], requestedPlayerIds: [20] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/jugador/);
  });

  it('returns 400 when there is no active season', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    const res = await request(app).post('/api/trades').send({ recipientTeamId: 2, offeredPlayerIds: [10], requestedPlayerIds: [20] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/temporada activa/);
  });

  it('returns 400 when past the trade deadline', async () => {
    prisma.season.findFirst.mockResolvedValue({ ...mockSeason, current_day: TRADE_DEADLINE_DAY });
    prisma.team.findUnique.mockImplementation(teamById);
    prisma.player.findMany.mockResolvedValue([userPlayer, cpuPlayer]);

    const res = await request(app).post('/api/trades').send({ recipientTeamId: 2, offeredPlayerIds: [10], requestedPlayerIds: [20] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/día/);
  });

  it('returns 400 when the trade would leave a roster over the max size', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.team.findUnique.mockImplementation(teamById);
    prisma.player.findMany.mockResolvedValue([userPlayer, cpuPlayer, { ...cpuPlayer, id: 21 }]);
    prisma.player.count.mockResolvedValue(25); // both rosters already at cap

    const res = await request(app).post('/api/trades').send({
      recipientTeamId: 2, offeredPlayerIds: [10], requestedPlayerIds: [20, 21],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/máximo/);
  });
});

describe('POST /api/trades acceptance flow', () => {
  it('resolves a favorable offer immediately, moves players and adjusts budgets', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.team.findUnique.mockImplementation(teamById);
    prisma.player.findMany.mockResolvedValue([userPlayer, cpuPlayer]);
    prisma.player.count.mockResolvedValue(10);
    prisma.trade.create.mockResolvedValue({ id: 100 });
    prisma.trade.findUnique.mockResolvedValue({
      id: 100,
      proposer_team_id: 1,
      recipient_team_id: 2,
      cash_offered: 10000,
      cash_requested: 0,
      status: 'pending',
      proposer_team: { id: 1, name: 'Test Team' },
      recipient_team: { id: 2, name: 'CPU Team' },
      items: [
        { id: 1, trade_id: 100, player_id: 10, from_team_id: 1, player: userPlayer },
        { id: 2, trade_id: 100, player_id: 20, from_team_id: 2, player: cpuPlayer },
      ],
    });
    prisma.player.update.mockResolvedValue({});
    prisma.teamLineup.deleteMany.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.finance.create.mockResolvedValue({});
    prisma.trade.update.mockResolvedValue({});
    prisma.newsItem.create.mockResolvedValue({});

    const res = await request(app).post('/api/trades').send({
      recipientTeamId: 2, offeredPlayerIds: [10], requestedPlayerIds: [20], cashOffered: 10000,
    });

    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(true);

    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 10 }, data: { team_id: 2 } });
    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { team_id: 1 } });
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { budget: { decrement: 10000 } } });
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { budget: { increment: 10000 } } });
    expect(prisma.finance.create).toHaveBeenCalled();
    expect(prisma.trade.update).toHaveBeenCalledWith({ where: { id: 100 }, data: { status: 'accepted', resolved_day: mockSeason.current_day } });
  });
});
