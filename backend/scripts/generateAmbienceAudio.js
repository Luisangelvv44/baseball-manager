// Genera el ambiente sonoro de la pantalla VS con ElevenLabs y lo guarda en
// frontend/public/audio/ambience/<id>.mp3 (lo usa frontend/src/utils/introAmbience.js):
//   crowd_loop / crowd_loop_playoffs   -> publico del estadio en bucle (Sound Effects, loop)
//   intro_music / intro_music_playoffs -> musica de entrada instrumental (Eleven Music; si la API
//                                         de musica no esta disponible, Sound Effects)
//   crowd_cheer                        -> ovacion al cierre del narrador (Sound Effects)
//   crowd_cheer_win / crowd_cheer_loss -> reaccion del publico en el ultimo out si tu equipo gana / pierde
//
// Uso (desde backend/):
//   npm run ambience:audio -- --dry-run     -> lista lo pendiente, no llama a la API
//   npm run ambience:audio                  -> genera lo que falte
//   npm run ambience:audio -- --only crowd_cheer --force   -> regenera uno
//
// Reanudable (salta los mp3 que existen) y se detiene al primer error de creditos/permisos.
// Config: ELEVENLABS_API_KEY en backend/.env (permisos sound_generation y music_generation).

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '../../frontend/public/audio/ambience');
const SFX_API = 'https://api.elevenlabs.io/v1/sound-generation';
const MUSIC_API = 'https://api.elevenlabs.io/v1/music';
const OUTPUT_FORMAT = 'mp3_44100_128';

// Original: nada de canciones, organos o cantos reconocibles de ligas reales.
const CLIPS = [
  {
    id: 'crowd_loop',
    kind: 'sfx',
    seconds: 20,
    loop: true,
    prompt:
      'Seamless loop of a packed baseball stadium crowd ambience before the first pitch: '
      + 'steady murmur of thousands of fans, distant chatter, occasional claps and whistles, '
      + 'open-air stadium reverb, no announcer, no music',
  },
  {
    id: 'crowd_loop_playoffs',
    kind: 'sfx',
    seconds: 20,
    loop: true,
    prompt:
      'Seamless loop of a sold-out playoff baseball stadium: loud excited crowd, rhythmic clapping, '
      + 'cheers and whistles rising and falling, tense electric atmosphere, open-air reverb, '
      + 'no announcer, no music',
  },
  {
    id: 'crowd_cheer',
    kind: 'sfx',
    seconds: 5,
    prompt:
      'Big stadium crowd roar and cheer swelling as the home team takes the field, '
      + 'applause and whistles, then settling down, open-air baseball stadium',
  },
  {
    id: 'crowd_cheer_win',
    kind: 'sfx',
    seconds: 7,
    prompt:
      'Final out of a baseball game won by the home team: huge ecstatic stadium crowd eruption, '
      + 'roaring cheers, whistles, stomping and applause celebrating victory, open-air stadium reverb',
  },
  {
    id: 'crowd_cheer_loss',
    kind: 'sfx',
    seconds: 6,
    prompt:
      'Final out of a baseball game lost by the home team: big disappointed stadium crowd groan, '
      + 'scattered boos and sighs, then a few polite claps as fans settle, open-air stadium reverb',
  },
  {
    id: 'intro_music',
    kind: 'music',
    seconds: 20,
    prompt:
      'Instrumental sports broadcast intro theme for a baseball game, energetic and triumphant, '
      + 'brass fanfare, driving drums and electric bass, 125 bpm, clear build in the first seconds '
      + 'then a steady groove under a commentator, ending with a short hit. No vocals.',
  },
  {
    id: 'intro_music_playoffs',
    kind: 'music',
    seconds: 20,
    prompt:
      'Instrumental epic playoff sports broadcast intro for a baseball championship game, '
      + 'cinematic orchestral brass and big taiko drums, tense and dramatic build, 115 bpm, '
      + 'steady pulse under a commentator, ending with a powerful hit. No vocals.',
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

async function post(url, apiKey, body) {
  const res = await fetch(`${url}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (res.ok) return Buffer.from(await res.arrayBuffer());
  const detail = (await res.text()).slice(0, 300);
  const err = new Error(`HTTP ${res.status}: ${detail}`);
  err.status = res.status;
  err.credits = res.status === 402 || /quota|credits/i.test(detail);
  throw err;
}

function soundEffect(clip, apiKey) {
  return post(SFX_API, apiKey, {
    text: clip.prompt,
    duration_seconds: clip.seconds,
    prompt_influence: 0.5,
    ...(clip.loop ? { loop: true, model_id: 'eleven_text_to_sound_v2' } : {}),
  });
}

async function generate(clip, apiKey) {
  if (clip.kind === 'sfx') return { audio: await soundEffect(clip, apiKey), via: 'sound-generation' };
  try {
    const audio = await post(MUSIC_API, apiKey, {
      prompt: clip.prompt,
      music_length_ms: clip.seconds * 1000,
      model_id: 'music_v1',
      force_instrumental: true,
    });
    return { audio, via: 'music' };
  } catch (err) {
    if (err.credits) throw err;
    // Sin acceso a Eleven Music (plan/permisos): Sound Effects tambien hace musica corta
    console.warn(`  ${clip.id}: Eleven Music no disponible (${err.message.slice(0, 120)}); uso Sound Effects`);
    return { audio: await soundEffect(clip, apiKey), via: 'sound-generation' };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pending = CLIPS
    .filter((c) => !args.only || c.id === args.only)
    .filter((c) => args.force || !fs.existsSync(path.join(OUT_DIR, `${c.id}.mp3`)));
  console.log(`${pending.length} audios pendientes -> ${OUT_DIR}`);
  pending.forEach((c) => console.log(`  ${c.id} (${c.kind}, ${c.seconds}s)`));
  if (args.dryRun || pending.length === 0) return;

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Configura ELEVENLABS_API_KEY en backend/.env');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let done = 0;
  for (const clip of pending) {
    try {
      const { audio, via } = await generate(clip, apiKey);
      const file = path.join(OUT_DIR, `${clip.id}.mp3`);
      fs.writeFileSync(`${file}.tmp`, audio);
      fs.renameSync(`${file}.tmp`, file);
      done += 1;
      console.log(`OK ${clip.id}.mp3 (${Math.round(audio.length / 1024)} KB, ${via})`);
    } catch (err) {
      console.error(`ERROR ${clip.id}: ${err.message}`);
      process.exitCode = 1;
      if (err.credits || err.status === 401 || err.status === 403) {
        console.error('Detenido: sin creditos o sin permisos en la clave.');
        break;
      }
    }
  }
  console.log(`Listo: ${done}/${pending.length} generados.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
