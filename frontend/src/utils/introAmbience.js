// Ambiente sonoro del partido: arranca con la pantalla VS (publico del estadio en bucle + musica de
// entrada que baja (ducking) mientras habla el narrador + ovacion al cierre). Al terminar la intro
// la musica se apaga y el publico sigue hasta que termina la simulacion (stop()). Todo con Web Audio para poder hacer
// fundidos. Los mp3 viven en frontend/public/audio/ambience/ (ver README.md alli); si alguno falta
// esa capa simplemente no suena. Nunca lanza errores.

const AMBIENCE_URL = (import.meta.env.VITE_AMBIENCE_URL ?? `${import.meta.env.BASE_URL}audio/ambience`)
  .replace(/\/$/, '');

// Volumenes (0..1) y tiempos de fundido en segundos
const CROWD_VOLUME = 0.3;
const MUSIC_VOLUME = 0.7;
const MUSIC_DUCKED_VOLUME = 0.15; // musica mientras habla el narrador
const CHEER_VOLUME = 0.6;
const FADE_IN_S = 1.2;
const DUCK_S = 0.4;
const FADE_OUT_S = 0.8;

const bufferCache = new Map(); // url -> Promise<ArrayBuffer|null>

function fetchBytes(name) {
  const url = `${AMBIENCE_URL}/${name}.mp3`;
  if (!bufferCache.has(url)) {
    bufferCache.set(
      url,
      fetch(url)
        .then((res) => {
          const type = res.headers.get('content-type') || '';
          // Vite devuelve index.html (200) para rutas inexistentes: no es audio
          if (!res.ok || type.includes('text/html')) return null;
          return res.arrayBuffer();
        })
        .catch(() => null),
    );
  }
  return bufferCache.get(url);
}

async function decode(ctx, names) {
  // Primer archivo disponible de la lista (variante de playoffs -> normal)
  for (const name of names) {
    const bytes = await fetchBytes(name);
    if (!bytes) continue;
    try {
      // decodeAudioData consume el buffer: se le pasa una copia para reutilizar la cache
      return await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      // archivo corrupto: probar el siguiente
    }
  }
  return null;
}

function rampTo(param, value, ctx, seconds) {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}

const NOOP = { duck() {}, cheer() {}, endIntro() {}, finale() {}, stop() {} };

// Arranca el ambiente. Devuelve un control { duck(on), cheer(), endIntro(), finale(), stop() } utilizable al instante
// aunque los audios sigan cargando.
export function startAmbience({ playoff = false } = {}) {
  const AudioCtx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtx) return NOOP;

  let ctx;
  try {
    ctx = new AudioCtx();
  } catch {
    return NOOP;
  }

  let stopped = false;
  let ducked = false;
  let cheerPending = false;
  let cheerBuffer = null;
  const finaleBuffers = { win: null, loss: null };
  let introOver = false;
  let finaleStarted = false;
  const sources = [];

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const crowdGain = ctx.createGain();
  const musicGain = ctx.createGain();
  crowdGain.gain.value = 0;
  musicGain.gain.value = 0;
  crowdGain.connect(master);
  musicGain.connect(master);

  const play = (buffer, gainNode, { loop = false } = {}) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop;
    src.connect(gainNode);
    src.start();
    sources.push(src);
    return src;
  };

  const playCheer = (buffer = cheerBuffer) => {
    if (!buffer || stopped) return;
    const g = ctx.createGain();
    g.gain.value = CHEER_VOLUME;
    g.connect(master);
    play(buffer, g);
  };

  const suffix = playoff ? ['_playoffs', ''] : [''];
  const names = (base) => suffix.map((s) => `${base}${s}`);

  // Los navegadores pueden crear el contexto suspendido (autoplay); si no se reanuda, intro muda
  ctx.resume?.().catch(() => {});

  Promise.all([
    decode(ctx, names('crowd_loop')),
    decode(ctx, names('intro_music')),
    decode(ctx, names('crowd_cheer')),
  ]).then(([crowd, music, cheer]) => {
    if (stopped) return;
    cheerBuffer = cheer;
    if (crowd) {
      play(crowd, crowdGain, { loop: true });
      rampTo(crowdGain.gain, CROWD_VOLUME, ctx, FADE_IN_S);
    }
    if (music && !introOver) {
      play(music, musicGain);
      rampTo(musicGain.gain, ducked ? MUSIC_DUCKED_VOLUME : MUSIC_VOLUME, ctx, FADE_IN_S);
    }
    if (cheerPending) playCheer();
  });
  // Reacciones del ultimo out: se cargan aparte, sin retrasar la intro
  decode(ctx, ['crowd_cheer_win']).then((b) => { finaleBuffers.win = b; });
  decode(ctx, ['crowd_cheer_loss']).then((b) => { finaleBuffers.loss = b; });

  return {
    // on = el narrador esta hablando: la musica baja
    duck(on) {
      if (stopped || ducked === on) return;
      ducked = on;
      rampTo(musicGain.gain, on ? MUSIC_DUCKED_VOLUME : MUSIC_VOLUME, ctx, DUCK_S);
    },
    // Ovacion del publico (una vez)
    cheer() {
      if (stopped || cheerPending) return;
      cheerPending = true;
      playCheer();
    },
    // Fin de la pantalla VS: la musica se apaga con fundido, el publico sigue
    endIntro() {
      if (stopped || introOver) return;
      introOver = true;
      ducked = false;
      rampTo(musicGain.gain, 0, ctx, FADE_OUT_S);
    },
    // Ultimo out: reaccion del publico segun el resultado de tu equipo ('win' | 'loss' | null =
    // no juega: ovacion normal) y, cuando se apaga, fundido de salida de todo
    finale(outcome = null) {
      if (stopped || finaleStarted) return;
      finaleStarted = true;
      const buffer = (outcome && finaleBuffers[outcome]) || cheerBuffer;
      if (!buffer) {
        this.stop();
        return;
      }
      playCheer(buffer);
      const fadeAtMs = Math.max(0, (buffer.duration - FADE_OUT_S) * 1000);
      setTimeout(() => this.stop(), fadeAtMs);
    },
    // Fin del partido (o salir de la pagina): fundido de salida y cierre del contexto
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        rampTo(master.gain, 0, ctx, FADE_OUT_S);
      } catch {
        // contexto ya cerrado
      }
      setTimeout(() => {
        sources.forEach((src) => {
          try { src.stop(); } catch { /* ya parado */ }
        });
        ctx.close?.().catch(() => {});
      }, FADE_OUT_S * 1000 + 50);
    },
  };
}
