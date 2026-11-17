// Genera los guiones del narrador para grabarlos una sola vez (p. ej. en ElevenLabs).
// Uso (desde backend/): npm run narration:scripts   -> escribe ../narration/intro-scripts.{csv,json}
//
// Diseño modular: en el juego se reproducen en orden
//   [ronda de playoffs, opcional] -> [enfrentamiento] -> [gancho, opcional] -> [cierre]
// Ningun clip lleva datos dinamicos (abridores, numeros, nombres de jugadores): esos van en pantalla.
// Puro: no toca la base de datos. Los nombres salen del seed (son fijos en toda partida nueva).

const fs = require('fs');
const path = require('path');
const { TEAM_DIVISIONS } = require('../seeders/data/names');
const { DIVISION_CONFERENCES } = require('../config');
const { cityName } = require('../services/mapService');
const { seededRng } = require('../services/introNarration');

const OUT_DIR = path.resolve(__dirname, '../../narration');
// Ids y cantidades compartidos con el juego (services/narratorClips.js elige que clips suenan).
const {
  MATCHUP_VARIANTS: REGULAR_VARIANTS, // clips por enfrentamiento dentro de la conferencia (cada estadio)
  FINAL_VARIANTS, // clips por cruce Oeste vs Este (solo la final)
  SHARED_CLIP_COUNTS,
  pairKey,
  matchupClipId,
  finalClipId,
  sharedClipId,
} = require('../services/narratorClips');

// Grafia fonetica opcional SOLO para el texto que se manda al TTS (columna tts_text).
// Ej.: { Druvask: 'Droo-vask', Adalveer: 'Adal-veer' }. Se aplica por palabra completa.
const PRONUNCIATION = {};

// ---------- plantillas (en ingles) ----------
// Variables: {home} {away} nombre completo, {homeM} {awayM} mascota, {city} ciudad local,
// {awayCity}, {div} "Northwest", {homeConf} {awayConf} "West"/"East".

// Marcas (solo afectan a `tts_text`; en `text` desaparecen y queda la puntuacion normal):
//   "~"      pausa: la , . : ; previa pasa a "…" (tras ! o ? se agrega " …").
//   "^"      pausa con euforia: el signo previo pasa a "!…".
//   "*word*" enfasis: se manda en MAYUSCULAS. Una o dos por clip; mas, y la voz grita sin matices.
// Ademas el punto final de cada clip se vuelve "!". Ver pauseText().

const MATCHUP_ANY = [
  'Good evening from {city}!^ The {home} host the {away} tonight,~ and the visitors are *hungry* for a win.',
  'The lights are on in {city},^ and the {homeM} faithful are already on their *feet*.^ Across the diamond,~ the {away},~ looking to spoil the party.',
  "Folks,^ we've got *baseball* in {city}.^ The {away} are in town to take on the {home},~ and this ballpark is starting to *rumble*.",
  'Hello, baseball fans!^ We are in {city},~ home of the {homeM},~ who defend their turf tonight against the {away}.',
  "Everything's set in {city}.^ The {homeM} take the field in front of their home crowd,~ and in the other dugout,~ the {away},~ hoping to pull off the *upset*.",
  'From {city},^ a very *good* evening to you!^ The {away} made the trip to square off with the {home}.^ This one has all the makings of a *great* ballgame.',
  'Welcome to {city},^ where the {homeM} play host to the {away}.^ The stands are ready,~ and so is the *diamond*.',
  "It's a *baseball* night in {city}.^ At home,~ the {home};^ on the road,~ the {away},~ who came all the way from {awayCity} looking for a win.",
];

const MATCHUP_SAME_DIVISION = [
  'Good evening, everybody,~ and welcome to {city}!^ The {away} visit the {homeM} in a {div} matchup,~ two teams that know each other by *heart*.',
  'Division *showdown* in {city}!^ The {home} and the {away} are fighting for the same piece of the {div},~ and nobody gives an *inch*.',
  'From {city},^ a {div} *classic*:^ the {homeM} host the {away}.^ Whenever these two meet,~ things heat up *fast*.',
  "It's division night in {city}!^ The {away} visit the {home} in a {div} clash that *always* delivers.",
];

const MATCHUP_FINAL = [
  'Ladies and gentlemen,^ from {city}!^ The {home},~ champions of the {homeConf},~ against the {away},~ the best of the {awayConf}!^ A whole season to get *here*.',
  'It all comes down to *this*,~ in {city}!^ The {homeM},~ kings of the {homeConf},~ against the {away},~ rulers of the {awayConf}.^ Only one of them will wear the *crown*.',
  'Championship night in {city}!^ The {homeConf} sends its {home};~ the {awayConf},~ its {away}.^ This is the moment we have *all* been waiting for.',
];

// Clips sueltos (se graban una vez y se reutilizan en cualquier partido).
const SHARED = {
  round_group: [
    'The playoffs are *here*!^ Group stage,~ and every single game is worth its weight in *gold*.',
    "It's *playoff* night, folks!^ The group stage begins.",
  ],
  round_quarters: [
    '*Quarterfinals*!^ Only the best are left standing.',
    'Playoff baseball,~ quarterfinal round:^ losing is *no longer* an option.',
  ],
  round_semis: [
    'The *semifinals*!^ One step away from the championship.',
    "We're in the semifinals,^ and there's *no* tomorrow.",
  ],
  round_final: [
    'Folks,^ this is the *championship* final!',
    "It's championship night!^ Nine innings for *glory*.",
  ],
  hook_rivalry: [
    "And make no mistake,^ this is a *rivalry*:^ there's no such thing as a small game here.",
    "You can feel the *rivalry* in this ballpark!^ These two simply don't like each other.",
    'Keep an eye on this one,^ these two have some *unfinished* business.',
  ],
  hook_win_streak_home: [
    'And the home team comes in red *hot*,~ riding a nice winning streak.',
    'The home side is on a *roll*,^ and this crowd knows it.',
  ],
  hook_win_streak_away: [
    'And watch out,^ the visitors are *streaking*:^ they have won several in a row.',
    'The road team comes in *hot*,~ winning game after game.',
  ],
  hook_loss_streak_home: [
    'The home team needs a *response*:^ they have dropped several straight.',
    'The home side *badly* needs a win~ to snap this skid.',
  ],
  hook_loss_streak_away: [
    'The visitors are looking to *snap* a losing streak~ that is starting to weigh on them.',
    'The road team comes in bruised,~ with several losses in a row.',
  ],
  hook_heir: [
    "And pay attention,^ there's *legendary* blood in this lineup:^ the son of one of the greats of the game.",
    'An heir takes the field tonight:^ a *legendary* name returns to the diamond.',
  ],
  hook_homers: [
    'And be careful,^ one of the top home run hitters of the season is in this lineup.',
    'Keep an eye on the most *dangerous* bat in the league:^ the ball can leave the yard at any moment.',
  ],
  closer: [
    '*Play ball*!',
    "Let's get this game *started*!",
    "Get comfortable, folks,^ we're about to begin.",
    "Let's play some *baseball*!",
    "Caps on,~ peanuts ready…^ let's *play ball*!",
  ],
};

// ---------- utilidades ----------
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => {
  if (vars[k] == null) throw new Error(`Variable sin valor: ${k}`);
  return vars[k];
});

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  // Avalancha (murmur3 fmix): semillas parecidas no deben dar barajas parecidas.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0 || 1;
}

// n plantillas distintas (si alcanzan), deterministas por par.
function pickDistinct(list, n, seed) {
  const rng = seededRng(hash(seed));
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
}

// Texto legible: quita las marcas (~ ^ *).
const plainText = (raw) => raw.replace(/[~^*]/g, '');

// Texto para el TTS (marcas descritas sobre las plantillas).
const pauseText = (raw) => raw
  .replace(/\*([^*]+)\*/g, (_, w) => w.toUpperCase())
  .replace(/[,.:;!?…]?\^\s*/g, '!… ')
  .replace(/([!?])~\s*/g, '$1 … ')
  .replace(/[,.:;…]?~\s*/g, '… ')
  .replace(/\.\s*$/, '!');

function ttsText(raw) {
  return Object.entries(PRONUNCIATION).reduce(
    (t, [word, spoken]) => t.replace(new RegExp(`\\b${word}\\b`, 'g'), spoken), pauseText(raw),
  );
}

const DIVISION_EN = { Noroeste: 'Northwest', Suroeste: 'Southwest', Noreste: 'Northeast', Sureste: 'Southeast' };
const CONFERENCE_EN = { Oeste: 'West', Este: 'East' };

function divisionLabel(divName) {
  const es = divName.replace(/^Division\s+/, '');
  if (!DIVISION_EN[es]) throw new Error(`Division sin traduccion: ${divName}`);
  return DIVISION_EN[es];
}

// ---------- armado ----------
function buildRows() {
  const teams = TEAM_DIVISIONS.flatMap((d) => d.teams.map((name) => {
    const words = name.split(' ');
    return {
      name,
      mascot: words[words.length - 1],
      city: cityName(name),
      division: d.name,
      conference: CONFERENCE_EN[DIVISION_CONFERENCES[d.name]],
    };
  }));

  const rows = [];
  const add = (id, category, raw, extra = {}) => {
    const tts = ttsText(raw);
    rows.push({
      id, file: `${id}.mp3`, category, away: '', home: '', ...extra, text: plainText(raw), tts_text: tts, chars: tts.length,
    });
  };

  for (const home of teams) {
    for (const away of teams) {
      if (home === away) continue;
      const vars = {
        home: home.name, away: away.name, homeM: home.mascot, awayM: away.mascot,
        city: home.city, awayCity: away.city, div: divisionLabel(home.division),
        homeConf: home.conference, awayConf: away.conference,
      };
      const base = pairKey(away.name, home.name);
      if (home.conference === away.conference) {
        // Misma division: la v1 menciona el duelo divisional, el resto sale de las genericas.
        const picks = home.division === away.division
          ? [...pickDistinct(MATCHUP_SAME_DIVISION, 1, base), ...pickDistinct(MATCHUP_ANY, REGULAR_VARIANTS - 1, base)]
          : pickDistinct(MATCHUP_ANY, REGULAR_VARIANTS, base);
        picks.forEach((t, i) =>
          add(matchupClipId(away.name, home.name, i + 1), 'matchup', fill(t, vars), { away: away.name, home: home.name }));
      } else {
        pickDistinct(MATCHUP_FINAL, FINAL_VARIANTS, base).forEach((t, i) =>
          add(finalClipId(away.name, home.name, i + 1), 'matchup_final', fill(t, vars), { away: away.name, home: home.name }));
      }
    }
  }

  for (const [category, lines] of Object.entries(SHARED)) {
    // El juego elige variantes segun SHARED_CLIP_COUNTS: si no coincide, pediria clips inexistentes.
    if (SHARED_CLIP_COUNTS[category] !== lines.length) {
      throw new Error(`${category}: ${lines.length} plantillas pero SHARED_CLIP_COUNTS dice `
        + `${SHARED_CLIP_COUNTS[category]} (services/narratorClips.js)`);
    }
    lines.forEach((t, i) => add(sharedClipId(category, i + 1), category, t));
  }
  const missing = Object.keys(SHARED_CLIP_COUNTS).filter((c) => !SHARED[c]);
  if (missing.length) throw new Error(`Sin plantillas para: ${missing.join(', ')}`);
  return rows;
}

function toCsv(rows) {
  const cols = ['id', 'file', 'category', 'away', 'home', 'text', 'tts_text', 'chars'];
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${[cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')}\n`;
}

function main() {
  const rows = buildRows();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'intro-scripts.json'), `${JSON.stringify(rows, null, 2)}\n`);
  fs.writeFileSync(path.join(OUT_DIR, 'intro-scripts.csv'), toCsv(rows));

  const byCat = rows.reduce((acc, r) => {
    acc[r.category] = acc[r.category] || { clips: 0, chars: 0 };
    acc[r.category].clips += 1;
    acc[r.category].chars += r.chars;
    return acc;
  }, {});
  console.table(byCat);
  console.log(`Total: ${rows.length} clips, ${rows.reduce((s, r) => s + r.chars, 0)} caracteres -> ${OUT_DIR}`);
}

if (require.main === module) main();

module.exports = { buildRows };
