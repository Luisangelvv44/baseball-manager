jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const {
  repFactorFromRank,
  earningsRatePerFan,
  maxBidPerFan,
  proposeYears,
  fitOfferToMoney,
  rankLimitFor,
  generateOffersForSeason,
  runBiddingRound,
  acceptUserOffer,
  finalizeContracts,
  payBroadcastRevenue,
  creditBroadcastEarnings,
} = require('../services/broadcastService');
const { GAMES_PER_SEASON, BROADCAST_OFFER_WINDOW_END_DAY } = require('../config');

const season = { id: 7, current_day: 5, status: 'active' };

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  prisma.broadcastOffer.create.mockResolvedValue({});
  prisma.broadcastOffer.update.mockResolvedValue({});
  prisma.broadcastOffer.updateMany.mockResolvedValue({});
  prisma.broadcastOffer.findMany.mockResolvedValue([]);
  prisma.broadcastContract.create.mockResolvedValue({ id: 99 });
  prisma.broadcastContract.findMany.mockResolvedValue([]);
  prisma.broadcastCompany.update.mockResolvedValue({});
  prisma.broadcastCompany.updateMany.mockResolvedValue({});
  prisma.team.update.mockResolvedValue({});
  prisma.finance.create.mockResolvedValue({});
});

describe('pure helpers', () => {
  it('repFactorFromRank goes from 1 (top) to 0 (bottom)', () => {
    expect(repFactorFromRank(1, 16)).toBe(1);
    expect(repFactorFromRank(16, 16)).toBe(0);
    expect(repFactorFromRank(1, 1)).toBe(1);
  });

  it('earnings rate is $2-$10 per fan, mixing reputation and random; radio earns half', () => {
    expect(earningsRatePerFan(0, 'TV', 0)).toBe(2);
    expect(earningsRatePerFan(1, 'TV', 1)).toBe(10);
    expect(earningsRatePerFan(1, 'TV', 0)).toBe(6);
    expect(earningsRatePerFan(1, 'RADIO', 1)).toBe(5);
  });

  it('max bid is 10% of the expected earnings', () => {
    expect(maxBidPerFan(1, 'TV')).toBeCloseTo(0.8);
    expect(maxBidPerFan(0, 'TV')).toBeCloseTo(0.4);
    expect(maxBidPerFan(1, 'RADIO')).toBeCloseTo(0.4);
  });

  it('proposed years: top team up to 10, bottom team always 1', () => {
    expect(proposeYears(1, 0.999)).toBe(10);
    expect(proposeYears(1, 0)).toBe(1);
    expect(proposeYears(0, 0.999)).toBe(1);
  });

  it('fitOfferToMoney lowers years until the total is <= 40% of the money', () => {
    // 0.5 * 100 000 * 90 = 4.5M por año
    expect(fitOfferToMoney(0.5, 100000, 3, 100_000_000)).toEqual({ years: 3, total_value: 13_500_000, annual_payment: 4_500_000 });
    expect(fitOfferToMoney(0.5, 100000, 5, 25_000_000)).toEqual({ years: 2, total_value: 9_000_000, annual_payment: 4_500_000 });
    expect(fitOfferToMoney(0.5, 100000, 5, 10_000_000)).toBeNull();
  });

  it('rank tiers: the two most expensive companies only reach the top 3', () => {
    expect(rankLimitFor(0)).toBe(3);
    expect(rankLimitFor(1)).toBe(3);
    expect(rankLimitFor(9)).toBe(16);
    expect(rankLimitFor(50)).toBe(16);
  });
});

function rankingTeams(n) {
  return Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `T${i + 1}`, fan_base: 100000, reputation: 100 - i, is_user_team: i === 0 }));
}

describe('generateOffersForSeason', () => {
  it('only the top N by reputation get offers from a tiered company, within 40% of its money', async () => {
    prisma.broadcastCompany.findMany.mockResolvedValue([
      { id: 1, type: 'TV', price_per_fan: 0.5, money: 1_000_000_000 },
    ]);
    prisma.team.findMany.mockResolvedValue(rankingTeams(16));
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await generateOffersForSeason(season);

    expect(prisma.broadcastCompany.updateMany).toHaveBeenCalledWith({ data: { season_earnings: 0 } });
    const targets = prisma.broadcastOffer.create.mock.calls.map((c) => c[0].data.team_id);
    expect(targets).toEqual([1, 2, 3]);
    const data = prisma.broadcastOffer.create.mock.calls[0][0].data;
    expect(data.price_per_fan).toBe(0.5);
    expect(data.total_value).toBe(0.5 * 100000 * GAMES_PER_SEASON * data.seasons);
    expect(data.expires_day).toBe(BROADCAST_OFFER_WINDOW_END_DAY);
  });

  it('skips teams that already have a contract of that type', async () => {
    prisma.broadcastCompany.findMany.mockResolvedValue([{ id: 1, type: 'TV', price_per_fan: 0.5, money: 1_000_000_000 }]);
    prisma.team.findMany.mockResolvedValue(rankingTeams(16));
    prisma.broadcastContract.findMany.mockResolvedValue([{ team_id: 2, company: { type: 'TV' } }]);

    await generateOffersForSeason(season);
    const targets = prisma.broadcastOffer.create.mock.calls.map((c) => c[0].data.team_id);
    expect(targets).toEqual([1, 3]);
  });
});

function offer(id, companyId, price, overrides = {}) {
  return {
    id,
    company_id: companyId,
    team_id: 1,
    seasons: 2,
    price_per_fan: price,
    total_value: Math.round(price * 100000 * GAMES_PER_SEASON * 2),
    annual_payment: Math.round(price * 100000 * GAMES_PER_SEASON),
    company: { id: companyId, name: `C${companyId}`, type: 'TV', money: 1_000_000_000 },
    team: { id: 1, fan_base: 100000, is_user_team: false },
    ...overrides,
  };
}

describe('runBiddingRound', () => {
  it('the outbid company raises above the leader, capped by its max bid', async () => {
    prisma.broadcastOffer.findMany.mockResolvedValue([offer(1, 1, 0.5), offer(2, 2, 0.3)]);
    prisma.team.findMany.mockResolvedValue(rankingTeams(16)); // team 1 = top -> tope $0.80
    jest.spyOn(Math, 'random').mockReturnValue(0); // siempre sube, +3%

    await runBiddingRound(season);

    expect(prisma.broadcastOffer.update).toHaveBeenCalledTimes(1);
    const { where, data } = prisma.broadcastOffer.update.mock.calls[0][0];
    expect(where.id).toBe(2);
    expect(data.price_per_fan).toBeCloseTo(0.515);
    expect(data.last_raised_day).toBe(season.current_day);
  });

  it('does not raise when the leader is already at the cap', async () => {
    prisma.broadcastOffer.findMany.mockResolvedValue([offer(1, 1, 0.8), offer(2, 2, 0.3)]);
    prisma.team.findMany.mockResolvedValue(rankingTeams(16));
    jest.spyOn(Math, 'random').mockReturnValue(0);

    await runBiddingRound(season);
    expect(prisma.broadcastOffer.update).not.toHaveBeenCalled();
  });
});

describe('finalizeContracts', () => {
  it('a CPU team signs the highest offer the company can still afford, then pending offers expire', async () => {
    const poor = offer(1, 1, 0.7, { company: { id: 1, name: 'Poor', type: 'TV', money: 10_000_000 } });
    const rich = offer(2, 2, 0.5);
    prisma.broadcastOffer.findMany
      .mockResolvedValueOnce([poor, rich]) // pendingOffers
      .mockResolvedValueOnce([{ id: 1 }]); // siblings to expire
    prisma.team.findMany.mockResolvedValue(rankingTeams(16).map((t) => ({ ...t, is_user_team: false })));

    await finalizeContracts(season);

    expect(prisma.broadcastContract.create).toHaveBeenCalledTimes(1);
    expect(prisma.broadcastContract.create.mock.calls[0][0].data.company_id).toBe(2);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { budget: { increment: rich.annual_payment } } });
    expect(prisma.broadcastCompany.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { money: { decrement: rich.annual_payment } } });
    expect(prisma.broadcastOffer.updateMany).toHaveBeenLastCalledWith({
      where: { season_id: season.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
  });

  it('never signs on behalf of the user team', async () => {
    prisma.broadcastOffer.findMany.mockResolvedValueOnce([offer(1, 1, 0.5, { team: { id: 1, fan_base: 100000, is_user_team: true } })]);
    prisma.team.findMany.mockResolvedValue(rankingTeams(16));

    await finalizeContracts(season);
    expect(prisma.broadcastContract.create).not.toHaveBeenCalled();
  });
});

describe('acceptUserOffer', () => {
  it('signs immediately and pays the first year', async () => {
    const o = offer(5, 3, 0.4, { team_id: 1, season_id: season.id, status: 'PENDING' });
    prisma.broadcastOffer.findUnique.mockResolvedValue(o);
    prisma.broadcastContract.findFirst.mockResolvedValue(null);

    const result = await acceptUserOffer(5, season);

    expect(result.error).toBeUndefined();
    expect(prisma.broadcastContract.create).toHaveBeenCalled();
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { budget: { increment: o.annual_payment } } });
    expect(prisma.finance.create).toHaveBeenCalled();
  });

  it('rejects when the window is closed or a contract of that type exists', async () => {
    expect((await acceptUserOffer(5, { ...season, current_day: BROADCAST_OFFER_WINDOW_END_DAY + 1 })).error).toMatch(/cerró/);

    prisma.broadcastOffer.findUnique.mockResolvedValue(offer(5, 3, 0.4, { team_id: 1, season_id: season.id, status: 'PENDING' }));
    prisma.broadcastContract.findFirst.mockResolvedValue({ id: 1 });
    expect((await acceptUserOffer(5, season)).error).toMatch(/contrato de TV/);
  });
});

describe('money flows', () => {
  it('payBroadcastRevenue pays the fixed annual payment from the company to the team', async () => {
    prisma.broadcastContract.findMany.mockResolvedValue([{
      team_id: 3, company_id: 4, annual_payment: 2_000_000, price_per_fan: 0.3, seasons_total: 4, seasons_remaining: 3,
      team: { fan_base: 999999, is_user_team: false }, company: { name: 'X', type: 'TV' },
    }]);

    await payBroadcastRevenue(season);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { budget: { increment: 2_000_000 } } });
    expect(prisma.broadcastCompany.update).toHaveBeenCalledWith({ where: { id: 4 }, data: { money: { decrement: 2_000_000 } } });
  });

  it('creditBroadcastEarnings credits fan_base x rate to the company each game', async () => {
    prisma.broadcastContract.findMany.mockResolvedValue([{
      team_id: 3, company_id: 4, team: { fan_base: 100000, reputation: 500 }, company: { type: 'TV' },
    }]);
    prisma.team.count.mockResolvedValueOnce(16).mockResolvedValueOnce(0); // total, equipos por encima -> puesto 1
    jest.spyOn(Math, 'random').mockReturnValue(1);

    await creditBroadcastEarnings([3, 8]);
    expect(prisma.broadcastCompany.update).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { money: { increment: 1_000_000 }, season_earnings: { increment: 1_000_000 } },
    });
  });
});
