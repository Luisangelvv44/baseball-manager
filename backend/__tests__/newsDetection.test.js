const {
  detectPitcherGems,
  detectCycles,
  detectMultiHomerGames,
  isExtraInningsGame,
  computeTrailingStreak,
} = require('../services/newsDetection');
const {
  NEWS_NO_HITTER_MIN_INNINGS,
  NEWS_MULTI_HR_THRESHOLD,
  NEWS_EXTRA_INNINGS_THRESHOLD,
} = require('../config');

function outEvent({ inning, half, result = 'SO', playerId = 900, teamId }) {
  return { inning, half, result, player_id: playerId, batting_team_id: teamId };
}

describe('detectPitcherGems', () => {
  it('flags a no-hitter (not perfect) when the pitcher allows a walk but no hits', () => {
    const events = [];
    for (let inning = 1; inning <= NEWS_NO_HITTER_MIN_INNINGS + 1; inning++) {
      events.push(outEvent({ inning, half: 'top', teamId: 2, result: inning === 3 ? 'BB' : 'SO' }));
    }
    const gems = detectPitcherGems(events, {
      homePitcherId: 501, awayPitcherId: 502, homeTeamId: 1, awayTeamId: 2,
    });
    expect(gems).toHaveLength(1);
    expect(gems[0]).toMatchObject({ pitcherId: 501, teamId: 1, opponentTeamId: 2, perfect: false });
  });

  it('flags a perfect game when there are zero hits and zero walks over 9+ innings', () => {
    const events = [];
    for (let inning = 1; inning <= 9; inning++) {
      events.push(outEvent({ inning, half: 'top', teamId: 2 }));
    }
    const gems = detectPitcherGems(events, {
      homePitcherId: 501, awayPitcherId: 502, homeTeamId: 1, awayTeamId: 2,
    });
    expect(gems).toHaveLength(1);
    expect(gems[0].perfect).toBe(true);
  });

  it('does not flag a gem when a hit was allowed', () => {
    const events = [
      outEvent({ inning: 1, half: 'top', teamId: 2 }),
      outEvent({ inning: 2, half: 'top', teamId: 2, result: '1B' }),
    ];
    for (let inning = 3; inning <= 9; inning++) {
      events.push(outEvent({ inning, half: 'top', teamId: 2 }));
    }
    const gems = detectPitcherGems(events, {
      homePitcherId: 501, awayPitcherId: 502, homeTeamId: 1, awayTeamId: 2,
    });
    expect(gems).toHaveLength(0);
  });

  it('does not flag a gem when too few innings were pitched', () => {
    const events = [
      outEvent({ inning: 1, half: 'top', teamId: 2 }),
      outEvent({ inning: 2, half: 'top', teamId: 2 }),
    ];
    const gems = detectPitcherGems(events, {
      homePitcherId: 501, awayPitcherId: 502, homeTeamId: 1, awayTeamId: 2,
    });
    expect(gems).toHaveLength(0);
  });
});

describe('detectCycles', () => {
  it('detects a player with a single, double, triple and home run in the same game', () => {
    const events = [
      outEvent({ inning: 1, half: 'bot', teamId: 1, playerId: 601, result: '1B' }),
      outEvent({ inning: 3, half: 'bot', teamId: 1, playerId: 601, result: '2B' }),
      outEvent({ inning: 5, half: 'bot', teamId: 1, playerId: 601, result: '3B' }),
      outEvent({ inning: 7, half: 'bot', teamId: 1, playerId: 601, result: 'HR' }),
    ];
    const cycles = detectCycles(events);
    expect(cycles).toEqual([{ playerId: 601, teamId: 1 }]);
  });

  it('does not flag a player missing one hit type', () => {
    const events = [
      outEvent({ inning: 1, half: 'bot', teamId: 1, playerId: 601, result: '1B' }),
      outEvent({ inning: 3, half: 'bot', teamId: 1, playerId: 601, result: '2B' }),
      outEvent({ inning: 7, half: 'bot', teamId: 1, playerId: 601, result: 'HR' }),
    ];
    expect(detectCycles(events)).toHaveLength(0);
  });
});

describe('detectMultiHomerGames', () => {
  it('flags a player who hits at least the configured threshold of home runs', () => {
    const events = Array.from({ length: NEWS_MULTI_HR_THRESHOLD }, (_, i) =>
      outEvent({ inning: i + 1, half: 'bot', teamId: 1, playerId: 601, result: 'HR' })
    );
    const result = detectMultiHomerGames(events);
    expect(result).toEqual([{ playerId: 601, count: NEWS_MULTI_HR_THRESHOLD, teamId: 1 }]);
  });

  it('does not flag a player below the threshold', () => {
    const events = Array.from({ length: NEWS_MULTI_HR_THRESHOLD - 1 }, (_, i) =>
      outEvent({ inning: i + 1, half: 'bot', teamId: 1, playerId: 601, result: 'HR' })
    );
    expect(detectMultiHomerGames(events)).toHaveLength(0);
  });
});

describe('isExtraInningsGame', () => {
  it('is false for a regulation 9-inning game', () => {
    expect(isExtraInningsGame(9)).toBe(false);
  });

  it('is true at the configured extra-innings threshold', () => {
    expect(isExtraInningsGame(NEWS_EXTRA_INNINGS_THRESHOLD)).toBe(true);
  });
});

describe('computeTrailingStreak', () => {
  function game({ day, homeId = 1, awayId = 2, homeScore, awayScore }) {
    return { home_team_id: homeId, away_team_id: awayId, home_score: homeScore, away_score: awayScore, day_number: day };
  }

  it('counts a trailing winning streak for a team, stopping at the first loss', () => {
    const gamesDesc = [
      game({ day: 5, homeScore: 3, awayScore: 1 }), // team 1 (home) wins
      game({ day: 4, homeId: 2, awayId: 1, homeScore: 1, awayScore: 5 }), // team 1 (away) wins
      game({ day: 3, homeScore: 2, awayScore: 0 }), // team 1 (home) wins
      game({ day: 2, homeScore: 1, awayScore: 4 }), // team 1 (home) loses
      game({ day: 1, homeScore: 6, awayScore: 2 }), // team 1 (home) wins
    ];
    expect(computeTrailingStreak(gamesDesc, 1)).toEqual({ length: 3, type: 'W' });
  });

  it('returns a zero-length streak for no games', () => {
    expect(computeTrailingStreak([], 1)).toEqual({ length: 0, type: null });
  });
});
