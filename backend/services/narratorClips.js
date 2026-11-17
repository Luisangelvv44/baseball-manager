// Narrador pregrabado (ElevenLabs) de la pantalla VS. Puro, sin BD.
// Los mp3 se generan con backend/scripts/generateNarrationScripts.js + generateNarrationAudio.js y
// viven en frontend/public/audio/narrator/<id>.mp3. Aqui solo se decide QUE clips suenan y en que orden:
//   playoffs:  [ronda] -> [enfrentamiento] -> [cierre]
//   temporada: [enfrentamiento] -> [gancho, opcional] -> [cierre]
// El generador importa estas constantes, asi que ids y cantidades no se pueden desincronizar.

const { availableHooks } = require('./introNarration');

// Variantes grabadas por enfrentamiento (dentro de la conferencia) y por cruce Oeste vs Este (final).
const MATCHUP_VARIANTS = 1;
const FINAL_VARIANTS = 1;

// Cuantos clips sueltos hay por categoria (el generador falla si sus plantillas no coinciden).
const SHARED_CLIP_COUNTS = {
  round_group: 2,
  round_quarters: 2,
  round_semis: 2,
  round_final: 2,
  hook_rivalry: 3,
  hook_win_streak_home: 2,
  hook_win_streak_away: 2,
  hook_loss_streak_home: 2,
  hook_loss_streak_away: 2,
  hook_heir: 2,
  hook_homers: 2,
  closer: 5,
};

const ROUND_CATEGORY = { 0: 'round_group', 1: 'round_quarters', 2: 'round_semis', 3: 'round_final' };

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const pairKey = (awayName, homeName) => `${slug(awayName)}__at__${slug(homeName)}`;
const matchupClipId = (awayName, homeName, v) => `matchup__${pairKey(awayName, homeName)}__v${v}`;
const finalClipId = (awayName, homeName, v) => `final__${pairKey(awayName, homeName)}__v${v}`;
const sharedClipId = (category, v) => `${category}__v${v}`;

const pickVariant = (count, rng) => 1 + (Math.floor(rng() * count) % count);
const pickShared = (category, rng) => sharedClipId(category, pickVariant(SHARED_CLIP_COUNTS[category], rng));

// Gancho de temporada regular -> categoria de clip (los streaks se dicen como "locales"/"visitantes").
function hookCategory(hook, facts) {
  if (hook.key === 'rivalry') return 'hook_rivalry';
  if (hook.key === 'heir') return 'hook_heir';
  if (hook.key === 'homers') return 'hook_homers';
  if (hook.key === 'winStreak' || hook.key === 'lossStreak') {
    const side = hook.vars.team === facts.homeName ? 'home' : 'away';
    return `hook_${hook.key === 'winStreak' ? 'win' : 'loss'}_streak_${side}`;
  }
  return null;
}

// facts: los de gameIntroService.getIntroFacts() (+ homeConference / awayConference).
// Devuelve los ids de clip en orden de reproduccion.
function buildNarratorClips(facts, { rng = Math.random, streakMin, hrMin } = {}) {
  const clips = [];
  const isPlayoff = facts.playoffRound != null;
  const crossConference = facts.homeConference && facts.awayConference
    && facts.homeConference !== facts.awayConference;

  if (isPlayoff) clips.push(pickShared(ROUND_CATEGORY[facts.playoffRound] || 'round_group', rng));

  clips.push(crossConference
    ? finalClipId(facts.awayName, facts.homeName, pickVariant(FINAL_VARIANTS, rng))
    : matchupClipId(facts.awayName, facts.homeName, pickVariant(MATCHUP_VARIANTS, rng)));

  if (!isPlayoff) {
    const hooks = availableHooks(facts, { streakMin, hrMin })
      .map((h) => hookCategory(h, facts))
      .filter(Boolean);
    if (hooks.length) clips.push(pickShared(hooks[Math.floor(rng() * hooks.length) % hooks.length], rng));
  }

  clips.push(pickShared('closer', rng));
  return clips;
}

module.exports = {
  MATCHUP_VARIANTS,
  FINAL_VARIANTS,
  SHARED_CLIP_COUNTS,
  slug,
  pairKey,
  matchupClipId,
  finalClipId,
  sharedClipId,
  buildNarratorClips,
};
