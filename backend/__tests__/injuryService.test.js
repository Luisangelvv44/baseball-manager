jest.mock('../db/prisma');
jest.mock('../services/newsService', () => ({ createNews: jest.fn() }));

const prisma = require('../db/prisma');
const { checkAndApplyGameInjuries } = require('../services/injuryService');

// Lineups minimos: un pitcher del usuario (team 1) y uno de la CPU (team 2)
const homeLineup = { pitcher: { id: 1 }, players: [] };
const awayLineup = { pitcher: { id: 2 }, players: [] };

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  prisma.player.findMany.mockResolvedValue([
    { id: 1, age: 40, team_id: 1 },
    { id: 2, age: 40, team_id: 2 },
  ]);
});

describe('checkAndApplyGameInjuries with medical facilities', () => {
  it('reduces injury probability only for the user team', async () => {
    prisma.team.findUnique.mockResolvedValue({ medical_level: 5 });
    // 0.0045 < base prob (0.005) pero >= 0.005 * 0.68 -> solo se lesiona el de la CPU
    jest.spyOn(Math, 'random').mockReturnValue(0.0045);

    const injured = await checkAndApplyGameInjuries(homeLineup, awayLineup);
    expect(injured.map((i) => i.id)).toEqual([2]);
  });

  it('shortens injury duration for the user team (min 2 days)', async () => {
    prisma.team.findUnique.mockResolvedValue({ medical_level: 5 });
    jest.spyOn(Math, 'random').mockReturnValue(0); // siempre lesiona, randomDays() = 3

    const injured = await checkAndApplyGameInjuries(homeLineup, awayLineup);
    expect(injured).toEqual([{ id: 1, days: 2 }, { id: 2, days: 3 }]);
  });

  it('behaves as before at medical level 1', async () => {
    prisma.team.findUnique.mockResolvedValue({ medical_level: 1 });
    jest.spyOn(Math, 'random').mockReturnValue(0.0045);

    const injured = await checkAndApplyGameInjuries(homeLineup, awayLineup);
    expect(injured.map((i) => i.id)).toEqual([1, 2]);
  });
});
