const { simulateAtBat } = require('./atBatSimulator');

// lineup: { teamId, players: [{id, current_skill, position}, ...] (9 bateadores) }
// pitcher: { id, current_skill }
function simulateGame(homeLineup, awayLineup, homePitcher, awayPitcher) {
  const state = {
    inning: 1,
    half: 'top', // top = bate visitante, bottom = bate local
    outs: 0,
    bases: [false, false, false], // 1B, 2B, 3B
    homeScore: 0,
    awayScore: 0,
    homeBatterIdx: 0,
    awayBatterIdx: 0,
    events: [],
    eventOrder: 0,
  };

  const MAX_INNINGS = 15; // limite de seguridad

  while (!isGameOver(state) && state.inning <= MAX_INNINGS) {
    const isTop = state.half === 'top';
    const battingLineup = isTop ? awayLineup : homeLineup;
    const battingIdxKey = isTop ? 'awayBatterIdx' : 'homeBatterIdx';
    const pitcher = isTop ? homePitcher : awayPitcher;
    const battingTeamId = battingLineup.teamId;

    const batter = battingLineup.players[state[battingIdxKey] % battingLineup.players.length];
    const result = simulateAtBat(batter.current_skill, pitcher.current_skill);

    const runsScored = applyResult(state, result);

    state.events.push({
      inning: state.inning,
      half: state.half,
      batting_team_id: battingTeamId,
      player_id: batter.id,
      result,
      outs_after: state.outs,
      runs_scored: runsScored,
      bases_after: [...state.bases],
      event_order: state.eventOrder++,
    });

    state[battingIdxKey]++;

    if (state.outs >= 3) {
      advanceInning(state);
    }

    // chequeo de walk-off / fin de juego despues de cada jugada
    if (checkWalkOff(state)) break;
  }

  return {
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    events: state.events,
  };
}

function applyResult(state, result) {
  let runs = 0;
  switch (result) {
    case 'SO':
    case 'GO':
    case 'FO':
      state.outs++;
      break;
    case 'BB':
    case '1B':
      runs += advanceRunners(state, 1);
      state.bases[0] = true;
      break;
    case '2B':
      runs += advanceRunners(state, 2);
      state.bases = [false, true, false];
      break;
    case '3B':
      runs += advanceRunners(state, 3);
      state.bases = [false, false, true];
      break;
    case 'HR':
      runs += advanceRunners(state, 4) + 1;
      state.bases = [false, false, false];
      break;
  }

  if (state.half === 'top') state.awayScore += runs;
  else state.homeScore += runs;

  return runs;
}

function advanceRunners(state, basesAdvanced) {
  let runsIn = 0;
  const newBases = [false, false, false];

  for (let i = 2; i >= 0; i--) {
    if (state.bases[i]) {
      const newPos = i + basesAdvanced;
      if (newPos >= 3) runsIn++;
      else newBases[newPos] = true;
    }
  }

  state.bases = newBases;
  return runsIn;
}

function advanceInning(state) {
  state.outs = 0;
  state.bases = [false, false, false];
  if (state.half === 'top') {
    state.half = 'bot';
  } else {
    state.half = 'top';
    state.inning++;
  }
}

// Termina si se completaron 9+ y no estan empatados al cierre de una mitad
function isGameOver(state) {
  if (state.inning > 9 && state.outs === 0 && state.bases.every((b) => !b)) {
    if (state.half === 'top' && state.homeScore !== state.awayScore) {
      // se va a jugar la baja solo si visitante no quedo arriba... simplificamos:
      return state.homeScore > state.awayScore;
    }
    if (state.half === 'bot' && state.homeScore !== state.awayScore) {
      return true;
    }
  }
  return false;
}

// Walk-off: local toma la ventaja en la baja de la 9na o despues
function checkWalkOff(state) {
  return (
    state.inning >= 9 &&
    state.half === 'bot' &&
    state.homeScore > state.awayScore &&
    state.outs < 3
  );
}

module.exports = { simulateGame };
