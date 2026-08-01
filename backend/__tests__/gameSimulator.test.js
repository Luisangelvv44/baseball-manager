jest.mock('../services/atBatSimulator', () => ({ simulateAtBat: jest.fn() }));

const { simulateAtBat } = require('../services/atBatSimulator');
const { simulateGame, checkWalkOff } = require('../services/gameSimulator');

function buildLineup(teamId, pitcherId) {
  return {
    teamId,
    pitcher: { id: pitcherId, current_skill: 70 },
    players: Array.from({ length: 9 }, (_, i) => ({ id: teamId * 100 + i, current_skill: 70, position: 'OF' })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('simulateGame', () => {
  it('always returns walkOff and finalInning alongside the score', () => {
    simulateAtBat.mockReturnValue('SO');
    const home = buildLineup(1, 501);
    const away = buildLineup(2, 502);

    const result = simulateGame(home, away, home.pitcher, away.pitcher);

    expect(result.homeScore).toBe(0);
    expect(result.awayScore).toBe(0);
    expect(result.walkOff).toBe(false);
    expect(result.finalInning).toBeGreaterThanOrEqual(9);
  });

  it('flags walkOff and stops at inning 9 when the home team takes the lead in the bottom 9th', () => {
    // 8 full innings (16 half-innings x 3 outs) + top of the 9th (3 outs) + 2 outs in
    // the bottom 9th, then a home run on the next at-bat wins it.
    const outsBeforeWalkOff = 16 * 3 + 3 + 2;
    let call = 0;
    simulateAtBat.mockImplementation(() => {
      call++;
      return call > outsBeforeWalkOff ? 'HR' : 'SO';
    });

    const home = buildLineup(1, 501);
    const away = buildLineup(2, 502);
    const result = simulateGame(home, away, home.pitcher, away.pitcher);

    expect(result.walkOff).toBe(true);
    expect(result.finalInning).toBe(9);
    expect(result.homeScore).toBe(1);
    expect(result.awayScore).toBe(0);
  });
});

describe('checkWalkOff', () => {
  it('is true when the home team leads in the bottom of the 9th or later with outs remaining', () => {
    expect(checkWalkOff({ inning: 9, half: 'bot', homeScore: 2, awayScore: 1, outs: 1 })).toBe(true);
  });

  it('is false before the 9th inning', () => {
    expect(checkWalkOff({ inning: 8, half: 'bot', homeScore: 2, awayScore: 1, outs: 1 })).toBe(false);
  });

  it('is false when the away team is still ahead', () => {
    expect(checkWalkOff({ inning: 9, half: 'bot', homeScore: 1, awayScore: 2, outs: 1 })).toBe(false);
  });
});
