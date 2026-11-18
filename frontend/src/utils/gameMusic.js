// Banda sonora del juego (menus): canciones y ambientes de frontend/public/audio/music/ listados en
// tracks.json = { tracks, calm } (npm run music:audio en backend/).
//
// Ciclo: suena una cancion; al terminar entra el ambiente tranquilo de estadio vacio (de dia o de
// noche segun la hora local) en bucle, y tras SONG_GAP_MIN..MAX minutos aleatorios toca otra
// cancion. Las canciones van en orden aleatorio sin repetir hasta agotar la lista. En las pantallas
// con audio propio (partido) todo se calla con fundido; el reloj sigue corriendo, y si la cancion
// "cae" durante el partido suena al salir. Una cancion cortada por un partido sigue donde iba.
// Canciones `unlockable`: solo suenan si GET /api/music/unlocks las da por desbloqueadas (logros de
// la franquicia, derivados del historial). Una recien desbloqueada pasa al frente de la cola y se
// anuncia (newUnlocks) una sola vez por navegador (localStorage).
// Singleton para toda la app. Nunca lanza errores; sin archivos no hace nada.

import { api } from '../api.js';
import { isMusicMuted, setMusicMuted } from './narratorPref.js';

const MUSIC_URL = (import.meta.env.VITE_MUSIC_URL ?? `${import.meta.env.BASE_URL}audio/music`).replace(/\/$/, '');
const SONG_VOLUME = 0.35;
const CALM_VOLUME = 0.22;
const FADE_MS = 900;
const CROSSFADE_MS = 2500; // calma -> cancion y cancion -> calma
const FADE_STEP_MS = 50;
const SONG_GAP_MIN_MS = 10 * 60 * 1000;
const SONG_GAP_MAX_MS = 15 * 60 * 1000;
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;
const UNLOCKS_REFRESH_MS = 20 * 1000; // como mucho una consulta cada 20 s (se pide al navegar)
const SEEN_KEY = 'bm.musicUnlocksSeen';

let allTracks = []; // todas las del manifiesto
let tracks = []; // las que pueden sonar (base + desbloqueadas)
let unlockInfo = {}; // trackId -> { hint, goal, progress, unlocked }
let unlockedIds = new Set();
let lastUnlocksFetch = 0;
let unlocksLoading = null;
let newUnlocks = []; // recien desbloqueadas, pendientes de anunciar
let calmList = [];
let queue = [];
let current = null; // cancion en curso (o la ultima, si mode === 'calm')
let calm = null; // ambiente en curso
let mode = 'idle'; // 'song' | 'calm' | 'idle'
let songDue = true; // la primera cancion suena al abrir el juego
let songTimer = null;
let muted = isMusicMuted();
let suppressed = false;
let started = false;
let loading = null;
let waitingGesture = false;
const listeners = new Set();
const fades = new Map(); // <audio> -> intervalo del fundido en curso

const songAudio = typeof Audio !== 'undefined' ? new Audio() : null;
const calmAudio = typeof Audio !== 'undefined' ? new Audio() : null;
if (calmAudio) calmAudio.loop = true;

function emit() {
  const state = getMusicState();
  listeners.forEach((fn) => fn(state));
}

// Lista para el panel de la banda sonora: todas las canciones con su estado de desbloqueo
function songList() {
  return allTracks.map((t) => {
    const info = unlockInfo[t.id];
    return {
      id: t.id,
      title: t.title,
      artist: t.artist,
      unlocked: !t.unlockable || unlockedIds.has(t.id),
      hint: t.unlockable ? info?.hint ?? 'Logro de la franquicia' : null,
      progress: info?.progress ?? 0,
      goal: info?.goal ?? 1,
    };
  });
}

export function getMusicState() {
  return {
    available: tracks.length > 0,
    songs: songList(),
    newUnlocks,
    mode,
    track: mode === 'song' ? current : null,
    calm: mode === 'calm' ? calm : null,
    playing: mode === 'song' ? !songAudio?.paused : mode === 'calm' ? !calmAudio?.paused : false,
    muted,
  };
}

export function subscribeMusic(fn) {
  listeners.add(fn);
  fn(getMusicState());
  return () => listeners.delete(fn);
}

function loadManifest() {
  if (!loading) {
    loading = fetch(`${MUSIC_URL}/tracks.json`)
      .then((res) => {
        const type = res.headers.get('content-type') || '';
        if (!res.ok || type.includes('text/html')) return null;
        return res.json();
      })
      .catch(() => null)
      .then((data) => {
        // formato antiguo: array de canciones
        const list = Array.isArray(data) ? data : data?.tracks;
        allTracks = Array.isArray(list) ? list.filter((t) => t?.file) : [];
        applyPlayable();
        calmList = Array.isArray(data?.calm) ? data.calm.filter((c) => c?.file) : [];
        emit();
      });
  }
  return loading;
}

function applyPlayable() {
  tracks = allTracks.filter((t) => !t.unlockable || unlockedIds.has(t.id));
  queue = queue.filter((t) => tracks.some((x) => x.id === t.id));
}

function readSeen() {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeSeen(ids) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // sin almacenamiento: se volveria a anunciar en la proxima sesion
  }
}

// Pide los desbloqueos al backend (throttled). Las nuevas van al frente de la cola y se anuncian.
export function refreshMusicUnlocks({ force = false } = {}) {
  if (unlocksLoading) return unlocksLoading;
  if (!force && Date.now() - lastUnlocksFetch < UNLOCKS_REFRESH_MS) return Promise.resolve();
  lastUnlocksFetch = Date.now();
  unlocksLoading = api.getMusicUnlocks()
    .then((data) => {
      unlockInfo = Object.fromEntries((data?.songs || []).map((s) => [s.trackId, s]));
      unlockedIds = new Set(data?.unlocked || []);
      return loadManifest();
    })
    .then(() => {
      applyPlayable();
      const seen = readSeen() || new Set();
      const fresh = allTracks.filter((t) => t.unlockable && unlockedIds.has(t.id) && !seen.has(t.id));
      if (fresh.length) {
        newUnlocks = [...newUnlocks, ...fresh.filter((t) => !newUnlocks.some((n) => n.id === t.id))];
        // suenan antes que el resto
        queue = [...fresh, ...queue.filter((t) => !fresh.some((f) => f.id === t.id))];
        writeSeen(new Set([...seen, ...fresh.map((t) => t.id)]));
      }
      emit();
    })
    .catch(() => {
      // sin backend: solo suenan las canciones base
    })
    .finally(() => {
      unlocksLoading = null;
    });
  return unlocksLoading;
}

export function dismissNewUnlocks() {
  newUnlocks = [];
  emit();
}

function nextTrack() {
  if (!queue.length) {
    queue = [...tracks].sort(() => Math.random() - 0.5);
    // que no repita la que acaba de sonar al barajar de nuevo
    if (queue.length > 1 && queue[0].id === current?.id) queue.push(queue.shift());
  }
  return queue.shift();
}

function calmForNow() {
  if (!calmList.length) return null;
  const hour = new Date().getHours();
  const id = hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? 'calm_day' : 'calm_night';
  return calmList.find((c) => c.id === id) || calmList[0];
}

function fadeTo(el, target, ms = FADE_MS, then) {
  if (!el) return then?.();
  clearInterval(fades.get(el));
  const steps = Math.max(1, Math.round(ms / FADE_STEP_MS));
  const delta = (target - el.volume) / steps;
  let n = 0;
  const timer = setInterval(() => {
    n += 1;
    el.volume = Math.min(1, Math.max(0, n >= steps ? target : el.volume + delta));
    if (n >= steps) {
      clearInterval(timer);
      fades.delete(el);
      then?.();
    }
  }, FADE_STEP_MS);
  fades.set(el, timer);
}

function fadeOutAndPause(el, ms = FADE_MS) {
  if (!el || el.paused) return;
  fadeTo(el, 0, ms, () => el.pause());
}

// Autoplay bloqueado: se reintenta con el primer clic o tecla
function waitForGesture() {
  if (waitingGesture) return;
  waitingGesture = true;
  const retry = () => {
    waitingGesture = false;
    window.removeEventListener('pointerdown', retry);
    window.removeEventListener('keydown', retry);
    update();
  };
  window.addEventListener('pointerdown', retry);
  window.addEventListener('keydown', retry);
}

function playEl(el, volume, ms = FADE_MS) {
  if (!el.paused && !fades.has(el) && el.volume === volume) return;
  if (el.paused) {
    el.volume = 0;
    el.play()
      .then(() => { emit(); fadeTo(el, volume, ms); })
      .catch((err) => {
        if (err?.name === 'NotAllowedError') waitForGesture();
      });
  } else {
    fadeTo(el, volume, ms);
  }
}

function scheduleNextSong() {
  clearTimeout(songTimer);
  const gap = SONG_GAP_MIN_MS + Math.random() * (SONG_GAP_MAX_MS - SONG_GAP_MIN_MS);
  songTimer = setTimeout(() => {
    songTimer = null;
    songDue = true;
    update();
  }, gap);
}

function startSong(track) {
  if (!track) return;
  clearTimeout(songTimer);
  songTimer = null;
  songDue = false;
  mode = 'song';
  current = track;
  songAudio.src = `${MUSIC_URL}/${track.file}`;
  emit();
}

function startCalm() {
  mode = 'calm';
  const next = calmForNow();
  if (next && next.id !== calm?.id) {
    calm = next;
    calmAudio.src = `${MUSIC_URL}/${next.file}`;
  } else if (!next) {
    calm = null;
  }
  emit();
}

// Decide que debe sonar segun el estado y aplica fundidos
function update() {
  if (!songAudio || !tracks.length) return;
  if (muted || suppressed) {
    fadeOutAndPause(songAudio);
    fadeOutAndPause(calmAudio);
    emit();
    return;
  }
  if (mode !== 'song' && songDue) {
    fadeOutAndPause(calmAudio, CROSSFADE_MS);
    startSong(nextTrack());
  } else if (mode === 'idle') {
    startCalm();
  }
  if (mode === 'song') {
    playEl(songAudio, SONG_VOLUME);
  } else if (mode === 'calm' && calm) {
    playEl(calmAudio, CALM_VOLUME, CROSSFADE_MS);
  }
  emit();
}

if (songAudio) {
  songAudio.addEventListener('ended', () => {
    startCalm();
    scheduleNextSong();
    update();
  });
  songAudio.addEventListener('error', () => {
    if (mode !== 'song' || !songAudio.getAttribute('src')) return;
    // archivo roto: se salta a la calma (como si hubiera terminado)
    startCalm();
    scheduleNextSong();
    update();
  });
  [songAudio, calmAudio].forEach((el) => {
    el.addEventListener('play', emit);
    el.addEventListener('pause', emit);
  });
}

// Arranca la musica (MusicPlayer al montar). Idempotente.
export function initMusic() {
  if (started) return;
  started = true;
  // los desbloqueos antes de la primera cancion, para que una nueva suene primero
  Promise.all([loadManifest(), refreshMusicUnlocks({ force: true })]).then(update);
}

// Reproduce ya una cancion concreta (panel de la banda sonora / aviso de desbloqueo)
export function playTrackNow(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track || suppressed) return;
  if (muted) {
    muted = false;
    setMusicMuted(false);
  }
  queue = [track, ...queue.filter((t) => t.id !== id)];
  songDue = true;
  if (mode === 'song' && !songAudio.paused) {
    fadeTo(songAudio, 0, FADE_MS, () => {
      mode = 'calm';
      update();
    });
  } else {
    mode = mode === 'song' ? 'calm' : mode;
    update();
  }
}

// true en pantallas con audio propio (partido): todo se calla con fundido y vuelve al salir
export function setMusicSuppressed(on) {
  if (suppressed === on) return;
  suppressed = on;
  if (started) update();
}

export function toggleMusicMuted() {
  muted = !muted;
  setMusicMuted(muted);
  update();
}

// Saltar: otra cancion ya (tambien desde la calma)
export function skipTrack() {
  if (muted || suppressed || !tracks.length) return;
  songDue = true;
  if (mode === 'song') {
    fadeTo(songAudio, 0, FADE_MS, () => {
      mode = 'calm';
      update();
    });
  } else {
    update();
  }
}
