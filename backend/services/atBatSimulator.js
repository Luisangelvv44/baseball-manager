// Probabilidades base para un enfrentamiento "promedio" (skill 50 vs 50).
// Orden de mas probable a menos probable, como pidio el usuario.
const BASE_PROBABILITIES = {
  SO: 0.23,   // strikeout - muy probable
  GO: 0.16,   // groundout
  FO: 0.14,   // flyout
  '1B': 0.16, // hit sencillo
  BB: 0.09,   // base por bolas
  '2B': 0.05, // doble
  HR: 0.03,   // jonron
  '3B': 0.005, // triple
};

function simulateAtBat(batterSkill, pitcherSkill) {
  // skillDiff entre -1 y 1. Positivo favorece al bateador.
  const skillDiff = (batterSkill - pitcherSkill) / 100;

  const probs = { ...BASE_PROBABILITIES };

  probs.SO -= skillDiff * 0.10;
  probs.GO -= skillDiff * 0.025;
  probs.FO -= skillDiff * 0.025;
  probs.BB += skillDiff * 0.03;
  probs['1B'] += skillDiff * 0.05;
  probs['2B'] += skillDiff * 0.02;
  probs['3B'] += skillDiff * 0.005;
  probs.HR += skillDiff * 0.03;

  for (const key in probs) {
    probs[key] = Math.max(0.001, probs[key]);
  }

  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  for (const key in probs) probs[key] /= total;

  const roll = Math.random();
  let cumulative = 0;
  for (const [outcome, prob] of Object.entries(probs)) {
    cumulative += prob;
    if (roll <= cumulative) return outcome;
  }
  return 'SO';
}

module.exports = { simulateAtBat, BASE_PROBABILITIES };
