jest.mock('../db/prisma');
jest.mock('../services/playoffService', () => ({ getQualifiedTeamIds: jest.fn() }));
jest.mock('../services/newsService', () => ({ createNews: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const { getQualifiedTeamIds } = require('../services/playoffService');
const {
  openPlayoffMarket,
  placePlayoffLoanBid,
  closePlayoffMarket,
  runPlayoffMarketDay,
  returnPlayoffLoans,
} = require('../services/playoffMarketService');

const season = { id: 7, current_day: 105, total_days: 105, status: 'playoffs' };
const market = { id: 3, season_id: 7, status: 'open', opened_day: 105, closes_on_day: 110, qualified_team_ids: [1, 2, 3] };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('openPlayoffMarket', () => {
  it('returns null and creates nothing when there are no eliminated players', async () => {
    prisma.playoffMarket.findUnique.mockResolvedValue(null);
    getQualifiedTeamIds.mockResolvedValue([1, 2]);
    prisma.player.findMany.mockResolvedValue([]);

    const result = await openPlayoffMarket(season);
    expect(result).toBeNull();
    expect(prisma.playoffMarket.create).not.toHaveBeenCalled();
  });

  it('lists every MAJOR player of non-qualified teams and closes after PLAYOFF_MARKET_DAYS', async () => {
    prisma.playoffMarket.findUnique.mockResolvedValue(null);
    getQualifiedTeamIds.mockResolvedValue([1, 2]);
    prisma.player.findMany
      .mockResolvedValueOnce([{ id: 50, team_id: 9 }, { id: 51, team_id: 10 }]) // listables
      .mockResolvedValue([]); // rosters CPU en la ronda inicial
    prisma.playoffMarket.create.mockImplementation(({ data }) => Promise.resolve({ id: 3, ...data }));
    prisma.playoffLoan.findMany.mockResolvedValue([]);
    prisma.playoffLoanBid.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([]);

    const result = await openPlayoffMarket(season);

    expect(prisma.player.findMany.mock.calls[0][0].where).toMatchObject({
      team_id: { notIn: [1, 2], not: null }, status: 'active', level: 'MAJOR',
    });
    expect(prisma.playoffMarket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ season_id: 7, opened_day: 105, closes_on_day: 110, qualified_team_ids: [1, 2] }),
    });
    expect(prisma.playoffLoan.createMany).toHaveBeenCalledWith({
      data: [
        { market_id: 3, player_id: 50, from_team_id: 9 },
        { market_id: 3, player_id: 51, from_team_id: 10 },
      ],
    });
    expect(result.id).toBe(3);
  });

  it('does not reopen a market that already closed this season', async () => {
    prisma.playoffMarket.findUnique.mockResolvedValue({ ...market, status: 'closed' });
    expect(await openPlayoffMarket(season)).toBeNull();
    expect(getQualifiedTeamIds).not.toHaveBeenCalled();
  });
});

describe('placePlayoffLoanBid', () => {
  const loan = {
    id: 20, market_id: 3, status: 'open', from_team_id: 9,
    player: { id: 50, position: 'SS', current_skill: 80, salary: 1_000_000, team_id: 9 },
  };

  function setup({ bids = [], weakest = { current_skill: 60 }, budget = 10_000_000 } = {}) {
    prisma.playoffLoan.findUnique.mockResolvedValue(loan);
    prisma.playoffLoanBid.findMany.mockResolvedValue(bids);
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.playoffLoan.count.mockResolvedValue(0);
    prisma.team.findUnique.mockResolvedValue({ budget });
    prisma.playoffLoanBid.create.mockImplementation(({ data }) => Promise.resolve({ id: 99, ...data }));
  }

  const bid = (pct, extra = {}) => placePlayoffLoanBid({ market, loanId: 20, teamId: 1, pct, seasonDay: 106, ...extra });

  it('records a valid opening bid as % of salary', async () => {
    setup();
    const created = await bid(0.75);
    expect(created).toMatchObject({ loan_id: 20, team_id: 1, pct: 0.75, amount: 750_000 });
  });

  it('rejects teams that did not qualify', async () => {
    setup();
    await expect(bid(0.75, { teamId: 9 })).rejects.toThrow('clasificados');
  });

  it('rejects bids outside 50%-150%', async () => {
    setup();
    await expect(bid(0.4)).rejects.toThrow('entre 50% y 150%');
    await expect(bid(1.6)).rejects.toThrow('entre 50% y 150%');
  });

  it('requires beating the top bid by the minimum raise', async () => {
    setup({ bids: [{ id: 1, loan_id: 20, team_id: 2, pct: 1.0, amount: 1_000_000 }] });
    await expect(bid(1.02)).rejects.toThrow('105%');
    await expect(bid(1.05)).resolves.toMatchObject({ amount: 1_050_000 });
  });

  it('rejects players not better than the team\'s weakest at that position', async () => {
    setup({ weakest: { current_skill: 85 } });
    await expect(bid(0.75)).rejects.toThrow('mejores que los que ya tienes');
  });

  it('counts bids the team is already winning against its budget', async () => {
    setup({
      bids: [{ id: 1, loan_id: 21, team_id: 1, pct: 1.5, amount: 1_500_000 }],
      budget: 2_000_000,
    });
    await expect(bid(0.75)).rejects.toThrow('Presupuesto insuficiente');
  });
});

describe('closePlayoffMarket', () => {
  const player = { id: 50, first_name: 'Ana', last_name: 'Ruiz', team_id: 9, status: 'active', jersey_number: 7, jersey_team_id: 9 };

  it('gives the player to the highest affordable bid, charges it and marks the loan', async () => {
    prisma.playoffLoan.findMany.mockResolvedValue([{
      id: 20, from_team_id: 9, player, from_team: { name: 'Eliminados' },
      bids: [
        { id: 1, team_id: 2, pct: 1.4, amount: 1_400_000, team: { id: 2, name: 'Rico' } },
        { id: 2, team_id: 1, pct: 1.2, amount: 1_200_000, team: { id: 1, name: 'Usuario' } },
      ],
    }]);
    // El equipo 2 no puede pagar al cierre -> gana la siguiente mejor puja (usuario)
    prisma.team.findUnique.mockImplementation(({ where }) =>
      Promise.resolve({ budget: where.id === 2 ? 100 : 5_000_000 }));

    const result = await closePlayoffMarket(season, market);

    expect(result.signed).toBe(1);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { budget: { decrement: 1_200_000 } } });
    expect(prisma.finance.create).toHaveBeenCalledWith({ data: expect.objectContaining({ team_id: 1, type: 'playoff_loan', amount: -1_200_000 }) });
    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 50 }, data: { team_id: 1, on_loan_from_team_id: 9 } });
    expect(prisma.playoffLoan.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ status: 'signed', to_team_id: 1, original_jersey_number: 7, original_jersey_team_id: 9 }),
    });
    expect(prisma.playoffMarket.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: 'closed' } });
  });

  it('marks loans without bids as unsold', async () => {
    prisma.playoffLoan.findMany.mockResolvedValue([{ id: 20, from_team_id: 9, player, from_team: { name: 'X' }, bids: [] }]);
    const result = await closePlayoffMarket(season, market);
    expect(result.signed).toBe(0);
    expect(prisma.playoffLoan.update).toHaveBeenCalledWith({ where: { id: 20 }, data: { status: 'unsold' } });
    expect(prisma.player.update).not.toHaveBeenCalled();
  });
});

describe('runPlayoffMarketDay', () => {
  it('closes on the last day without a CPU round', async () => {
    prisma.playoffLoan.findMany.mockResolvedValue([]);
    const result = await runPlayoffMarketDay({ ...season, current_day: 109 }, market);
    expect(result).toEqual({ closed: true, signed: 0, daysLeft: 0 });
    expect(prisma.playoffLoanBid.create).not.toHaveBeenCalled();
    expect(prisma.playoffMarket.update).toHaveBeenCalledWith({ where: { id: 3 }, data: { status: 'closed' } });
  });

  it('lets a CPU team bid for a clear upgrade while the market is open', async () => {
    prisma.playoffLoan.findMany
      .mockResolvedValueOnce([{ id: 20, from_team_id: 9, player: { position: 'SS', current_skill: 90, salary: 1_000_000, injury_days_remaining: 0 } }])
      .mockResolvedValueOnce([]); // signed loans
    prisma.playoffLoanBid.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([{ id: 2, budget: 50_000_000, desperation_index: 0 }]);
    prisma.player.findMany.mockResolvedValue([{ team_id: 2, position: 'SS', current_skill: 60 }]);
    prisma.playoffLoanBid.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));

    const result = await runPlayoffMarketDay({ ...season, current_day: 105 }, { ...market, qualified_team_ids: [2] }, { rng: () => 0 });

    expect(result).toEqual({ closed: false, signed: 0, daysLeft: 4 });
    expect(prisma.playoffLoanBid.create).toHaveBeenCalledWith({
      data: { loan_id: 20, team_id: 2, pct: 0.5, amount: 500_000, season_day: 106 },
    });
  });
});

describe('returnPlayoffLoans', () => {
  it('sends loaned players back with their original jersey and clears the hiring lineup', async () => {
    prisma.playoffLoan.findMany.mockResolvedValue([{
      id: 20, player_id: 50, from_team_id: 9, to_team_id: 1, original_jersey_number: 7, original_jersey_team_id: 9,
    }]);

    const count = await returnPlayoffLoans(season);

    expect(count).toBe(1);
    expect(prisma.teamLineup.deleteMany).toHaveBeenCalledWith({ where: { team_id: 1, player_id: 50 } });
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 50 },
      data: { team_id: 9, on_loan_from_team_id: null, level: 'MAJOR', jersey_number: 7, jersey_team_id: 9 },
    });
    expect(prisma.playoffLoan.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ status: 'returned' }),
    });
  });
});
