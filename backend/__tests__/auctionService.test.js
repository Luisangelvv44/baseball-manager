jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const auctionService = require('../services/auctionService');
const { calculateSigningCost, closeExpiredAuctions, runCpuBidding } = auctionService;
const { USER_TEAM_ID } = require('../config');
const { mockSeason } = require('./mockData');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('calculateSigningCost', () => {
  it('matches the $10M x 5 year example: bonus = total contract * 20%, plus current season salary', () => {
    const result = calculateSigningCost(10_000_000, 5);
    expect(result).toEqual({ signingBonus: 10_000_000, seasonSalary: 10_000_000, total: 20_000_000 });
  });

  it('rounds non-round amounts', () => {
    const result = calculateSigningCost(83333, 3);
    expect(result.signingBonus).toBe(Math.round(83333 * 3 * 0.2));
    expect(result.seasonSalary).toBe(83333);
    expect(result.total).toBe(result.signingBonus + result.seasonSalary);
  });
});

describe('closeExpiredAuctions', () => {
  it('charges bono de firma + salario de temporada actual and logs two Finance rows for a USER_TEAM_ID winner', async () => {
    const auction = {
      id: 1,
      player_id: 20,
      player: { id: 20, first_name: 'John', last_name: 'Doe' },
      bids: [{ team_id: USER_TEAM_ID, amount: 100000, years: 2 }],
    };

    prisma.freeAgentAuction.findMany.mockResolvedValue([auction]);
    prisma.team.findUnique.mockResolvedValue({ id: USER_TEAM_ID, budget: 1_000_000, name: 'User Team' });
    prisma.player.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.freeAgentAuction.update.mockResolvedValue({});
    prisma.finance.create.mockResolvedValue({});
    prisma.newsItem.create.mockResolvedValue({});

    const closed = await closeExpiredAuctions(null, mockSeason);

    expect(closed).toBe(1);

    // bono 20% of (100000*2) = 40000, salario = 100000, total = 140000
    expect(prisma.team.update).toHaveBeenCalledTimes(1);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: USER_TEAM_ID },
      data: { budget: { decrement: 140000 } },
    });

    expect(prisma.finance.create).toHaveBeenCalledTimes(2);
    expect(prisma.finance.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ type: 'signing', amount: -40000 }),
    });
    expect(prisma.finance.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ type: 'salaries', amount: -100000 }),
    });

    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: {
        team_id: USER_TEAM_ID,
        status: 'active',
        level: 'MAJOR',
        salary: 100000,
        contract_years_remaining: 2,
      },
    });
  });

  it('skips a CPU winner who cannot cover the combined total and cancels the auction when no one else bid', async () => {
    const cpuTeamId = 2;
    const auction = {
      id: 1,
      player_id: 20,
      player: { id: 20, first_name: 'Jane', last_name: 'Roe' },
      bids: [{ team_id: cpuTeamId, amount: 100000, years: 5 }],
    };

    prisma.freeAgentAuction.findMany.mockResolvedValue([auction]);
    // bono 20% of (100000*5) = 100000, salario = 100000, total = 200000 -> unaffordable at 50000
    prisma.team.findUnique.mockResolvedValue({ id: cpuTeamId, budget: 50000 });
    prisma.freeAgentAuction.update.mockResolvedValue({});

    const closed = await closeExpiredAuctions(null, mockSeason);

    expect(closed).toBe(0);
    expect(prisma.freeAgentAuction.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'cancelled' },
    });
    expect(prisma.finance.create).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
  });
});

describe('runCpuBidding', () => {
  it('lowers the offered years (never below 1) when the tentative years would exceed available cash', async () => {
    const cpuTeam = { id: 2, budget: 120000, bid_aggressiveness: 1.0, min_growth_threshold: 0 };
    const player = {
      id: 20, position: '1B', current_skill: 65, potential_coefficient: 50,
      growth_age: 25, age: 30, salary: 80000,
    };
    const auction = { id: 1, player, bids: [] };

    prisma.freeAgentAuction.findMany
      .mockResolvedValueOnce([auction]) // activeAuctions
      .mockResolvedValueOnce([]);       // activeAuctionsSnapshot (no pending bids)
    prisma.team.findMany.mockResolvedValue([cpuTeam]);
    prisma.player.groupBy.mockResolvedValue([]); // rosterCounts and salaryTotals both empty
    prisma.player.findMany.mockResolvedValue([]); // buildWeakestByTeamPosition roster snapshot
    prisma.auctionBid.create.mockResolvedValue({});
    prisma.freeAgentAuction.update.mockResolvedValue({});

    // 1st Math.random() -> tentativeYears = 1 + floor(0.99 * 5) = 5
    // 2nd Math.random() -> increment = 0.05 + 0 * 0.05 = 0.05 -> proposed = round(80000*1.05) = 84000
    const randomSpy = jest.spyOn(Math, 'random');
    randomSpy.mockReturnValueOnce(0.99).mockReturnValueOnce(0);

    await runCpuBidding(null, mockSeason);

    randomSpy.mockRestore();

    expect(prisma.auctionBid.create).toHaveBeenCalledTimes(1);
    const bidData = prisma.auctionBid.create.mock.calls[0][0].data;
    expect(bidData.amount).toBe(84000);
    // tentative years (5) would cost 168000 total, unaffordable at budget 120000;
    // years=2 costs 117600 total, which fits -> confirms the years-reduction fallback.
    expect(bidData.years).toBe(2);
    expect(bidData.years).toBeGreaterThanOrEqual(1);
  });
});
