jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { fillMissingPositions } = require('../services/cpuTeamManagement');
const { MAX_ROSTER_SIZE } = require('../config');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fillMissingPositions', () => {
  it('adds a replacement without cutting anyone when the roster is under the cap', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // Only 8 players, every one at a distinct position: 'DH' and '1B' are missing.
    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(8);
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    // No cut path touched at all
    expect(prisma.player.findFirst).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.team.update).not.toHaveBeenCalled();

    // One replacement per missing position ('1B' and 'DH')
    expect(prisma.player.create).toHaveBeenCalledTimes(2);
    const positions = prisma.player.create.mock.calls.map((c) => c[0].data.position).sort();
    expect(positions).toEqual(['1B', 'DH']);
    const created = prisma.player.create.mock.calls[0][0].data;
    expect(created.team_id).toBe(cpuTeamId);
    expect(created.level).toBe('MAJOR');
    expect(created.status).toBe('active');
    expect(created.rookie_contract).toBe(false);
    expect(created.age).toBeGreaterThanOrEqual(22);
    expect(created.age).toBeLessThanOrEqual(26);
    expect(created.current_skill).toBeGreaterThanOrEqual(30);
    expect(created.current_skill).toBeLessThanOrEqual(70);
  });

  it('never runs the cut path even when a surplus exists, as long as there is roster room', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 3 } });
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE - 1);
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    expect(prisma.player.findFirst).not.toHaveBeenCalled();
    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.create.mock.calls[0][0].data.position).toBe('DH');
  });

  it('releases the weakest player from a surplus position (paying the penalty) and creates a replacement when the roster is full', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // Roster full (MAX_ROSTER_SIZE) and covers every position except 'DH'; '1B' has surplus.
    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 3 } });
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE);

    const weakest = { id: 99, current_skill: 20, salary: 100000, contract_years_remaining: 2 };
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.team.findUnique.mockResolvedValue({ budget: 1_000_000 });
    prisma.teamLineup.deleteMany.mockResolvedValue({});
    prisma.player.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    // Release: penalty = 100000 * 0.30 * 2 = 60000
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { team_id: null, status: 'free_agent' },
    });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: cpuTeamId },
      data: { budget: { decrement: 60000 } },
    });

    // Only 'DH' was missing, so only one replacement is created
    expect(prisma.player.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.create.mock.calls[0][0].data.position).toBe('DH');
    const created = prisma.player.create.mock.calls[0][0].data;
    expect(created.team_id).toBe(cpuTeamId);
    expect(created.level).toBe('MAJOR');
    expect(created.status).toBe('active');
    expect(created.rookie_contract).toBe(false);
    expect(created.age).toBeGreaterThanOrEqual(22);
    expect(created.age).toBeLessThanOrEqual(26);
    expect(created.current_skill).toBeGreaterThanOrEqual(30);
    expect(created.current_skill).toBeLessThanOrEqual(70);
  });

  it('does nothing when the roster is full and no surplus position is available', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // 'DH' is missing, but every other position has exactly 1 player -> nothing has
    // surplus to cut from, so the missing position can't be fixed.
    const onePerPosition = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    prisma.player.groupBy.mockResolvedValue(onePerPosition);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE);

    await fillMissingPositions();

    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it('on a full roster with insufficient budget, still cuts the weakest surplus player, charges only what the budget allows, and creates the replacement', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 3 } });
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE);

    const weakest = { id: 99, current_skill: 20, salary: 100000, contract_years_remaining: 2 };
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.team.findUnique.mockResolvedValue({ budget: 1000 }); // full penalty would be 60000
    prisma.teamLineup.deleteMany.mockResolvedValue({});
    prisma.player.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    // Player is still released...
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { team_id: null, status: 'free_agent' },
    });
    // ...but only the affordable slice of the penalty is charged (budget floors at 0, never negative)
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: cpuTeamId },
      data: { budget: { decrement: 1000 } },
    });

    // The missing position gets filled regardless
    expect(prisma.player.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.create.mock.calls[0][0].data.position).toBe('DH');
  });

  it('on a full roster where the surplus position only has a first-year rookie, cuts that rookie as a last resort', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 2 } });
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE);

    const rookie = { id: 77, current_skill: 15, salary: 20000, contract_years_remaining: 3 };
    // First pass (non-rookie filter) finds nobody; last-resort pass (includeRookies) finds the rookie
    prisma.player.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(rookie);
    prisma.team.findUnique.mockResolvedValue({ budget: 1_000_000 });
    prisma.teamLineup.deleteMany.mockResolvedValue({});
    prisma.player.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    expect(prisma.player.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.player.update).toHaveBeenCalledWith({
      where: { id: 77 },
      data: { team_id: null, status: 'free_agent' },
    });
    // penalty = 20000 * 0.30 * 3 = 18000, fully covered by budget
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: cpuTeamId },
      data: { budget: { decrement: 18000 } },
    });
    expect(prisma.player.create).toHaveBeenCalledTimes(1);
    expect(prisma.player.create.mock.calls[0][0].data.position).toBe('DH');
  });

  it('never queries or touches the user team roster', async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await fillMissingPositions();

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { is_user_team: false },
      select: { id: true },
    });
    expect(prisma.player.groupBy).not.toHaveBeenCalled();
    expect(prisma.player.count).not.toHaveBeenCalled();
  });

  it('re-counts the roster between fixes when a full-roster team has multiple missing positions', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // Two positions missing: 'RF' and 'DH'. Roster is full, so each fix goes through the
    // cut path and re-queries groupBy fresh.
    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 2 } });
    prisma.player.groupBy.mockResolvedValue(roster);
    prisma.player.count.mockResolvedValue(MAX_ROSTER_SIZE);

    const weakest = { id: 5, current_skill: 25, salary: 50000, contract_years_remaining: 1 };
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.team.findUnique.mockResolvedValue({ budget: 1_000_000 });
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    // getMissingPositions (1) + tryFillPosition snapshot per missing position (2) = 3 groupBy calls
    expect(prisma.player.groupBy).toHaveBeenCalledTimes(3);
    // one count per tryFillPosition call
    expect(prisma.player.count).toHaveBeenCalledTimes(2);
    expect(prisma.player.create).toHaveBeenCalledTimes(2);
  });
});
