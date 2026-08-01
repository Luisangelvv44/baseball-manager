jest.mock('../db/prisma');
jest.mock('../services/lineup', () => ({ getLineup: jest.fn() }));
jest.mock('../services/gameSimulator', () => ({ simulateGame: jest.fn() }));
jest.mock('../services/injuryService', () => ({ checkAndApplyGameInjuries: jest.fn().mockResolvedValue([]) }));

const prisma = require('../db/prisma');
const { getLineup } = require('../services/lineup');
const { simulateGame } = require('../services/gameSimulator');
const { playGame } = require('../services/gamePlay');
const { mockGame } = require('./mockData');

function buildLineup(teamId, pitcherId) {
  return {
    teamId,
    pitcher: { id: pitcherId, current_skill: 70 },
    players: Array.from({ length: 9 }, (_, i) => ({ id: teamId * 100 + i, current_skill: 70, position: 'OF' })),
  };
}

function buildResult(overrides = {}) {
  return {
    homeScore: 3,
    awayScore: 1,
    events: [],
    walkOff: false,
    finalInning: 9,
    ...overrides,
  };
}

const homeLineup = buildLineup(1, 501);
const awayLineup = buildLineup(2, 502);

beforeEach(() => {
  jest.clearAllMocks();
  getLineup.mockResolvedValueOnce(homeLineup).mockResolvedValueOnce(awayLineup);
  prisma.gameSchedule.update.mockResolvedValue({});
  prisma.gameSchedule.findMany.mockResolvedValue([]); // no streak by default
  prisma.team.findUnique.mockImplementation(({ where }) => {
    if (where.id === 1) return Promise.resolve({ id: 1, name: 'Home Team', reputation: 50, fan_base: 20000 });
    if (where.id === 2) return Promise.resolve({ id: 2, name: 'Away Team', reputation: 50, fan_base: 20000 });
    return Promise.resolve(null);
  });
  prisma.team.update.mockResolvedValue({});
  prisma.player.findMany.mockImplementation(({ where }) =>
    Promise.resolve(where.id.in.map((id) => ({ id, first_name: 'Ray', last_name: 'Ortiz' })))
  );
  prisma.newsItem.create.mockResolvedValue({});
});

function newsTypes() {
  return prisma.newsItem.create.mock.calls.map((c) => c[0].data.type);
}
function newsOfType(type) {
  return prisma.newsItem.create.mock.calls.find((c) => c[0].data.type === type)?.[0].data;
}

describe('playGame - feats detection', () => {
  it('creates a walkoff news item when the game ended on a walk-off', async () => {
    simulateGame.mockReturnValue(buildResult({ walkOff: true, homeScore: 5, awayScore: 4 }));
    await playGame(mockGame);
    expect(newsTypes()).toContain('walkoff');
    expect(newsOfType('walkoff').headline).toMatch(/walk-off/i);
  });

  it('creates an extra_innings news item when the game went past 9 innings', async () => {
    simulateGame.mockReturnValue(buildResult({ finalInning: 11 }));
    await playGame(mockGame);
    expect(newsTypes()).toContain('extra_innings');
    expect(newsOfType('extra_innings').headline).toMatch(/11 entradas/);
  });

  it('creates a no_hitter news item for a pitcher gem', async () => {
    const events = [];
    for (let inning = 1; inning <= 9; inning++) {
      events.push({ inning, half: 'top', result: inning === 4 ? 'BB' : 'SO', player_id: 900, batting_team_id: 2 });
    }
    simulateGame.mockReturnValue(buildResult({ events }));
    await playGame(mockGame);
    expect(newsTypes()).toContain('no_hitter');
    const headline = newsOfType('no_hitter').headline;
    expect(headline).toMatch(/Ray Ortiz/);
    expect(headline).toMatch(/no-hitter/);
  });

  it('creates a cycle news item', async () => {
    const events = [
      { inning: 1, half: 'bot', result: '1B', player_id: 601, batting_team_id: 1 },
      { inning: 3, half: 'bot', result: '2B', player_id: 601, batting_team_id: 1 },
      { inning: 5, half: 'bot', result: '3B', player_id: 601, batting_team_id: 1 },
      { inning: 7, half: 'bot', result: 'HR', player_id: 601, batting_team_id: 1 },
    ];
    simulateGame.mockReturnValue(buildResult({ events }));
    await playGame(mockGame);
    expect(newsTypes()).toContain('cycle');
    expect(newsOfType('cycle').headline).toMatch(/Ray Ortiz/);
  });

  it('creates a multi_hr news item', async () => {
    const events = [1, 2, 3].map((inning) => ({ inning, half: 'bot', result: 'HR', player_id: 601, batting_team_id: 1 }));
    simulateGame.mockReturnValue(buildResult({ events }));
    await playGame(mockGame);
    expect(newsTypes()).toContain('multi_hr');
    expect(newsOfType('multi_hr').headline).toMatch(/3 jonrones/);
  });

  it('does not run the player lookup or create feat news when nothing notable happened', async () => {
    simulateGame.mockReturnValue(buildResult());
    await playGame(mockGame);
    expect(prisma.player.findMany).not.toHaveBeenCalled();
    expect(newsTypes()).toEqual(['game']);
  });
});

describe('playGame - streaks', () => {
  function finishedGame({ day, homeId = 1, awayId = 2, homeScore, awayScore }) {
    return { home_team_id: homeId, away_team_id: awayId, home_score: homeScore, away_score: awayScore, day_number: day };
  }

  it('creates a streak news item at a 5-game milestone', async () => {
    simulateGame.mockReturnValue(buildResult({ homeScore: 3, awayScore: 1 }));
    const homeWinStreak = [5, 4, 3, 2, 1].map((day) => finishedGame({ day, homeScore: 3, awayScore: 1 }));
    prisma.gameSchedule.findMany
      .mockResolvedValueOnce(homeWinStreak) // home team query
      .mockResolvedValueOnce([finishedGame({ day: 5, homeId: 1, awayId: 2, homeScore: 3, awayScore: 1 })]); // away team query, not a milestone

    await playGame(mockGame);
    expect(newsTypes()).toContain('streak');
    expect(newsOfType('streak').headline).toMatch(/5 partidos/);
  });

  it('does not create streak news for playoff games (skipStandings=true)', async () => {
    simulateGame.mockReturnValue(buildResult());
    const homeWinStreak = [5, 4, 3, 2, 1].map((day) => finishedGame({ day, homeScore: 3, awayScore: 1 }));
    prisma.gameSchedule.findMany.mockResolvedValue(homeWinStreak);

    await playGame(mockGame, false, true);
    expect(newsTypes()).not.toContain('streak');
    expect(prisma.gameSchedule.findMany).not.toHaveBeenCalled();
  });
});
