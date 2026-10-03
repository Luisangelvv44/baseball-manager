jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const { trackFanBase, seasonAverageFanBase, resetFanBaseRange } = require('../services/fanBaseTracker');
const { giveCpuTeamsRevenue } = require('../services/cpuTeamManagement');

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('trackFanBase', () => {
  it('extends the max when fan_base rises above the range', async () => {
    await trackFanBase({ id: 2, fan_base: 70000, min_fan_base_season: 40000, max_fan_base_season: 60000 });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { min_fan_base_season: 40000, max_fan_base_season: 70000 },
    });
  });

  it('extends the min when fan_base drops below the range', async () => {
    await trackFanBase({ id: 2, fan_base: 30000, min_fan_base_season: 40000, max_fan_base_season: 60000 });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { min_fan_base_season: 30000, max_fan_base_season: 60000 },
    });
  });

  it('does nothing when fan_base stays within the range', async () => {
    await trackFanBase({ id: 2, fan_base: 50000, min_fan_base_season: 40000, max_fan_base_season: 60000 });
    expect(prisma.team.update).not.toHaveBeenCalled();
  });

  it('initializes a null range from the current fan_base', async () => {
    await trackFanBase({ id: 2, fan_base: 50000, min_fan_base_season: null, max_fan_base_season: null });
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { min_fan_base_season: 50000, max_fan_base_season: 50000 },
    });
  });

  it('ignores records without fan_base', async () => {
    await trackFanBase({});
    await trackFanBase(undefined);
    expect(prisma.team.update).not.toHaveBeenCalled();
  });
});

describe('seasonAverageFanBase', () => {
  it('averages min and max', () => {
    expect(seasonAverageFanBase({ fan_base: 80000, min_fan_base_season: 40000, max_fan_base_season: 60001 })).toBe(50001);
  });

  it('falls back to fan_base when the range is null', () => {
    expect(seasonAverageFanBase({ fan_base: 80000, min_fan_base_season: null, max_fan_base_season: null })).toBe(80000);
  });
});

describe('resetFanBaseRange', () => {
  it('sets min and max to the current fan_base for every team', async () => {
    prisma.team.findMany.mockResolvedValue([{ id: 1, fan_base: 100000 }, { id: 2, fan_base: 45000 }]);
    await resetFanBaseRange();
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { min_fan_base_season: 100000, max_fan_base_season: 100000 } });
    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { min_fan_base_season: 45000, max_fan_base_season: 45000 } });
  });
});

describe('giveCpuTeamsRevenue', () => {
  it('pays based on the season (min + max) / 2 average, not the closing fan_base', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // revenuePerFan = CPU_REVENUE_PER_FAN_MIN
    const { CPU_REVENUE_PER_FAN_MIN } = require('../config');
    prisma.team.findMany.mockResolvedValue([
      { id: 2, fan_base: 80000, min_fan_base_season: 40000, max_fan_base_season: 60000 },
    ]);
    await giveCpuTeamsRevenue();
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { budget: { increment: 50000 * CPU_REVENUE_PER_FAN_MIN } },
    });
  });
});
