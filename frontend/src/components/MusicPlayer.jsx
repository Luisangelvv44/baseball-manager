import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  initMusic, setMusicSuppressed, skipTrack, subscribeMusic, toggleMusicMuted,
} from '../utils/gameMusic.js';

const NOW_PLAYING_MS = 5000; // el titulo se muestra al cambiar de cancion y luego se recoge

// Pantallas con audio propio (pantalla VS + ambiente del partido): la musica se calla
const SUPPRESS = [/^\/game\//];

// Reproductor flotante de la banda sonora (abajo a la izquierda), estilo "Now playing" de los
// juegos deportivos de los 2000. No se muestra si no hay canciones.
export default function MusicPlayer() {
  const location = useLocation();
  const [state, setState] = useState({ available: false, track: null, playing: false, muted: false });
  const [showTitle, setShowTitle] = useState(false);
  const hideTimer = useRef(null);
  const suppressed = SUPPRESS.some((re) => re.test(location.pathname));

  useEffect(() => subscribeMusic(setState), []);
  useEffect(() => { initMusic(); }, []);
  useEffect(() => { setMusicSuppressed(suppressed); }, [suppressed]);

  // Titulo desplegado unos segundos cada vez que empieza una cancion
  const trackId = state.track?.id;
  useEffect(() => {
    if (!trackId || state.muted) return undefined;
    setShowTitle(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowTitle(false), NOW_PLAYING_MS);
    return () => clearTimeout(hideTimer.current);
  }, [trackId, state.muted]);

  if (!state.available || suppressed) return null;

  const expanded = showTitle && state.track && !state.muted;

  return (
    <div className="group fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full border border-amber-400/40 bg-slate-900/90 py-1.5 pl-3 pr-1.5 text-white shadow-lg backdrop-blur">
      <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-amber-300 ${state.playing ? 'animate-pulse' : 'opacity-60'}`} fill="currentColor" aria-hidden="true">
        <path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>

      {state.track && !state.muted && (
        <div
          className={`overflow-hidden whitespace-nowrap transition-all duration-500 ${
            expanded ? 'max-w-xs' : 'max-w-0 group-hover:max-w-xs'
          }`}
        >
          <div className="px-2 leading-tight">
            <div className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-amber-300/80">Now playing</div>
            <div className="text-xs font-semibold">
              {state.track.title} <span className="font-normal text-white/60">· {state.track.artist}</span>
            </div>
          </div>
        </div>
      )}

      {!state.muted && (
        <button
          type="button"
          onClick={skipTrack}
          title="Siguiente canción"
          className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M5 4l10 8-10 8V4z" />
            <rect x="16" y="4" width="3" height="16" />
          </svg>
        </button>
      )}
      <button
        type="button"
        onClick={toggleMusicMuted}
        aria-pressed={state.muted}
        title={state.muted ? 'Activar música' : 'Silenciar música'}
        className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" />
          {state.muted ? (
            <>
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          )}
        </svg>
      </button>
    </div>
  );
}
