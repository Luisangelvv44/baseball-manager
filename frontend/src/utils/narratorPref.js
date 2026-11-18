// Preferencias del usuario para silenciar al narrador y al ambiente (publico + musica) de la
// pantalla VS (solo en este navegador).
const KEY = 'bm.narratorMuted';
const AMBIENCE_KEY = 'bm.ambienceMuted';

function readFlag(key) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key, on) {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // sin almacenamiento (modo privado, etc.): la preferencia dura solo esta sesion
  }
}

export const isNarratorMuted = () => readFlag(KEY);
export const setNarratorMuted = (muted) => writeFlag(KEY, muted);
export const isAmbienceMuted = () => readFlag(AMBIENCE_KEY);
export const setAmbienceMuted = (muted) => writeFlag(AMBIENCE_KEY, muted);

// Banda sonora de los menus (utils/gameMusic.js)
const MUSIC_KEY = 'bm.musicMuted';
export const isMusicMuted = () => readFlag(MUSIC_KEY);
export const setMusicMuted = (muted) => writeFlag(MUSIC_KEY, muted);
