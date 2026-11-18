// Banda sonora del juego (menus): canciones de frontend/public/audio/music/ listadas en tracks.json
// (npm run music:audio en backend/). Reproduce en orden aleatorio sin repetir hasta agotar la
// lista, con fundidos, y se calla en las pantallas con su propio audio (partido: narrador + ambiente).
// Singleton: un solo <audio> para toda la app. Nunca lanza errores; sin canciones no hace nada.

import { isMusicMuted, setMusicMuted } from './narratorPref.js';

const MUSIC_URL = (import.meta.env.VITE_MUSIC_URL ?? `${import.meta.env.BASE_URL}audio/music`).replace(/\/$/, '');
const VOLUME = 0.35;
const FADE_MS = 900;
const FADE_STEP_MS = 50;

let audio = null;
let tracks = [];
let queue = [];
let current = null;
let muted = isMusicMuted();
let suppressed = false;
let started = false; // ya se intento reproducir (o se espera un gesto del usuario)
let fadeTimer = null;
let loading = null;
const listeners = new Set();

function emit() {
  const state = getMusicState();
  listeners.forEach((fn) => fn(state));
}

export function getMusicState() {
  return {
    available: tracks.length > 0,
    track: current,
    playing: !!audio && !audio.paused,
    muted,
  };
}

export function subscribeMusic(fn) {
  listeners.add(fn);
  fn(getMusicState());
  return () => listeners.delete(fn);
}

function loadTracks() {
  if (!loading) {
    loading = fetch(`${MUSIC_URL}/tracks.json`)
      .then((res) => {
        const type = res.headers.get('content-type') || '';
        if (!res.ok || type.includes('text/html')) return [];
        return res.json();
      })
      .then((list) => (Array.isArray(list) ? list.filter((t) => t?.file) : []))
      .catch(() => [])
      .then((list) => {
        tracks = list;
        emit();
        return list;
      });
  }
  return loading;
}

function nextTrack() {
  if (!queue.length) {
    queue = [...tracks].sort(() => Math.random() - 0.5);
    // que no repita la que acaba de sonar al barajar de nuevo
    if (queue.length > 1 && queue[0].id === current?.id) queue.push(queue.shift());
  }
  return queue.shift();
}

function fadeTo(target, then) {
  clearInterval(fadeTimer);
  if (!audio) return then?.();
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  const delta = (target - audio.volume) / steps;
  let n = 0;
  fadeTimer = setInterval(() => {
    n += 1;
    audio.volume = Math.min(1, Math.max(0, n >= steps ? target : audio.volume + delta));
    if (n >= steps) {
      clearInterval(fadeTimer);
      then?.();
    }
  }, FADE_STEP_MS);
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'auto';
  audio.addEventListener('ended', () => playTrack(nextTrack()));
  audio.addEventListener('error', () => {
    // archivo roto: se salta (con pausa para no entrar en bucle si fallan todos)
    setTimeout(() => { if (shouldPlay()) playTrack(nextTrack()); }, 1500);
  });
  audio.addEventListener('play', emit);
  audio.addEventListener('pause', emit);
  return audio;
}

const shouldPlay = () => !muted && !suppressed && tracks.length > 0;

// Autoplay bloqueado: se reintenta con el primer clic o tecla
let waitingGesture = false;
function waitForGesture() {
  if (waitingGesture) return;
  waitingGesture = true;
  const retry = () => {
    waitingGesture = false;
    window.removeEventListener('pointerdown', retry);
    window.removeEventListener('keydown', retry);
    resume();
  };
  window.addEventListener('pointerdown', retry, { once: true });
  window.addEventListener('keydown', retry, { once: true });
}

function startPlayback() {
  const el = ensureAudio();
  el.volume = 0;
  el.play()
    .then(() => fadeTo(VOLUME))
    .catch((err) => {
      if (err?.name === 'NotAllowedError') waitForGesture();
    });
}

function playTrack(track) {
  if (!track || !shouldPlay()) return;
  current = track;
  ensureAudio().src = `${MUSIC_URL}/${track.file}`;
  emit();
  startPlayback();
}

function resume() {
  if (!shouldPlay()) return;
  if (!current || !audio?.src) return playTrack(nextTrack());
  if (audio.paused) startPlayback();
  else fadeTo(VOLUME);
}

function pauseWithFade() {
  if (!audio || audio.paused) return;
  fadeTo(0, () => { if (!shouldPlay()) audio.pause(); });
}

// Arranca la musica (App al montar). Idempotente.
export function initMusic() {
  if (started) return;
  started = true;
  loadTracks().then(() => resume());
}

// true en pantallas con audio propio (partido): la musica se pausa con fundido y vuelve al salir
export function setMusicSuppressed(on) {
  if (suppressed === on) return;
  suppressed = on;
  if (on) pauseWithFade();
  else if (started) resume();
}

export function toggleMusicMuted() {
  muted = !muted;
  setMusicMuted(muted);
  if (muted) pauseWithFade();
  else resume();
  emit();
}

export function skipTrack() {
  if (!shouldPlay()) return;
  fadeTo(0, () => playTrack(nextTrack()));
}
