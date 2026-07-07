const request = require('supertest');

jest.mock('../db/prisma');
jest.mock('../services/auctionService', () => ({
  calculateGrowthCoefficient: jest.fn().mockReturnValue(1.05),
  createAuctionsForFreeAgents: jest.fn().mockResolvedValue(0),
  runCpuBidding: jest.fn().mockResolvedValue(undefined),
  closeExpiredAuctions: jest.fn().mockResolvedValue(0),
  cancelAllActiveAuctions: jest.fn().mockResolvedValue(undefined),
}));

const prisma = require('../db/prisma');
const { mockSeason, mockTeam, mockAuction, mockFreeAgent } = require('./mockData');

const app = require('../index');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/auctions', () => {
  it('returns active auctions with growth_coefficient and userRosterCount', async () => {
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.freeAgentAuction.findMany.mockResolvedValue([mockAuction]);
    prisma.player.count.mockResolvedValue(12);

    const res = await request(app).get('/api/auctions');
    expect(res.status).toBe(200);
    expect(res.body.auctions).toHaveLength(1);
    expect(res.body.auctions[0]).toHaveProperty('growth_coefficient', 1.05);
    expect(res.body.userRosterCount).toBe(12);
  });
});

describe('POST /api/auctions/:id/bid', () => {
  it('returns 400 when bid amount is zero or invalid', async () => {
    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/inválido/);
  });

  it('returns 400 when years is missing or invalid', async () => {
    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 90000 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Aa]ños/);
  });

  it('returns 404 when auction not found', async () => {
    prisma.freeAgentAuction.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/auctions/999/bid').send({ amount: 90000, years: 1 });
    expect(res.status).toBe(404);
  });

  it('returns 400 when offered years exceed the player-age cap', async () => {
    prisma.freeAgentAuction.findUnique.mockResolvedValue({
      ...mockAuction,
      player: mockFreeAgent,
      bids: [],
    });
    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 90000, years: 20 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/año\(s\) de contrato/);
  });

  it('returns 400 when user is already the top bidder', async () => {
    prisma.freeAgentAuction.findUnique.mockResolvedValue({
      ...mockAuction,
      bids: [{ id: 1, auction_id: 1, team_id: 1, amount: 85000 }],
    });
    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 90000, years: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mejor postor/);
  });

  it('returns 400 when bid is below the minimum', async () => {
    prisma.freeAgentAuction.findUnique.mockResolvedValue({
      ...mockAuction,
      bids: [{ id: 1, auction_id: 1, team_id: 2, amount: 100000 }],
    });
    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 100000, years: 1 });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('minimumBid');
  });

  it('places a valid bid and extends the close day', async () => {
    prisma.freeAgentAuction.findUnique.mockResolvedValue({
      ...mockAuction,
      player: mockFreeAgent,
      bids: [],
    });
    prisma.player.count.mockResolvedValue(10);
    prisma.team.findUnique.mockResolvedValue(mockTeam);
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.auctionBid.create.mockResolvedValue({});
    prisma.freeAgentAuction.update.mockResolvedValue({});

    const res = await request(app).post('/api/auctions/1/bid').send({ amount: 90000, years: 3 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newHighBid).toBe(90000);
    expect(res.body.years).toBe(3);
    expect(res.body.closesOnDay).toBe(mockSeason.current_day + 5);
  });
});
