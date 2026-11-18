// Genera la banda sonora del juego (menus) con Eleven Music: canciones originales de punk rock /
// rock melodico con sonido de videojuego de beisbol de mediados de los 2000. Las guarda en
// frontend/public/audio/music/<id>.mp3 y escribe tracks.json (titulo/banda ficticios para el
// "Now playing") con las que existen. Lo usa frontend/src/utils/gameMusic.js.
//
// Uso (desde backend/):
//   npm run music:audio -- --dry-run        -> lista lo pendiente, no llama a la API
//   npm run music:audio                     -> genera lo que falte
//   npm run music:audio -- --only track_03 --force   -> regenera una
//
// Reanudable y se detiene al primer error de creditos/permisos. Necesita ELEVENLABS_API_KEY con
// permiso music_generation. Nada de nombres de bandas o canciones reales en los prompts.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../../frontend/public/audio/music');
const MUSIC_API = 'https://api.elevenlabs.io/v1/music';
const OUTPUT_FORMAT = 'mp3_44100_128';
const LENGTH_MS = 120000;

const STYLE =
  'Polished mid-2000s rock production like an original 2005 sports video game soundtrack, '
  + 'loud distorted guitars, punchy live drums, energetic and optimistic. English lyrics.';

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

async function compose(track, apiKey) {
  const res = await fetch(`${MUSIC_API}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      prompt: `${track.prompt} ${STYLE}`,
      music_length_ms: LENGTH_MS,
      model_id: 'music_v1',
      force_instrumental: false,
    }),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const detail = (await res.text()).slice(0, 400);
  const err = new Error(`HTTP ${res.status}: ${detail}`);
  err.fatal = [401, 402, 403].includes(res.status) || /quota|credits/i.test(detail);
  throw err;
}

// tracks.json = solo las canciones con mp3 (el reproductor no pide archivos inexistentes)
function writeManifest() {
  const list = TRACKS
    .filter((t) => fs.existsSync(path.join(OUT_DIR, `${t.id}.mp3`)))
    .map(({ id, title, artist }) => ({ id, title, artist, file: `${id}.mp3` }));
  fs.writeFileSync(path.join(OUT_DIR, 'tracks.json'), `${JSON.stringify(list, null, 2)}\n`);
  return list.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pending = TRACKS
    .filter((t) => !args.only || t.id === args.only)
    .filter((t) => args.force || !fs.existsSync(path.join(OUT_DIR, `${t.id}.mp3`)));
  console.log(`${pending.length} canciones pendientes (${LENGTH_MS / 1000}s) -> ${OUT_DIR}`);
  pending.forEach((t) => console.log(`  ${t.id}: "${t.title}" - ${t.artist}`));
  if (args.dryRun) return;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (pending.length) {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error('Configura ELEVENLABS_API_KEY en backend/.env');
    for (const track of pending) {
      try {
        const audio = await compose(track, apiKey);
        const file = path.join(OUT_DIR, `${track.id}.mp3`);
        fs.writeFileSync(`${file}.tmp`, audio);
        fs.renameSync(`${file}.tmp`, file);
        console.log(`OK ${track.id}.mp3 (${Math.round(audio.length / 1024)} KB)`);
      } catch (err) {
        console.error(`ERROR ${track.id}: ${err.message}`);
        process.exitCode = 1;
        if (err.fatal) {
          console.error('Detenido: sin creditos o sin permisos en la clave.');
          break;
        }
      }
    }
  }
  console.log(`tracks.json: ${writeManifest()} canciones.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
