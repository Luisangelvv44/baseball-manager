const { REPUTATION_MIN, REPUTATION_MAX } = require('../config');

// La reputacion es acumulativa entre temporadas, limitada a [REPUTATION_MIN, REPUTATION_MAX].
function clampReputation(value) {
  return Math.round(Math.max(REPUTATION_MIN, Math.min(REPUTATION_MAX, Number(value) || 0)));
}

module.exports = { clampReputation };
