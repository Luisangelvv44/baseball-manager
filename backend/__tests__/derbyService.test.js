jest.mock('../db/prisma');

const prisma = require('../db/prisma');
const derbyService = require('../services/derbyService');
const { swingHrProbability, computeCpuReward, simulateDerbyEvent } = derbyService;
const { USER_TEAM_ID, DERBY_MIN_HR_PROB, DERBY_MAX_HR_PROB, DERBY_CPU_REWARD_MIN_PCT, DERBY_CPU_REWARD_MAX_PCT } = require('../config');
const { mockSeason } = require('./mockData');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('swingHrProbability', () => {
  it('clamps to the configured minimum for very low skill', () => {
    expect(swingHrProbability(0)).toBe(DERBY_MIN_HR_PROB);
  });

  it('clamps to the configured maximum for very high skill', () => {
    expect(swingHrProbability(200)).toBe(DERBY_MAX_HR_PROB);
  });

  it('increases with skill in the unclamped range', () => {
    expect(swingHrProbability(70)).toBeGreaterThan(swingHrProbability(50));
  });
});

describe('computeCpuReward', () => {
  it('falls within 50-100% of budget * bid_aggressiveness', () => {
    const team = { budget: 1_000_000, bid_aggressiveness: 0.2 };
    const maxWilling = 1_000_000 * 0.2;
    const reward = computeCpuReward(team);
    expect(reward).toBeGreaterThanOrEqual(Math.round(maxWilling * DERBY_CPU_REWARD_MIN_PCT));
    expect(reward).toBeLessThanOrEqual(Math.round(maxWilling * DERBY_CPU_REWARD_MAX_PCT));
  });
});

describe('simulateDerbyEvent', () => {
  function buildEvent({ userReward = 100000, cpuReward = 80000 } = {}) {
    return {
      id: 1,
      season_id: 1,
      day: 5,
      status: 'pending',
      entries: [
        {
          id: 1,
          team_id: USER_TEAM_ID,
          reward_amount: userReward,
          team: { id: USER_TEAM_ID, name: 'User Team' },
          player: { id: 10, first_name: 'John', last_name: 'Doe', current_skill: 70 },
        },
        {
          id: 2,
          team_id: 2,
          reward_amount: cpuReward,
          team: { id: 2, name: 'CPU Team' },
          player: { id: 20, first_name: 'Jane', last_name: 'Roe', current_skill: 65 },
        },
      ],
    };
  }

  it('resolves a tie via swing-off rounds and pays only the winning team', async () => {
    const event = buildEvent();
    prisma.homeRunDerbyEvent.findUnique.mockResolvedValue(event);
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.derbySwing.createMany.mockResolvedValue({});
    prisma.derbyEntry.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.finance.create.mockResolvedValue({});
    prisma.newsItem.create.mockResolvedValue({});

    // 10 swings for entry 1 (all HR), 10 swings for entry 2 (all HR) -> tie 10-10.
    // Tie-break round: entry 1 hits (HR), entry 2 misses -> entry 1 wins.
    const randomSpy = jest.spyOn(Math, 'random');
    const sequence = [...Array(20).fill(0), 0, 0.99];
    sequence.forEach((v) => randomSpy.mockReturnValueOnce(v));

    const result = await simulateDerbyEvent(1);
    randomSpy.mockRestore();

    expect(prisma.team.update).toHaveBeenCalledTimes(1);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: USER_TEAM_ID },
      data: { budget: { decrement: 100000 } },
    });

    expect(prisma.finance.create).toHaveBeenCalledTimes(1);
    expect(prisma.finance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ team_id: USER_TEAM_ID, type: 'derby_reward', amount: -100000 }),
    });

    expect(prisma.homeRunDerbyEvent.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: 'completed', winner_entry_id: 1 },
    });

    expect(result).toBeDefined();
  });

  it('pays the CPU winner and does not log a Finance row', async () => {
    const event = buildEvent();
    prisma.homeRunDerbyEvent.findUnique.mockResolvedValue(event);
    prisma.season.findFirst.mockResolvedValue(mockSeason);
    prisma.derbySwing.createMany.mockResolvedValue({});
    prisma.derbyEntry.update.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.finance.create.mockResolvedValue({});
    prisma.newsItem.create.mockResolvedValue({});

    // Entry 1 (user) misses all 10 swings, entry 2 (CPU) hits all 10 -> CPU wins outright, no tie.
    const randomSpy = jest.spyOn(Math, 'random');
    const sequence = [...Array(10).fill(0.99), ...Array(10).fill(0)];
    sequence.forEach((v) => randomSpy.mockReturnValueOnce(v));

    await simulateDerbyEvent(1);
    randomSpy.mockRestore();

    expect(prisma.team.update).toHaveBeenCalledTimes(1);
    expect(prisma.team.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { budget: { decrement: 80000 } },
    });
    expect(prisma.finance.create).not.toHaveBeenCalled();
  });

  it('rejects simulating an event that is not pending', async () => {
    prisma.homeRunDerbyEvent.findUnique.mockResolvedValue({ ...buildEvent(), status: 'completed' });
    await expect(simulateDerbyEvent(1)).rejects.toThrow('ya fue simulado');
  });
});
