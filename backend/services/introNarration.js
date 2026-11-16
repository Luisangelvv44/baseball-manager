// Texto del narrador para la pantalla VS (puro, sin BD). Se arma con plantillas: apertura +
// enfrentamiento (abridores) + un gancho (playoffs, rivalidad, racha, heredero o jonronero) + cierre.
// Los numeros se escriben con letras para que el TTS los lea con naturalidad.

const UNITS = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve',
  'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis',
  'veintisiete', 'veintiocho', 'veintinueve',
];
const TENS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

// 0-999 con letras. masculine: "uno" -> "un" delante de sustantivo ("veintiún jonrones").
function numberToSpanish(n, { masculine = false } = {}) {
  n = Math.trunc(n);
  if (n < 0 || n > 999) return String(n);
  let words;
  if (n < 30) {
    words = UNITS[n];
  } else if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    words = u === 0 ? TENS[t] : `${TENS[t]} y ${UNITS[u]}`;
  } else {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const HUNDREDS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
      'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    if (n === 100) return 'cien';
    words = rest === 0 ? HUNDREDS[h] : `${HUNDREDS[h]} ${numberToSpanish(rest)}`;
  }
  if (masculine) {
    words = words.replace(/veintiuno$/, 'veintiún').replace(/(^|\s)uno$/, '$1un');
  }
  return words;
}

// RNG determinista (mulberry32) para que el mismo partido genere siempre el mismo texto
// (la precarga y la reproduccion piden el mismo audio y comparten cache).
function seededRng(seed) {
  let a = (Number(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

const OPENERS = [
  '¡Buenas noches desde {city}!',
  'Todo listo en {city}.',
  'Amigos, se juega en {city}.',
  '¡Saludos, aficionados, desde {city}!',
];

const PLAYOFF_OPENERS = {
  0: ['¡Noche de playoffs en {city}!', 'Fase de grupos de los playoffs, desde {city}.'],
  1: ['¡Cuartos de final, desde {city}!', 'Playoffs en {city}: se juegan los cuartos de final.'],
  2: ['¡Semifinales, desde {city}!', 'A un paso de la final, desde {city}.'],
  3: ['¡Es la gran final, señores, desde {city}!', '¡Noche de final en {city}!'],
};

const MATCHUPS_WITH_PITCHERS = [
  'Los {away} visitan a los {home}, y en la loma: {awayP} contra {homeP}.',
  'Duelo en la loma: {awayP}, por los {away}, frente a {homeP}, de los {home}.',
  '{away} contra {home}. Abren {awayP} y {homeP}.',
];

const MATCHUPS = [
  'Los {away} visitan a los {home}.',
  '{away} contra {home}.',
];

const HOOKS = {
  playoff: ['Aquí no hay mañana.', 'Perder ya no es opción.'],
  final: ['Nueve entradas para la gloria.'],
  rivalry: ['Y esto es rivalidad, señores: aquí no hay partido pequeño.', 'Se respira rivalidad en el estadio.'],
  winStreak: ['Los {team} llegan con {n} victorias al hilo.', 'Los {team} vienen encendidos: {n} triunfos seguidos.'],
  lossStreak: ['Los {team} buscan cortar una racha de {n} derrotas.', 'Los {team} necesitan reaccionar: suman {n} derrotas seguidas.'],
  heir: ['Ojo con {player}, el hijo del legendario {parent}.', 'Atentos a {player}: lleva en la sangre el béisbol del gran {parent}.'],
  homers: ['Cuidado con {player}, que ya suma {n} jonrones.', '{player} llega con {n} cuadrangulares en la temporada.'],
};

const CLOSERS = ['¡Playball!', '¡Que empiece el juego!', 'Pónganse cómodos, que esto arranca.', '¡Vamos a jugar!'];

// Ganchos disponibles para este partido, en forma de { key, vars }.
function availableHooks(facts, { streakMin = 3, hrMin = 10 } = {}) {
  const hooks = [];
  if (facts.isRivalry) hooks.push({ key: 'rivalry', vars: {} });
  const streak = [...(facts.streaks || [])]
    .filter((s) => s.length >= streakMin)
    .sort((a, b) => b.length - a.length)[0];
  if (streak) {
    hooks.push({
      key: streak.type === 'W' ? 'winStreak' : 'lossStreak',
      vars: { team: streak.teamName, n: numberToSpanish(streak.length) },
    });
  }
  if (facts.heir) hooks.push({ key: 'heir', vars: { player: facts.heir.name, parent: facts.heir.parentName } });
  if (facts.hrLeader && facts.hrLeader.count >= hrMin) {
    hooks.push({
      key: 'homers',
      vars: { player: facts.hrLeader.name, n: numberToSpanish(facts.hrLeader.count, { masculine: true }) },
    });
  }
  return hooks;
}

// facts: { city, homeName, awayName, homePitcher, awayPitcher, playoffRound (null|0-3), isRivalry,
//          streaks: [{ teamName, type: 'W'|'L', length }], hrLeader: { name, count }|null,
//          heir: { name, parentName }|null }
function buildIntroText(facts, { rng = Math.random, streakMin, hrMin } = {}) {
  const vars = {
    city: facts.city,
    home: facts.homeName,
    away: facts.awayName,
    homeP: facts.homePitcher,
    awayP: facts.awayPitcher,
  };
  const isPlayoff = facts.playoffRound != null;
  const parts = [];

  const openers = isPlayoff ? (PLAYOFF_OPENERS[facts.playoffRound] || PLAYOFF_OPENERS[0]) : OPENERS;
  parts.push(fill(pick(openers, rng), vars));

  const matchups = facts.homePitcher && facts.awayPitcher ? MATCHUPS_WITH_PITCHERS : MATCHUPS;
  parts.push(fill(pick(matchups, rng), vars));

  if (isPlayoff) {
    parts.push(pick(facts.playoffRound === 3 ? HOOKS.final : HOOKS.playoff, rng));
  } else {
    const hooks = availableHooks(facts, { streakMin, hrMin });
    if (hooks.length) {
      const hook = pick(hooks, rng);
      parts.push(fill(pick(HOOKS[hook.key], rng), hook.vars));
    }
  }

  parts.push(pick(CLOSERS, rng));
  return parts.join(' ');
}

module.exports = { buildIntroText, availableHooks, numberToSpanish, seededRng };
