const {
  NEWS_NO_HITTER_MIN_INNINGS,
  NEWS_PERFECT_GAME_MIN_INNINGS,
  NEWS_MULTI_HR_THRESHOLD,
  NEWS_EXTRA_INNINGS_THRESHOLD,
} = require('../config');

const HIT_RESULTS = ['1B', '2B', '3B', 'HR'];

// events: array de eventos de simulateGame. half 'top' = batea visitante (lanza el pitcher local),
// half 'bot' = batea local (lanza el pitcher visitante).
function detectPitcherGems(events, { homePitcherId, awayPitcherId, homeTeamId, awayTeamId }) {
  const gems = [];

  const evaluate = (pitcherId, pitcherTeamId, opponentTeamId, half) => {
    const halfEvents = events.filter((e) => e.half === half);
    if (halfEvents.length === 0) return;

    const hits = halfEvents.filter((e) => HIT_RESULTS.includes(e.result)).length;
    const walks = halfEvents.filter((e) => e.result === 'BB').length;
    const innings = new Set(halfEvents.map((e) => e.inning)).size;

    if (hits === 0 && innings >= NEWS_NO_HITTER_MIN_INNINGS) {
      gems.push({
        pitcherId,
        teamId: pitcherTeamId,
        opponentTeamId,
        perfect: walks === 0 && innings >= NEWS_PERFECT_GAME_MIN_INNINGS,
      });
    }
  };

  evaluate(homePitcherId, homeTeamId, awayTeamId, 'top');
  evaluate(awayPitcherId, awayTeamId, homeTeamId, 'bot');

  return gems;
}

function detectCycles(events) {
  const byPlayer = new Map();
  for (const e of events) {
    if (!HIT_RESULTS.includes(e.result)) continue;
    if (!byPlayer.has(e.player_id)) {
      byPlayer.set(e.player_id, { results: new Set(), teamId: e.batting_team_id });
    }
    byPlayer.get(e.player_id).results.add(e.result);
  }

  return [...byPlayer.entries()]
    .filter(([, v]) => HIT_RESULTS.every((r) => v.results.has(r)))
    .map(([playerId, v]) => ({ playerId, teamId: v.teamId }));
}

function detectMultiHomerGames(events) {
  const counts = new Map();
  for (const e of events) {
    if (e.result !== 'HR') continue;
    const cur = counts.get(e.player_id) || { count: 0, teamId: e.batting_team_id };
    cur.count++;
    counts.set(e.player_id, cur);
  }

  return [...counts.entries()]
    .filter(([, v]) => v.count >= NEWS_MULTI_HR_THRESHOLD)
    .map(([playerId, v]) => ({ playerId, count: v.count, teamId: v.teamId }));
}

function isExtraInningsGame(finalInning) {
  return finalInning >= NEWS_EXTRA_INNINGS_THRESHOLD;
}

// gamesDesc: filas de GameSchedule de un equipo, ordenadas por day_number desc (mas reciente primero)
function computeTrailingStreak(gamesDesc, teamId) {
  let length = 0;
  let type = null;

  for (const g of gamesDesc) {
    const isHome = g.home_team_id === teamId;
    const won = isHome ? g.home_score > g.away_score : g.away_score > g.home_score;
    const result = won ? 'W' : 'L';

    if (type === null) {
      type = result;
      length = 1;
    } else if (result === type) {
      length++;
    } else {
      break;
    }
  }

  return { length, type };
}

module.exports = {
  detectPitcherGems,
  detectCycles,
  detectMultiHomerGames,
  isExtraInningsGame,
  computeTrailingStreak,
};
