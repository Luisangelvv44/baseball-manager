// Genera los mp3 del narrador con ElevenLabs a partir de narration/intro-scripts.json
// (npm run narration:scripts) y los guarda en frontend/public/audio/narrator/<id>.mp3.
//
// Uso (desde backend/):
//   npm run narration:audio -- --dry-run            -> cuenta clips/caracteres pendientes, no llama a la API
//   npm run narration:audio -- --limit 5            -> solo los 5 primeros pendientes (prueba de voz)
//   npm run narration:audio -- --category closer    -> solo una categoria (prefijo: "hook" = todos los ganchos)
//   npm run narration:audio                         -> todos los pendientes
//   npm run narration:audio -- --exclude matchup_final  -> todo menos las finales (reparto en dos meses)
//   --force regenera aunque el mp3 exista; --concurrency N (por defecto 3)
//
// Reanudable: salta los mp3 que ya existen, asi que si se corta basta con volver a ejecutarlo.
// Config en backend/.env: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID y opcionales ELEVENLABS_MODEL_ID,
// ELEVENLABS_STABILITY, ELEVENLABS_SIMILARITY, ELEVENLABS_STYLE, ELEVENLABS_SPEED, ELEVENLABS_SEED.

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const SCRIPTS_FILE = path.resolve(__dirname, '../../narration/intro-scripts.json');
const OUT_DIR = path.resolve(__dirname, '../../frontend/public/audio/narrator');
const API = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
const MAX_RETRIES = 5;

function parseArgs(argv) {
  const args = { dryRun: false, force: false, limit: Infinity, category: null, concurrency: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--category') args.category = argv[++i];
    else if (a === '--exclude') args.exclude = argv[++i];
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i]));
    else throw new Error(`Argumento desconocido: ${a}`);
  }
  return args;
}

const num = (v, def) => (v === undefined || v === '' ? def : Number(v));

function config() {
  return {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    seed: process.env.ELEVENLABS_SEED ? Number(process.env.ELEVENLABS_SEED) : undefined,
    voiceSettings: {
      stability: num(process.env.ELEVENLABS_STABILITY, 0.55),
      similarity_boost: num(process.env.ELEVENLABS_SIMILARITY, 0.75),
      style: num(process.env.ELEVENLABS_STYLE, 0.2),
      speed: num(process.env.ELEVENLABS_SPEED, 0.9),
      use_speaker_boost: true,
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function synthesize(row, cfg) {
  const body = { text: row.tts_text, model_id: cfg.modelId, voice_settings: cfg.voiceSettings };
  if (cfg.seed !== undefined) body.seed = cfg.seed;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}/${cfg.voiceId}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());

    const detail = (await res.text()).slice(0, 300);
    // 401/402/403/422: clave, creditos o parametros -> no tiene sentido reintentar.
    if ((res.status !== 429 && res.status < 500) || attempt >= MAX_RETRIES) {
      const err = new Error(`HTTP ${res.status}: ${detail}`);
      err.fatal = [401, 402, 403].includes(res.status) || /quota|credits/i.test(detail);
      throw err;
    }
    await sleep(2000 * 2 ** (attempt - 1));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(SCRIPTS_FILE)) throw new Error('Falta narration/intro-scripts.json: ejecuta npm run narration:scripts');
  const rows = JSON.parse(fs.readFileSync(SCRIPTS_FILE, 'utf8'));

  const pending = rows
    .filter((r) => !args.category || r.category.startsWith(args.category))
    .filter((r) => !args.exclude || !r.category.startsWith(args.exclude))
    .filter((r) => args.force || !fs.existsSync(path.join(OUT_DIR, r.file)))
    .slice(0, args.limit);
  const chars = pending.reduce((s, r) => s + r.tts_text.length, 0);
  console.log(`${pending.length} clips pendientes (${chars} caracteres) -> ${OUT_DIR}`);
  if (args.dryRun || pending.length === 0) return;

  const cfg = config();
  if (!cfg.apiKey || !cfg.voiceId) throw new Error('Configura ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID en backend/.env');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let next = 0;
  let done = 0;
  let stop = null;
  const failed = [];

  async function worker() {
    while (!stop && next < pending.length) {
      const row = pending[next++];
      try {
        const audio = await synthesize(row, cfg);
        const tmp = path.join(OUT_DIR, `${row.file}.tmp`);
        fs.writeFileSync(tmp, audio);
        fs.renameSync(tmp, path.join(OUT_DIR, row.file));
        done += 1;
        console.log(`[${done}/${pending.length}] ${row.file}`);
      } catch (err) {
        failed.push({ id: row.id, error: err.message });
        console.error(`ERROR ${row.id}: ${err.message}`);
        if (err.fatal) stop = err;
      }
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, worker));

  console.log(`Listo: ${done} generados, ${failed.length} con error.`);
  if (stop) console.error(`Detenido: ${stop.message}`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = { synthesize, config };
