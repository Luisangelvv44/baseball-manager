jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { fillMissingPositions } = require('../services/cpuTeamManagement');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('fillMissingPositions', () => {
  it('releases the weakest player from a surplus position (paying the penalty) and creates a replacement at the missing position', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // Roster covers every position except 'DH'; '1B' has surplus (3 players). Same snapshot
    // is returned for both getMissingPositions and tryFillPosition's fresh re-query.
    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 3 } });
    prisma.player.groupBy.mockResolvedValue(roster);

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

  it('does nothing when no surplus position is available', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // 'DH' is missing, but every other position has exactly 1 player -> nothing has
    // surplus to cut from, so the missing position can't be fixed.
    const onePerPosition = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    prisma.player.groupBy.mockResolvedValue(onePerPosition);

    await fillMissingPositions();

    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it('skips the release when team budget cannot cover the penalty', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 3 } });
    prisma.player.groupBy.mockResolvedValue(roster);

    const weakest = { id: 99, current_skill: 20, salary: 100000, contract_years_remaining: 2 };
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.team.findUnique.mockResolvedValue({ budget: 1000 }); // penalty (60000) exceeds budget

    await fillMissingPositions();

    expect(prisma.player.update).not.toHaveBeenCalled();
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it('never queries or touches the user team roster', async () => {
    prisma.team.findMany.mockResolvedValue([]);

    await fillMissingPositions();

    expect(prisma.team.findMany).toHaveBeenCalledWith({
      where: { is_user_team: false },
      select: { id: true },
    });
    expect(prisma.player.groupBy).not.toHaveBeenCalled();
  });

  it('re-queries the roster between fixes when a team has multiple missing positions', async () => {
    const cpuTeamId = 2;
    prisma.team.findMany.mockResolvedValue([{ id: cpuTeamId }]);

    // Two positions missing: 'RF' and 'DH'. Every tryFillPosition call re-queries groupBy fresh.
    const roster = ['P', 'C', '2B', '3B', 'SS', 'LF', 'CF']
      .map((position) => ({ position, _count: { id: 1 } }));
    roster.push({ position: '1B', _count: { id: 2 } });
    prisma.player.groupBy.mockResolvedValue(roster);

    const weakest = { id: 5, current_skill: 25, salary: 50000, contract_years_remaining: 1 };
    prisma.player.findFirst.mockResolvedValue(weakest);
    prisma.team.findUnique.mockResolvedValue({ budget: 1_000_000 });
    prisma.player.create.mockResolvedValue({});

    await fillMissingPositions();

    // getMissingPositions (1) + tryFillPosition snapshot per missing position (2) = 3 groupBy calls
    expect(prisma.player.groupBy).toHaveBeenCalledTimes(3);
    expect(prisma.player.create).toHaveBeenCalledTimes(2);
  });
});
