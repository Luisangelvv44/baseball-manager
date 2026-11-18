// Genera la banda sonora del juego (menus) con ElevenLabs:
//   track_*  -> canciones originales de punk rock / rock melodico con sonido de videojuego de
//               beisbol de mediados de los 2000 (Eleven Music, con voz)
//   calm_*   -> ambiente tranquilo de estadio vacio que suena en bucle entre canciones
//               (Sound Effects, loop)
// Las guarda en frontend/public/audio/music/<id>.mp3 y escribe tracks.json = { tracks, calm } con
// las que existen (titulo/banda ficticios para el "Now playing"; `unlockable` = solo suena tras
// desbloquearla, ver services/musicUnlockService.js). Lo usa frontend/src/utils/gameMusic.js.
//
// Uso (desde backend/):
//   npm run music:audio -- --dry-run        -> lista lo pendiente, no llama a la API
//   npm run music:audio                     -> genera lo que falte
//   npm run music:audio -- --only track_03 --force   -> regenera uno
//
// Reanudable y se detiene al primer error de creditos/permisos. Necesita ELEVENLABS_API_KEY con
// permisos music_generation y sound_generation. Nada de nombres de bandas o canciones reales.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../../frontend/public/audio/music');
const MUSIC_API = 'https://api.elevenlabs.io/v1/music';
const SFX_API = 'https://api.elevenlabs.io/v1/sound-generation';
const OUTPUT_FORMAT = 'mp3_44100_128';
const LENGTH_MS = 120000;

const STYLE =
  'Polished mid-2000s rock production like an original 2005 sports video game soundtrack, '
  + 'loud distorted guitars, punchy live drums, energetic and optimistic. English lyrics.';
// Baladas: el mismo sonido de 2005 pero lento y melodico
const BALLAD_STYLE =
  'Polished mid-2000s rock ballad production like an original 2005 sports video game soundtrack, '
  + 'slow and very melodic, acoustic and clean electric guitars building into a big distorted '
  + 'emotional chorus, warm bass, restrained drums, heartfelt male vocals. English lyrics.';

// Baseball trap: rock y trap moderno energico mezclados
const TRAP_STYLE =
  'Modern energetic rock-trap hybrid like an original 2020s sports video game soundtrack, '
  + 'booming 808 bass, crisp rolling trap hi-hats and snappy claps under loud distorted rock '
  + 'guitar riffs and live drum fills, stadium hype energy, confident rap verses and a big sung '
  + 'rock chorus, male vocals. English lyrics.';

const TRACKS = [
  {
    id: 'track_01',
    title: 'Extra Innings',
    artist: 'The Dugout Kids',
    prompt:
      'Fast pop-punk anthem, 180 bpm, palm-muted power chords, catchy shouted chorus, male vocals '
      + 'singing about summer nights under the stadium lights and never giving up until the last out.',
  },
  {
    id: 'track_02',
    title: 'Bottom of the Ninth',
    artist: 'Seventh Inning Stretch',
    prompt:
      'Melodic rock song, mid-tempo 128 bpm, big soaring chorus, layered guitar leads, male vocals '
      + 'about one last chance, the crowd on its feet and a hometown that believes in you.',
  },
  {
    id: 'track_03',
    title: 'Steal Home',
    artist: 'Rally Caps',
    prompt:
      'Skate punk, very fast 200 bpm, driving bass, gang vocals shouting "hey!", short guitar solo, '
      + 'lyrics about taking risks, running hard and stealing home.',
  },
  {
    id: 'track_04',
    title: 'Summer Never Ends',
    artist: 'Foul Line Radio',
    prompt:
      'Melodic emo-rock with pop-punk drive, 160 bpm, clean guitar intro exploding into distortion, '
      + 'heartfelt male vocals about road trips with the team, ballpark summers and friends forever.',
  },
  {
    id: 'track_05',
    title: 'Grand Slam Generation',
    artist: 'The Bullpen',
    prompt:
      'Upbeat punk rock with arena rock hooks, 170 bpm, handclaps, whoa-oh singalong backing vocals, '
      + 'male lead vocals about a young team rising to the top and swinging for the fences.',
  },
  // Desbloqueables con logros de la franquicia (condiciones en services/musicUnlockService.js)
  {
    id: 'track_06',
    unlockable: true,
    title: 'Opening Day',
    artist: 'The Rookie Cards',
    prompt:
      'Bright pop-punk song, 172 bpm, jangly distorted guitars, catchy chorus, male vocals about the '
      + 'first day of the season, fresh grass, big dreams and a brand new team.',
  },
  {
    id: 'track_07',
    unlockable: true,
    title: 'October Lights',
    artist: 'Wild Card Weekend',
    prompt:
      'Anthemic melodic rock, 138 bpm, soaring guitar leads, huge singalong chorus, male vocals about '
      + 'making the playoffs, cold autumn nights and the whole city wearing your colors.',
  },
  {
    id: 'track_08',
    unlockable: true,
    title: 'Champions Tonight',
    artist: 'The Pennant Chasers',
    prompt:
      'Triumphant punk rock anthem, 176 bpm, gang vocals, fist-pumping chorus, male vocals about '
      + 'winning the championship, champagne in the locker room and a parade downtown.',
  },
  {
    id: 'track_09',
    unlockable: true,
    title: 'Hang It in the Rafters',
    artist: 'Last Call Heroes',
    prompt:
      'Emotional melodic rock power ballad that builds into a big rock finale, 92 bpm then double time, '
      + 'male vocals about a legend whose number will hang above the stadium forever.',
  },
  {
    id: 'track_10',
    unlockable: true,
    title: 'Dynasty',
    artist: 'Back to Back',
    prompt:
      'Heavy fast punk rock, 190 bpm, chugging riffs, shouted gang vocals, short guitar solo, lyrics '
      + 'about a team that keeps winning year after year and nobody can stop them.',
  },
  {
    id: 'track_11',
    unlockable: true,
    title: 'Hall of Legends',
    artist: 'The Immortals',
    prompt:
      'Epic melodic rock, 120 bpm, big drums, harmonized lead guitars, stirring male vocals about a '
      + 'great player entering the hall of fame, his plaque on the wall and memories that never fade.',
  },
  {
    id: 'track_12',
    unlockable: true,
    title: 'Fifteen Rings',
    artist: 'The Ring Collectors',
    prompt:
      'Victorious melodic punk rock, 182 bpm, fast drums, whoa-oh backing vocals, triumphant male '
      + 'vocals about counting championship rings and building a legacy that will last forever.',
  },
  // Baladas rock (lentas y melodicas)
  {
    id: 'track_13',
    style: BALLAD_STYLE,
    title: 'Rain Delay',
    artist: 'Empty Bleachers',
    prompt:
      'Slow rock ballad, 72 bpm, gentle acoustic guitar intro with soft piano, male vocals about '
      + 'waiting out the rain in an empty ballpark, thinking of someone far away, hoping the sky clears.',
  },
  {
    id: 'track_14',
    style: BALLAD_STYLE,
    title: 'Long Way Home',
    artist: 'The Late Innings',
    prompt:
      'Slow melodic rock ballad, 76 bpm, clean arpeggiated electric guitar, male vocals about long '
      + 'road trips with the team, night buses, missing home and the lights of your own stadium.',
  },
  {
    id: 'track_15',
    unlockable: true,
    style: BALLAD_STYLE,
    title: 'Twenty-Five Summers',
    artist: "Old Timers' Day",
    prompt:
      'Slow epic rock ballad, 70 bpm, piano and acoustic guitar intro growing into a soaring guitar '
      + 'solo, male vocals looking back on a lifetime with one franchise, twenty-five summers of wins, '
      + 'losses and friends who are gone, grateful and proud.',
  },
  // Baseball trap (rock + trap moderno)
  {
    id: 'track_16',
    style: TRAP_STYLE,
    title: 'Walk-Off',
    artist: 'Lil Dugout',
    prompt:
      'Hard-hitting rock-trap banger, 145 bpm half-time feel, heavy palm-muted guitar riff over '
      + 'distorted 808s, rapid hi-hat rolls, rap verses about stepping up with two outs in the ninth '
      + 'and ending the game with one swing, explosive shouted chorus "walk-off!".',
  },
  {
    id: 'track_17',
    style: TRAP_STYLE,
    title: 'Ninety-Nine Heat',
    artist: 'Radar Gun',
    prompt:
      'Aggressive trap-metal flavored rock-trap, 150 bpm, dark detuned guitar riff, gritty 808 '
      + 'slides, stuttering hi-hats, rap verses about a closer throwing fastballs at ninety-nine miles '
      + 'per hour and striking out the side, chanted hook with crowd claps.',
  },
  {
    id: 'track_18',
    style: TRAP_STYLE,
    title: 'Bat Flip',
    artist: 'Moonshot Mafia',
    prompt:
      'Swaggering bouncy rock-trap, 140 bpm, catchy guitar lead melody, punchy 808 and claps, '
      + 'confident rap verses about crushing a home run deep into the upper deck and flipping the bat, '
      + 'anthemic sung rock chorus with stadium chants.',
  },
  {
    id: 'track_19',
    style: TRAP_STYLE,
    title: 'Under the Lights',
    artist: 'Night Game Gang',
    prompt:
      'Melodic emotional rock-trap, 138 bpm, atmospheric clean guitar arpeggios building into big '
      + 'distorted power chords, deep 808s, auto-tuned melodic rap verses about grinding through the '
      + 'minor leagues and finally playing under the big league lights, soaring rock chorus.',
  },
  {
    id: 'track_20',
    style: TRAP_STYLE,
    title: 'Run It Up',
    artist: 'Bases Loaded',
    prompt:
      'High-energy hype rock-trap, 155 bpm, fast punk-style guitar riff over booming 808s and '
      + 'triplet hi-hats, call-and-response gang vocals, rap verses about a rally with the bases '
      + 'loaded, piling on runs and the dugout going crazy, huge chorus "run it up!".',
  },
];

// Ambiente entre canciones: el reproductor elige por la hora local (dia 7-19 h, si no noche)
const CALM = [
  {
    id: 'calm_day',
    title: 'Tarde en el estadio',
    seconds: 22,
    prompt:
      'Seamless loop of a calm empty baseball stadium on a sunny afternoon: soft wind, distant birds, '
      + 'faint lawn sprinklers on the outfield grass, a far-off bat crack from batting practice, '
      + 'very peaceful and relaxing, no music, no voices',
  },
  {
    id: 'calm_night',
    title: 'Noche en el estadio',
    seconds: 22,
    prompt:
      'Seamless loop of a quiet empty baseball stadium at night after the game: crickets, gentle '
      + 'breeze, the soft electric hum of stadium lights, distant city traffic, very peaceful and '
      + 'relaxing, no music, no voices',
  },
];

const ALL = [
  ...TRACKS.map((t) => ({ ...t, kind: 'song' })),
  ...CALM.map((c) => ({ ...c, kind: 'calm' })),
];

function parseArgs(argv) {
  const args = { dryRun: false, force: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--only') args.only = argv[++i];
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return args;
}

async function post(url, apiKey, body) {
  const res = await fetch(`${url}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const detail = (await res.text()).slice(0, 400);
  const err = new Error(`HTTP ${res.status}: ${detail}`);
  err.fatal = [401, 402, 403].includes(res.status) || /quota|credits/i.test(detail);
  throw err;
}

function generate(item, apiKey) {
  if (item.kind === 'calm') {
    return post(SFX_API, apiKey, {
      text: item.prompt,
      duration_seconds: item.seconds,
      prompt_influence: 0.5,
      loop: true,
      model_id: 'eleven_text_to_sound_v2',
    });
  }
  return post(MUSIC_API, apiKey, {
    prompt: `${item.prompt} ${item.style || STYLE}`,
    music_length_ms: LENGTH_MS,
    model_id: 'music_v1',
    force_instrumental: false,
  });
}

const exists = (item) => fs.existsSync(path.join(OUT_DIR, `${item.id}.mp3`));

// tracks.json solo con los mp3 que existen (el reproductor no pide archivos inexistentes)
function writeManifest() {
  const tracks = TRACKS.filter(exists).map(({ id, title, artist, unlockable }) => ({
    id, title, artist, file: `${id}.mp3`, ...(unlockable ? { unlockable: true } : {}),
  }));
  const calm = CALM.filter(exists).map(({ id, title }) => ({ id, title, file: `${id}.mp3` }));
  fs.writeFileSync(path.join(OUT_DIR, 'tracks.json'), `${JSON.stringify({ tracks, calm }, null, 2)}\n`);
  return `${tracks.length} canciones, ${calm.length} ambientes`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pending = ALL
    .filter((t) => !args.only || t.id === args.only)
    .filter((t) => args.force || !exists(t));
  console.log(`${pending.length} audios pendientes -> ${OUT_DIR}`);
  pending.forEach((t) => console.log(`  ${t.id}: "${t.title}"${t.artist ? ` - ${t.artist}` : ` (ambiente ${t.seconds}s)`}`));
  if (args.dryRun) return;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (pending.length) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('Configura ELEVENLABS_API_KEY en backend/.env');
    for (const item of pending) {
      try {
        const audio = await generate(item, apiKey);
        const file = path.join(OUT_DIR, `${item.id}.mp3`);
        fs.writeFileSync(`${file}.tmp`, audio);
        fs.renameSync(`${file}.tmp`, file);
        console.log(`OK ${item.id}.mp3 (${Math.round(audio.length / 1024)} KB)`);
      } catch (err) {
        console.error(`ERROR ${item.id}: ${err.message}`);
        process.exitCode = 1;
        if (err.fatal) {
          console.error('Detenido: sin creditos o sin permisos en la clave.');
          break;
        }
      }
    }
  }
  console.log(`tracks.json: ${writeManifest()}.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
