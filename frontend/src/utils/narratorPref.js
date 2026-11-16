// Preferencia del usuario para silenciar al narrador de la pantalla VS (solo en este navegador).
const KEY = 'bm.narratorMuted';

export function isNarratorMuted() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setNarratorMuted(muted) {
  try {
    if (muted) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento (modo privado, etc.): la preferencia dura solo esta sesion
  }
}
