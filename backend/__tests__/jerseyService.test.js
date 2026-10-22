jest.mock('../db/prisma');
jest.mock('../services/newsService', () => ({ createNews: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const { createNews } = require('../services/newsService');
const { syncJerseyNumbers, retireNumber, pickNumber } = require('../services/jerseyService');
const { USER_TEAM_ID, RETIRED_NUMBER_MIN_SEASONS } = require('../config');

const firstFree = () => 0; // rng -> primer numero libre del pool

function player(overrides) {
  return {
    first_name: 'Juan', last_name: 'Perez', position: 'SS', team_id: 5,
    jersey_number: null, jersey_team_id: null, parent_id: null, parent: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.player.findMany.mockResolvedValue([]);
  prisma.player.update.mockResolvedValue({});
  prisma.retiredNumber.findMany.mockResolvedValue([]);
  prisma.contract.findMany.mockResolvedValue([]);
  prisma.contract.updateMany.mockResolvedValue({});
});

const assignedNumbers = () =>
  Object.fromEntries(prisma.player.update.mock.calls.map(([{ where, data }]) => [where.id, data.jersey_number]));

describe('pickNumber', () => {
  it('uses the first allowed preference', () => {
    expect(pickNumber({ preferences: [null, 7, 8], position: 'SS', isAllowed: (n) => n !== 7, rng: firstFree })).toBe(8);
  });

  it('falls back to the position range, then to any free number', () => {
    expect(pickNumber({ position: 'P', isAllowed: () => true, rng: firstFree })).toBe(30);
    expect(pickNumber({ position: 'SS', isAllowed: () => true, rng: firstFree })).toBe(1);
    expect(pickNumber({ position: 'SS', isAllowed: (n) => n === 0 || n > 39, rng: firstFree })).toBe(0);
    expect(pickNumber({ position: 'SS', isAllowed: () => false })).toBeNull();
  });
});

describe('syncJerseyNumbers', () => {
  it('keeps valid numbers and gives newcomers a free one (keeping theirs if possible)', async () => {
    prisma.player.findMany.mockResolvedValue([
      player({ id: 1, jersey_number: 10, jersey_team_id: 5 }), // ya tiene su numero
      player({ id: 2, jersey_number: 22, jersey_team_id: 9 }), // llega de otro equipo con el 22 libre
      player({ id: 3, jersey_number: 10, jersey_team_id: 9 }), // llega con el 10, ya usado
      player({ id: 4 }), // sin numero
    ]);

    const { assigned } = await syncJerseyNumbers({ rng: firstFree });

    expect(assigned).toBe(3);
    expect(assignedNumbers()).toEqual({ 2: 22, 3: 1, 4: 2 });
    expect(prisma.player.update).toHaveBeenCalledWith({ where: { id: 2 }, data: { jersey_number: 22, jersey_team_id: 5 } });
    expect(prisma.contract.updateMany).toHaveBeenCalledWith({
      where: { player_id: 2, team_id: 5, status: 'active' },
      data: { jersey_number: 22 },
    });
  });

  it('moves a player off a number his team retired', async () => {
    prisma.retiredNumber.findMany.mockResolvedValue([{ team_id: 5, number: 10, player_id: 77 }]);
    prisma.player.findMany.mockResolvedValue([player({ id: 1, jersey_number: 10, jersey_team_id: 5 })]);

    await syncJerseyNumbers({ rng: firstFree });

    expect(assignedNumbers()).toEqual({ 1: 1 });
  });

  it("lets an heir wear his father's retired number and announces it", async () => {
    prisma.retiredNumber.findMany.mockResolvedValue([{ team_id: USER_TEAM_ID, number: 24, player_id: 77 }]);
    prisma.player.findMany.mockResolvedValue([
      player({
        id: 1, team_id: USER_TEAM_ID, first_name: 'Ken', last_name: 'Griffey Jr.', parent_id: 77,
        parent: { first_name: 'Ken', last_name: 'Griffey', jersey_number: 24 },
      }),
    ]);

    await syncJerseyNumbers({ season: { id: 3, current_day: 1 }, rng: firstFree });

    expect(assignedNumbers()).toEqual({ 1: 24 });
    expect(createNews).toHaveBeenCalledWith(
      'hall_of_fame',
      expect.stringContaining('lucirá el #24 de su padre Ken Griffey, el que su equipo había retirado'),
      1,
      3,
      { teamId: USER_TEAM_ID, alert: true },
    );
  });

  it("does not give other players a number retired for someone else's father", async () => {
    prisma.retiredNumber.findMany.mockResolvedValue([{ team_id: 5, number: 24, player_id: 77 }]);
    prisma.player.findMany.mockResolvedValue([
      player({ id: 1, parent_id: 88, parent: { first_name: 'X', last_name: 'Y', jersey_number: 24 } }),
    ]);

    await syncJerseyNumbers({ rng: firstFree });

    expect(assignedNumbers()).toEqual({ 1: 1 });
    expect(createNews).not.toHaveBeenCalled();
  });

  it('fills blank active contracts of players that already have a number', async () => {
    prisma.player.findMany.mockResolvedValue([player({ id: 1, jersey_number: 10, jersey_team_id: 5 })]);
    prisma.contract.findMany.mockResolvedValue([{ id: 900, player_id: 1, team_id: 5 }]);

    const { assigned } = await syncJerseyNumbers();

    expect(assigned).toBe(0);
    expect(prisma.contract.updateMany).toHaveBeenCalledWith({ where: { id: { in: [900] } }, data: { jersey_number: 10 } });
  });
});

describe('retireNumber', () => {
  const retired = (overrides) => ({
    id: 50, first_name: 'Babe', last_name: 'Ruth', status: 'retired',
    jersey_number: 3, jersey_team_id: USER_TEAM_ID, hall_of_fame: null, ...overrides,
  });
  const seasons = (n) => Array.from({ length: n }, (_, i) => ({ season_id: i + 1 }));

  beforeEach(() => {
    prisma.retiredNumber.findFirst.mockResolvedValue(null);
    prisma.retiredNumber.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    prisma.contract.findFirst.mockResolvedValue({ jersey_number: 3 });
    prisma.team.findUnique.mockResolvedValue({ name: 'Yankees', fan_base: 100000 });
  });

  it('retires the number worn with the team and announces it', async () => {
    prisma.player.findUnique.mockResolvedValue(retired());
    prisma.playerSeasonRecord.findMany.mockResolvedValue(seasons(RETIRED_NUMBER_MIN_SEASONS));

    const row = await retireNumber(USER_TEAM_ID, 50, { seasonId: 4, seasonDay: 2 });

    expect(prisma.retiredNumber.create).toHaveBeenCalledWith({
      data: { team_id: USER_TEAM_ID, player_id: 50, number: 3, season_id: 4 },
    });
    expect(row.fan_bonus).toBe(false);
    expect(prisma.team.update).not.toHaveBeenCalled();
    expect(createNews).toHaveBeenCalledWith('hall_of_fame', expect.stringContaining('Yankees retira el #3 de Babe Ruth'), 2, 4, {
      teamId: USER_TEAM_ID,
      alert: true,
    });
  });

  it('gives a fan boost for Hall of Famers', async () => {
    prisma.player.findUnique.mockResolvedValue(retired({ hall_of_fame: { status: 'inducted' } }));
    prisma.playerSeasonRecord.findMany.mockResolvedValue(seasons(RETIRED_NUMBER_MIN_SEASONS));

    await retireNumber(USER_TEAM_ID, 50);

    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: USER_TEAM_ID }, data: { fan_base: 102000 } });
  });

  it('requires enough seasons for the user, but not for automatic CPU retirements', async () => {
    prisma.player.findUnique.mockResolvedValue(retired());
    prisma.playerSeasonRecord.findMany.mockResolvedValue(seasons(2));

    await expect(retireNumber(USER_TEAM_ID, 50)).rejects.toThrow(`al menos ${RETIRED_NUMBER_MIN_SEASONS} temporadas`);
    await expect(retireNumber(7, 50, { auto: true })).resolves.toMatchObject({ number: 3 });
  });

  it('rejects active players, missing numbers and numbers already retired', async () => {
    prisma.player.findUnique.mockResolvedValueOnce(retired({ status: 'active' }));
    await expect(retireNumber(USER_TEAM_ID, 50)).rejects.toThrow('jugador retirado');

    prisma.player.findUnique.mockResolvedValueOnce(retired({ jersey_team_id: 9 }));
    prisma.contract.findFirst.mockResolvedValueOnce(null);
    await expect(retireNumber(USER_TEAM_ID, 50)).rejects.toThrow('no tiene un dorsal');

    prisma.player.findUnique.mockResolvedValueOnce(retired());
    prisma.playerSeasonRecord.findMany.mockResolvedValue(seasons(RETIRED_NUMBER_MIN_SEASONS));
    prisma.retiredNumber.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 9, player_id: 60 });
    await expect(retireNumber(USER_TEAM_ID, 50)).rejects.toThrow('#3 ya está retirado');
  });
});
