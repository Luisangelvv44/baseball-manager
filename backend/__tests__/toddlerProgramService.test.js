jest.mock('../db/prisma');
jest.mock('../services/playerAppearanceService', () => ({ syncMissingAppearances: jest.fn().mockResolvedValue(0) }));
jest.mock('../services/contractService', () => ({ signContractFromPlayer: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const {
  generateToddlerCycle,
  advanceOnePick,
  runToddlerProgramSeasonEnd,
  toddlerProjectedSkill,
} = require('../services/toddlerProgramService');
const {
  TODDLER_PROGRAM_SIZE,
  TODDLER_PROGRAM_START_AGE,
  TODDLER_PROGRAM_SKILL_COST,
  HEIR_MAX_PER_CYCLE,
} = require('../config');

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

  it('picks by projected skill, not by raw development percentage', async () => {
    prisma.player.findMany
      .mockResolvedValueOnce([
        { ...toddler(1, 90), potential_coefficient: 40 },
        { ...toddler(2, 60), potential_coefficient: 90 },
      ])
      .mockResolvedValueOnce([{ position: 'SS' }, { position: 'SS' }, ...['P', 'C', '1B', '2B', '3B', 'LF', 'CF', 'RF', 'DH'].flatMap((position) => [{ position }, { position }])]);

    const { picked } = await advanceOnePick(prisma, program, { allowUser: true });

    expect(picked.id).toBe(2);
  });

  it('converts development percentage into real skill when assigned to a team', async () => {
    prisma.player.findMany
      .mockResolvedValueOnce([{ ...toddler(1, 92), potential_coefficient: 50 }])
      .mockResolvedValueOnce([]);

    await advanceOnePick(prisma, program, { allowUser: true });

    expect(prisma.player.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 1 },
      data: expect.objectContaining({ current_skill: 46, team_id: 7, status: 'active' }),
    }));
  });
});

describe('toddlerProjectedSkill', () => {
  it('is the developed share of the potential', () => {
    expect(toddlerProjectedSkill(50, 80)).toBe(40);
  });

  it('never exceeds the potential', () => {
    expect(toddlerProjectedSkill(101, 44)).toBe(44);
  });

  it('keeps early negative development negative', () => {
    expect(toddlerProjectedSkill(-15, 60)).toBe(-9);
  });
});

describe('runToddlerProgramSeasonEnd development', () => {
  afterEach(() => jest.restoreAllMocks());

  it('adds gains as percentage points and caps them at 100%', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0); // todo intento acierta
    prisma.toddlerProgram.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 3, cycle_number: 1, seasons_elapsed: 0, budget: 18 * TODDLER_PROGRAM_SKILL_COST });
    prisma.team.findMany.mockResolvedValue([]);
    prisma.player.findMany.mockResolvedValue([
      { id: 1, current_skill: 50 },
      { id: 2, current_skill: 99 },
      { id: 3, current_skill: 101 },
    ]);

    await runToddlerProgramSeasonEnd();

    // 9 intentos entre 3 toddlers = +3 cada uno
    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { current_skill: 53 } });
    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { current_skill: 100 } });
    expect(prisma.player.update).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 3 } }));
  });
});
