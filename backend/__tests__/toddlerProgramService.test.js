jest.mock('../db/prisma');
jest.mock('../services/playerAppearanceService', () => ({ syncMissingAppearances: jest.fn().mockResolvedValue(0) }));
jest.mock('../services/contractService', () => ({ signContractFromPlayer: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const { generateToddlerCycle, advanceOnePick } = require('../services/toddlerProgramService');
const { TODDLER_PROGRAM_SIZE, TODDLER_PROGRAM_START_AGE, HEIR_MAX_PER_CYCLE } = require('../config');

beforeEach(() => {
  jest.clearAllMocks();
  prisma.toddlerProgram.create.mockResolvedValue({ id: 3 });
  prisma.toddlerProgram.update.mockResolvedValue({});
  prisma.player.createMany.mockResolvedValue({});
  prisma.player.updateMany.mockResolvedValue({});
  prisma.player.update.mockImplementation(({ where, data }) => Promise.resolve({ id: where.id, ...data }));
});

describe('generateToddlerCycle with heirs', () => {
  it('injects pending heirs into the cycle and fills the rest with random toddlers', async () => {
    prisma.player.findMany.mockResolvedValue([{ id: 41 }, { id: 42 }]);

    await generateToddlerCycle(prisma, 2);

    expect(prisma.player.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'heir_pending' },
      take: HEIR_MAX_PER_CYCLE,
    }));
    expect(prisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [41, 42] } },
      data: expect.objectContaining({ status: 'toddler_program', age: TODDLER_PROGRAM_START_AGE, toddler_program_id: 3 }),
    });
    expect(prisma.player.createMany.mock.calls[0][0].data).toHaveLength(TODDLER_PROGRAM_SIZE - 2);
  });

  it('without heirs creates the full random cycle', async () => {
    prisma.player.findMany.mockResolvedValue([]);
    await generateToddlerCycle(prisma, 2);
    expect(prisma.player.updateMany).not.toHaveBeenCalled();
    expect(prisma.player.createMany.mock.calls[0][0].data).toHaveLength(TODDLER_PROGRAM_SIZE);
  });
});

describe('CPU pick loyalty', () => {
  const program = { id: 3, status: 'selecting', pick_order: [7, 8], current_pick: 1 };
  const toddler = (id, skill, primaryTeamId = null) => ({
    id, current_skill: skill, position: 'SS', age: 18, potential_coefficient: 70,
    parent: primaryTeamId ? { hall_of_fame: { primary_team_id: primaryTeamId } } : null,
  });

  it("picks the heir of the team's own legend over a better toddler", async () => {
    prisma.player.findMany
      .mockResolvedValueOnce([toddler(1, 30), toddler(2, 10, 7)])
      .mockResolvedValueOnce([]);

    const { picked } = await advanceOnePick(prisma, program, { allowUser: true });

    expect(picked.id).toBe(2);
  });

  it("ignores heirs of other teams' legends", async () => {
    prisma.player.findMany
      .mockResolvedValueOnce([toddler(1, 30), toddler(2, 10, 9)])
      .mockResolvedValueOnce([]);

    const { picked } = await advanceOnePick(prisma, program, { allowUser: true });

    expect(picked.id).toBe(1);
  });
});
