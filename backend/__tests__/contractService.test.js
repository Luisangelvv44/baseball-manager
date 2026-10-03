jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const {
  achievementBonusFor,
  signContract,
  replaceActiveContract,
  transferContract,
  payAchievementBonus,
  buildStints,
  planPlayerContracts,
  backfillContracts,
} = require('../services/contractService');
const { getPlayerCareerHistory } = require('../services/statsService');
const { USER_TEAM_ID } = require('../config');

const CPU_TEAM_ID = 2;

beforeEach(() => {
  jest.resetAllMocks();
});

describe('achievementBonusFor', () => {
  it('is 0 for a player with no demands', () => {
    expect(achievementBonusFor({ demand_factor: 0 }, 1_000_000, USER_TEAM_ID)).toBe(0);
  });

  it('scales up to 3% of the annual salary for the user team', () => {
    expect(achievementBonusFor({ demand_factor: 3 }, 1_000_000, USER_TEAM_ID)).toBe(30_000);
    expect(achievementBonusFor({ demand_factor: 1.5 }, 1_000_000, USER_TEAM_ID)).toBe(15_000);
  });

  it('caps CPU teams at 1% of the annual salary', () => {
    expect(achievementBonusFor({ demand_factor: 3 }, 1_000_000, CPU_TEAM_ID)).toBe(10_000);
    expect(achievementBonusFor({ demand_factor: 0.5 }, 1_000_000, CPU_TEAM_ID)).toBe(5_000);
  });
});

describe('signContract', () => {
  it('stores total value and the demand-based bonus, starting in the in-progress season', async () => {
    prisma.season.findFirst.mockResolvedValue({ id: 7 });
    prisma.contract.create.mockImplementation(({ data }) => Promise.resolve(data));

    const c = await signContract(prisma, { id: 10, demand_factor: 3 }, {
      teamId: USER_TEAM_ID, annualSalary: 200_000, years: 3, isRookie: false,
    });

    expect(c).toMatchObject({
      player_id: 10, team_id: USER_TEAM_ID, start_season_id: 7,
      annual_salary: 200_000, total_years: 3, years_remaining: 3, total_value: 600_000,
      achievement_bonus: 6_000,
    });
  });

  it('leaves start_season_id null when signed in the offseason', async () => {
    prisma.season.findFirst.mockResolvedValue(null);
    prisma.contract.create.mockImplementation(({ data }) => Promise.resolve(data));
    const c = await signContract(prisma, { id: 10, demand_factor: 0 }, { teamId: CPU_TEAM_ID, annualSalary: 50_000, years: 2 });
    expect(c.start_season_id).toBeNull();
  });
});

describe('replaceActiveContract', () => {
  it('closes the active contract as replaced and signs the new one', async () => {
    prisma.season.findFirst.mockResolvedValue({ id: 4 });
    prisma.contract.create.mockImplementation(({ data }) => Promise.resolve(data));

    await replaceActiveContract(prisma, { id: 3, demand_factor: 2 }, { teamId: USER_TEAM_ID, annualSalary: 100_000, years: 2 });

    expect(prisma.contract.updateMany).toHaveBeenCalledWith({
      where: { player_id: 3, status: 'active' },
      data: expect.objectContaining({ status: 'replaced', end_season_id: 4 }),
    });
    expect(prisma.contract.create.mock.calls[0][0].data).toMatchObject({ start_season_id: 4, achievement_bonus: 2_000 });
  });
});

describe('transferContract', () => {
  it('moves the remaining terms and the bonus to the new team', async () => {
    prisma.contract.findFirst.mockResolvedValue({ id: 1, achievement_bonus: 1234 });
    prisma.player.findUnique.mockResolvedValue({
      id: 5, salary: 80_000, contract_years_remaining: 2, rookie_contract: false, demand_factor: 3,
    });
    prisma.contract.create.mockImplementation(({ data }) => Promise.resolve(data));

    const c = await transferContract(prisma, 5, CPU_TEAM_ID, 9);

    expect(prisma.contract.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'traded', end_season_id: 9 });
    expect(c).toMatchObject({ team_id: CPU_TEAM_ID, start_season_id: 9, years_remaining: 2, achievement_bonus: 1234 });
  });
});

describe('payAchievementBonus', () => {
  const contract = (overrides = {}) => ({
    id: 1, team_id: USER_TEAM_ID, annual_salary: 1_000_000, achievement_bonus: 30_000,
    bonus_paid_season: 0, player: { first_name: 'Ana', last_name: 'Diaz' }, ...overrides,
  });

  it('charges the team, logs a finance row and updates the accumulators', async () => {
    prisma.contract.findFirst.mockResolvedValue(contract());

    const paid = await payAchievementBonus(prisma, { playerId: 1, type: 'cycle', seasonDay: 20 });

    expect(paid).toBe(30_000);
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: USER_TEAM_ID }, data: { budget: { decrement: 30_000 } } });
    expect(prisma.finance.create.mock.calls[0][0].data).toMatchObject({ type: 'achievement_bonus', amount: -30_000, season_day: 20 });
    expect(prisma.contract.update.mock.calls[0][0].data).toEqual({
      bonus_paid_season: { increment: 30_000 }, bonus_paid_total: { increment: 30_000 },
    });
  });

  it('only pays what is left under the per-season cap (15% of annual)', async () => {
    prisma.contract.findFirst.mockResolvedValue(contract({ bonus_paid_season: 140_000 }));
    expect(await payAchievementBonus(prisma, { playerId: 1, type: 'multi_hr' })).toBe(10_000);
  });

  it('pays nothing once the cap is reached or without an active bonus contract', async () => {
    prisma.contract.findFirst.mockResolvedValueOnce(contract({ bonus_paid_season: 150_000 }));
    expect(await payAchievementBonus(prisma, { playerId: 1, type: 'award' })).toBe(0);
    prisma.contract.findFirst.mockResolvedValueOnce(null);
    expect(await payAchievementBonus(prisma, { playerId: 1, type: 'award' })).toBe(0);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe('backfill planning', () => {
  const seasons = [1, 2, 3, 4].map((id) => ({ id, status: 'completed' }));

  it('merges same-team seasons across gaps and splits on team change', () => {
    const stints = buildStints([
      { season_id: 1, team_id: 5, first_day: 16 },
      { season_id: 3, team_id: 5, first_day: 16 },
      { season_id: 3, team_id: 6, first_day: 30 },
    ]);
    expect(stints).toEqual([
      { team_id: 5, start_season_id: 1, end_season_id: 3 },
      { team_id: 6, start_season_id: 3, end_season_id: 3 },
    ]);
  });

  it('turns the last stint into the active contract when it is with the current team', () => {
    const latest = { id: 4, status: 'active' };
    const rows = planPlayerContracts(
      { id: 1, status: 'active', team_id: 6, salary: 100_000, contract_years_remaining: 2, rookie_contract: false },
      [{ season_id: 1, team_id: 5, first_day: 16 }, { season_id: 2, team_id: 6, first_day: 16 }],
      [...seasons.slice(0, 3), latest],
      latest,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ team_id: 5, status: 'expired', total_years: 1, is_reconstructed: true });
    // seasons 2..4 elapsed (3; the in-progress 4th is already counted in remaining) + 2 remaining - 1
    expect(rows[1]).toMatchObject({
      team_id: 6, status: 'active', start_season_id: 2, end_season_id: null,
      years_remaining: 2, total_years: 4, achievement_bonus: 0,
    });
  });

  it('creates a fresh active contract when the player has no history with the current team', () => {
    const latest = { id: 4, status: 'active' };
    const rows = planPlayerContracts(
      { id: 1, status: 'active', team_id: 6, salary: 50_000, contract_years_remaining: 3, rookie_contract: true },
      [],
      [...seasons.slice(0, 3), latest],
      latest,
    );
    expect(rows).toEqual([expect.objectContaining({
      status: 'active', start_season_id: 4, total_years: 3, is_rookie: true, total_value: 150_000, is_reconstructed: false,
    })]);
  });

  it('only reconstructs history for players that are no longer active', () => {
    const rows = planPlayerContracts(
      { id: 1, status: 'retired', team_id: null, salary: 50_000, contract_years_remaining: 0, rookie_contract: false },
      [{ season_id: 2, team_id: 5, first_day: 16 }],
      seasons,
      seasons[3],
    );
    expect(rows).toEqual([expect.objectContaining({ status: 'expired', start_season_id: 2, end_season_id: 2 })]);
  });

  it('backfillContracts only targets players without any contract', async () => {
    prisma.season.findMany.mockResolvedValue(seasons);
    prisma.player.findMany.mockResolvedValue([
      { id: 1, status: 'active', team_id: 5, salary: 10_000, contract_years_remaining: 1, rookie_contract: false },
    ]);
    prisma.playerSeasonRecord.findMany.mockResolvedValue([]);

    const result = await backfillContracts(prisma);

    expect(prisma.player.findMany.mock.calls[0][0].where).toEqual({ contracts: { none: {} } });
    expect(prisma.contract.createMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ activeCreated: 1, historicalCreated: 0 });
  });
});

describe('getPlayerCareerHistory with contracts', () => {
  it('shows a contracted season without games as a zero row', async () => {
    prisma.player.findUnique.mockResolvedValue({ id: 1, first_name: 'Ana', last_name: 'Diaz', position: 'SS' });
    prisma.gameEvent.findMany.mockResolvedValue([]);
    prisma.gameLineup.findMany.mockResolvedValue([]);
    prisma.playerSeasonRecord.findMany.mockResolvedValue([
      { season_id: 1, year: 2026, team_id: 5, first_day: 16, games: 10, at_bats: 30, hits: 9, home_runs: 1,
        walks: 2, strikeouts: 5, rbi: 4, pitching_games: 0 },
    ]);
    prisma.contract.findMany.mockResolvedValue([
      { id: 1, team_id: 5, start_season_id: 1, end_season_id: null, annual_salary: 1000, total_value: 3000,
        achievement_bonus: 0, bonus_paid_total: 0, total_years: 3, years_remaining: 1, status: 'active' },
    ]);
    prisma.season.findMany.mockResolvedValue([{ id: 1, year: 2026 }, { id: 2, year: 2026 }]);
    prisma.team.findMany.mockResolvedValue([{ id: 5, name: 'Tigres' }]);

    const { seasons, contracts } = await getPlayerCareerHistory(1);

    expect(seasons).toHaveLength(2);
    expect(seasons[0]).toMatchObject({ season_id: 2, team_name: 'Tigres', contract_only: true });
    expect(seasons[0].batting).toMatchObject({ g: 0, ab: 0, hr: 0 });
    expect(seasons[1]).toMatchObject({ season_id: 1, contract_only: false });
    expect(contracts[0]).toMatchObject({ team_name: 'Tigres', total_value: 3000 });
  });
});
