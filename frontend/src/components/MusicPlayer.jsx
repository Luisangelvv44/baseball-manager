import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  dismissNewUnlocks, initMusic, playTrackNow, refreshMusicUnlocks, setMusicSuppressed, skipTrack,
  subscribeMusic, toggleMusicMuted,
} from '../utils/gameMusic.js';

const NOW_PLAYING_MS = 5000; // el titulo se muestra al cambiar de cancion y luego se recoge
const UNLOCK_TOAST_MS = 12000;

// Pantallas con audio propio (pantalla VS + ambiente del partido): la musica se calla
const SUPPRESS = [/^\/game\//];

const INITIAL = {
  available: false, mode: 'idle', track: null, calm: null, playing: false, muted: false, songs: [], newUnlocks: [],
};

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

// Panel con todas las canciones: las desbloqueadas se pueden poner, las bloqueadas muestran el
// logro que las abre y el progreso
function SongList({ state, onClose }) {
  const unlockedCount = state.songs.filter((s) => s.unlocked).length;
  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-400/40 bg-slate-900/95 p-3 text-white shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[0.6rem] font-bold uppercase tracking-[0.25em] text-amber-300/80">Banda sonora</div>
          <div className="text-xs text-white/60">{unlockedCount} de {state.songs.length} canciones</div>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" title="Cerrar">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {state.songs.map((song) => {
          const isCurrent = state.track?.id === song.id;
          if (!song.unlocked) {
            const pct = Math.round((song.progress / song.goal) * 100);
            return (
              <li key={song.id} className="rounded-lg bg-white/5 px-2 py-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-white/40">
                  <LockIcon /> ???
                </div>
                <div className="mt-0.5 text-[0.7rem] text-white/70">{song.hint}</div>
                {song.goal > 1 && (
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-[0.65rem] tabular-nums text-white/50">{song.progress}/{song.goal}</span>
                  </div>
                )}
              </li>
            );
          }
          return (
            <li key={song.id}>
              <button
                type="button"
                onClick={() => playTrackNow(song.id)}
                title="Escuchar ahora"
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10 ${
                  isCurrent ? 'bg-amber-400/15' : ''
                }`}
              >
                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 shrink-0 ${isCurrent ? 'text-amber-300' : 'text-white/40'}`} fill="currentColor" aria-hidden="true">
                  <path d="M7 4l13 8-13 8V4z" />
                </svg>
                <span className="min-w-0 flex-1 truncate text-xs">
                  <span className="font-semibold">{song.title}</span>{' '}
                  <span className="text-white/50">· {song.artist}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Aviso de canciones recien desbloqueadas
function UnlockToast({ unlocks, onListen, onShowAll, onClose }) {
  const single = unlocks.length === 1 ? unlocks[0] : null;
  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-amber-300 bg-gradient-to-br from-amber-500/95 to-orange-600/95 p-3 text-white shadow-2xl">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[0.6rem] font-black uppercase tracking-[0.25em] text-white/90">
            {single ? '¡Nueva canción desbloqueada!' : `¡${unlocks.length} canciones desbloqueadas!`}
          </div>
          {single ? (
            <div className="mt-1 truncate text-sm font-bold">
              {single.title} <span className="font-normal text-white/80">· {single.artist}</span>
            </div>
          ) : (
            <div className="mt-1 text-xs text-white/90">{unlocks.map((u) => u.title).join(' · ')}</div>
          )}
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1 text-white/80 hover:bg-white/20" title="Cerrar">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => onListen(unlocks[0].id)}
          className="rounded-full bg-white px-3 py-1 text-xs font-bold text-orange-700 hover:bg-amber-50"
        >
          Escuchar
        </button>
        {!single && (
          <button type="button" onClick={onShowAll} className="rounded-full border border-white/60 px-3 py-1 text-xs font-semibold hover:bg-white/15">
            Ver canciones
          </button>
        )}
      </div>
    </div>
  );
}

// Reproductor flotante de la banda sonora (abajo a la izquierda), estilo "Now playing" de los
// juegos deportivos de los 2000, con el panel de canciones desbloqueables. No se muestra si no hay
// canciones.
export default function MusicPlayer() {
  const location = useLocation();
  const [state, setState] = useState(INITIAL);
  const [showTitle, setShowTitle] = useState(false);
  const [open, setOpen] = useState(false);
  const hideTimer = useRef(null);
  const suppressed = SUPPRESS.some((re) => re.test(location.pathname));

  useEffect(() => subscribeMusic(setState), []);
  useEffect(() => { initMusic(); }, []);
  useEffect(() => { setMusicSuppressed(suppressed); }, [suppressed]);
  // Los logros cambian al cerrar temporadas, ganar series, etc.: se revisa al navegar
  useEffect(() => { refreshMusicUnlocks(); }, [location.pathname]);

  // Titulo desplegado unos segundos cada vez que empieza una cancion o el ambiente entre canciones
  const nowPlaying = state.track
    ? { key: `song:${state.track.id}`, label: 'Now playing', title: state.track.title, sub: state.track.artist }
    : state.calm
      ? { key: `calm:${state.calm.id}`, label: 'Entre canciones', title: state.calm.title, sub: 'ambiente' }
      : null;
  const trackId = nowPlaying?.key;
  useEffect(() => {
    if (!trackId || state.muted) return undefined;
    setShowTitle(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowTitle(false), NOW_PLAYING_MS);
    return () => clearTimeout(hideTimer.current);
  }, [trackId, state.muted]);

  // El aviso de desbloqueo se cierra solo
  const hasUnlocks = state.newUnlocks.length > 0;
  useEffect(() => {
    if (!hasUnlocks || suppressed) return undefined;
    const t = setTimeout(dismissNewUnlocks, UNLOCK_TOAST_MS);
    return () => clearTimeout(t);
  }, [hasUnlocks, suppressed]);

  if (!state.available || suppressed) return null;

  const expanded = showTitle && nowPlaying && !state.muted;

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open ? (
        <SongList state={state} onClose={() => setOpen(false)} />
      ) : hasUnlocks && (
        <UnlockToast
          unlocks={state.newUnlocks}
          onListen={(id) => { playTrackNow(id); dismissNewUnlocks(); }}
          onShowAll={() => { setOpen(true); dismissNewUnlocks(); }}
          onClose={dismissNewUnlocks}
        />
      )}

      <div className="group flex items-center gap-1 rounded-full border border-amber-400/40 bg-slate-900/90 py-1.5 pl-1.5 pr-1.5 text-white shadow-lg backdrop-blur">
        <button
          type="button"
          onClick={() => { setOpen((v) => !v); dismissNewUnlocks(); }}
          title="Banda sonora"
          aria-expanded={open}
          className="relative rounded-full p-1.5 transition hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 text-amber-300 ${state.playing ? 'animate-pulse' : 'opacity-60'}`} fill="currentColor" aria-hidden="true">
            <path d="M9 18V5l12-2v13" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          {hasUnlocks && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-orange-500 ring-2 ring-slate-900" />}
        </button>

        {nowPlaying && !state.muted && (
          <div
            className={`overflow-hidden whitespace-nowrap transition-all duration-500 ${
              expanded ? 'max-w-xs' : 'max-w-0 group-hover:max-w-xs'
            }`}
          >
            <div className="px-1 leading-tight">
              <div className="text-[0.55rem] font-bold uppercase tracking-[0.25em] text-amber-300/80">{nowPlaying.label}</div>
              <div className="text-xs font-semibold">
                {nowPlaying.title} <span className="font-normal text-white/60">· {nowPlaying.sub}</span>
              </div>
            </div>
          </div>
        )}

        {!state.muted && (
          <button
            type="button"
            onClick={skipTrack}
            title={state.mode === 'song' ? 'Siguiente canción' : 'Poner una canción ya'}
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
    </div>
  );
}
