jest.mock('../db/prisma');
jest.mock('../services/newsService', () => ({ createNews: jest.fn().mockResolvedValue({}) }));

const prisma = require('../db/prisma');
const {
  toSeasonDay,
  getAllStarBreak,
  buildSquad,
  pickMvp,
  playAllStarGame,
} = require('../services/allStarService');
const { createDerbyEvent, runDerbyDay } = require('../services/derbyService');
const { createNews } = require('../services/newsService');
const { PRE_SEASON_DAYS, GAMES_PER_SEASON, ALL_STAR_BREAK_DAYS } = require('../config');

beforeEach(() => {
  jest.clearAllMocks();
});

const season = (over = {}) => ({
  id: 3,
  current_day: 62,
  total_days: PRE_SEASON_DAYS + GAMES_PER_SEASON + ALL_STAR_BREAK_DAYS,
  status: 'active',
  ...over,
});

describe('toSeasonDay / getAllStarBreak', () => {
  it('leaves two empty days between both legs', () => {
    expect(toSeasonDay(1)).toBe(16);
    expect(toSeasonDay(45)).toBe(60);
    expect(toSeasonDay(46)).toBe(63);
    expect(toSeasonDay(90)).toBe(107);
  });

  it('places the derby and the All-Star game on the empty days', () => {
    expect(getAllStarBreak(season())).toEqual({ derbyDay: 61, allStarDay: 62 });
  });

  it('returns null for seasons created without the break', () => {
    expect(getAllStarBreak(season({ total_days: PRE_SEASON_DAYS + GAMES_PER_SEASON }))).toBeNull();
    expect(getAllStarBreak(null)).toBeNull();
  });
});

function player(id, position, skill, teamId = 1) {
  return { id, first_name: `F${id}`, last_name: `L${id}`, position, current_skill: skill, team_id: teamId, team: { name: `T${teamId}` } };
}

function conferencePool(offset, teamId) {
  const positions = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const list = positions.flatMap((pos, i) => [player(offset + i * 2, pos, 70, teamId), player(offset + i * 2 + 1, pos, 50, teamId)]);
  list.push(player(offset + 50, 'P', 80, teamId), player(offset + 51, 'P', 60, teamId));
  return list;
}

describe('buildSquad', () => {
  it('picks the best player per position, a DH and the best pitcher', () => {
    const squad = buildSquad(conferencePool(100, 1));
    expect(squad.pitcher.id).toBe(150);
    expect(squad.players).toHaveLength(9);
    expect(squad.players.filter((p) => p.position === 'DH')).toHaveLength(1);
    const starters = squad.players.filter((p) => p.position !== 'DH');
    expect(starters.every((p) => p.current_skill === 70)).toBe(true);
  });

  it('returns null without a pitcher or enough hitters', () => {
    expect(buildSquad(conferencePool(100, 1).filter((p) => p.position !== 'P'))).toBeNull();
    expect(buildSquad([player(1, 'P', 50), player(2, 'C', 50)])).toBeNull();
  });
});

describe('pickMvp', () => {
  it('chooses the top hitter of the winning side', () => {
    const events = [
      { batting_team_id: 'Oeste', player_id: 1, result: 'HR', runs_scored: 2 },
      { batting_team_id: 'Este', player_id: 2, result: 'HR', runs_scored: 4 },
      { batting_team_id: 'Oeste', player_id: 3, result: '1B', runs_scored: 0 },
    ];
    expect(pickMvp(events, 'Oeste')).toBe(1);
    expect(pickMvp(events, null)).toBe(2);
  });
});

describe('playAllStarGame', () => {
  it('returns the stored game without replaying it', async () => {
    prisma.allStarGame.findUnique.mockResolvedValue({ id: 9 });
    const game = await playAllStarGame(season());
    expect(game).toEqual({ id: 9 });
    expect(prisma.allStarGame.create).not.toHaveBeenCalled();
  });

  it('plays Oeste vs Este, stores it, boosts fans and publishes news', async () => {
    prisma.allStarGame.findUnique.mockResolvedValue(null);
    prisma.team.findMany.mockResolvedValue([
      { id: 1, name: 'T1', division: { name: 'Division Noroeste' } },
      { id: 2, name: 'T2', division: { name: 'Division Noreste' } },
    ]);
    prisma.player.findMany.mockResolvedValue([...conferencePool(100, 1), ...conferencePool(300, 2)]);
    prisma.allStarGame.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    prisma.team.findUnique.mockResolvedValue({ fan_base: 100000 });
    prisma.team.update.mockResolvedValue({ id: 1, fan_base: 101000, min_fan_base_season: 100000, max_fan_base_season: 101000 });

    const game = await playAllStarGame(season());
    expect(game.rosters.Oeste.players).toHaveLength(9);
    expect(game.rosters.Este.players).toHaveLength(9);
    expect(new Set([game.home_conference, game.away_conference])).toEqual(new Set(['Oeste', 'Este']));
    expect(game.events.length).toBeGreaterThan(0);
    // Un update de fans por equipo (+ el rango de fan_base)
    expect(prisma.team.update.mock.calls.filter(([arg]) => arg.data.fan_base != null)).toHaveLength(2);
    expect(createNews).toHaveBeenCalledWith('all_star', expect.any(String), 62, 3);
    // Fuera de las estadisticas: nada va a GameEvent ni al calendario
    expect(prisma.gameEvent.createMany).not.toHaveBeenCalled();
  });
});

describe('derby on the All-Star break', () => {
  it('rejects creating the derby outside its day', async () => {
    prisma.season.findFirst.mockResolvedValue(season({ current_day: 40 }));
    await expect(createDerbyEvent({ playerId: 1, rewardAmount: 1000 })).rejects.toThrow(/dia 61/);
  });

  it('rejects a second derby in the same season', async () => {
    prisma.season.findFirst.mockResolvedValue(season({ current_day: 61 }));
    prisma.homeRunDerbyEvent.findFirst.mockResolvedValue({ id: 1 });
    await expect(createDerbyEvent({ playerId: 1, rewardAmount: 1000 })).rejects.toThrow(/ya fue creado/);
  });

  it('runs a CPU-only derby when the user did not enter one', async () => {
    prisma.homeRunDerbyEvent.findFirst.mockResolvedValue(null);
    prisma.team.findMany.mockResolvedValue([{ id: 2, budget: 1000000, bid_aggressiveness: 0.1 }]);
    prisma.player.findFirst.mockResolvedValue({ id: 20 });
    prisma.homeRunDerbyEvent.create.mockResolvedValue({ id: 5, status: 'completed' });

    const event = await runDerbyDay(season({ current_day: 61 }));
    const { data } = prisma.homeRunDerbyEvent.create.mock.calls[0][0];
    expect(data.entries.create).toEqual([expect.objectContaining({ team_id: 2, player_id: 20 })]);
    expect(event).toEqual({ id: 5, status: 'completed' });
  });
});
