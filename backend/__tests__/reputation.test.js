jest.mock('../db/prisma');
jest.mock('../services/gamePlay', () => ({ playGame: jest.fn(), applyRandomFanChange: jest.fn() }));

const prisma = require('../db/prisma');
const { generatePlayoffBracket } = require('../services/playoffService');
const { clampReputation } = require('../services/reputationService');
const { REPUTATION_MIN, REPUTATION_MAX, REPUTATION_MISSED_PLAYOFFS_PENALTY } = require('../config');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('clampReputation', () => {
  it('keeps values inside [REPUTATION_MIN, REPUTATION_MAX]', () => {
    expect(clampReputation(500)).toBe(500);
    expect(clampReputation(-40)).toBe(REPUTATION_MIN);
    expect(clampReputation(REPUTATION_MAX + 50)).toBe(REPUTATION_MAX);
  });

  it('no longer caps at 100', () => {
    expect(clampReputation(150)).toBe(150);
  });
});

describe('generatePlayoffBracket - reputation', () => {
  // Division 1: equipos 1-5, division 2: equipos 6-10 (ya ordenados por wins desc). Quedan fuera el 5 y el 10.
  function team(id, division_id, reputation) {
    return { id, division_id, wins: 20 - id, losses: id, desperation_index: 0, fan_base: 50000, reputation };
  }

  beforeEach(() => {
    prisma.playoffSeries.findFirst.mockResolvedValue(null);
    prisma.playoffSeries.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, home_wins: 0, away_wins: 0, ...data }));
    prisma.gameSchedule.create.mockResolvedValue({});
    prisma.team.update.mockResolvedValue({});
    prisma.team.findMany.mockResolvedValue([
      team(1, 1, 9998), team(2, 1, 50), team(3, 1, 50), team(4, 1, 50), team(5, 1, 60),
      team(6, 2, 50), team(7, 2, 50), team(8, 2, 50), team(9, 2, 50), team(10, 2, 10),
    ]);
  });

  function repUpdateFor(id) {
    return prisma.team.update.mock.calls.find((c) => c[0].where.id === id && 'reputation' in c[0].data)[0].data.reputation;
  }

  it('gives +5 to qualified teams and takes REPUTATION_MISSED_PLAYOFFS_PENALTY from the rest', async () => {
    await generatePlayoffBracket(1);
    expect(repUpdateFor(2)).toBe(55);
    expect(repUpdateFor(9)).toBe(55);
    expect(repUpdateFor(5)).toBe(60 - REPUTATION_MISSED_PLAYOFFS_PENALTY);
  });

  it('clamps at the floor and at the 10 000 cap', async () => {
    await generatePlayoffBracket(1);
    expect(repUpdateFor(10)).toBe(REPUTATION_MIN);
    expect(repUpdateFor(1)).toBe(REPUTATION_MAX);
  });
});
