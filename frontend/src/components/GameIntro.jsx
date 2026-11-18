import { useEffect, useRef, useState } from 'react';
import { getTeamLogo } from '../utils/teamLogos.js';
import { isNarratorMuted, setNarratorMuted, isAmbienceMuted, setAmbienceMuted } from '../utils/narratorPref.js';
import BroadcastLogo from './BroadcastLogo.jsx';

const TOTAL_MS = 7500; // duracion minima de la intro
const AUDIO_WAIT_MS = 4000; // si la narracion no llega antes, la intro sigue muda
const AUDIO_TAIL_MS = 600; // respiro tras la ultima palabra del narrador
const CLIP_GAP_MS = 150; // silencio entre clips del narrador pregrabado
const MAX_MS = 22000; // tope aunque el audio sea largo (enfrentamiento + gancho + cierre ~ 15 s)
const SILENT_CHEER_MS = TOTAL_MS - 2500; // sin narrador, la ovacion suena antes del final

function TeamBroadcasts({ companies }) {
  if (!companies?.length) return null;
  // TV primero, radio despues
  const sorted = [...companies].sort((a, b) => b.type.localeCompare(a.type));

  return (
    <div className="gi-content-2 mt-4 flex flex-col items-center">
      <span className="text-[0.6rem] md:text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-white/40">
        Transmite
      </span>
      <div className="mt-2 flex items-start justify-center gap-4">
        {sorted.map((company) => (
          <div key={company.id} className="flex w-20 md:w-28 flex-col items-center">
            <BroadcastLogo name={company.name} size="lg" />
            <span className="mt-1 text-[0.65rem] md:text-xs font-semibold leading-tight text-white/80">
              {company.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamSide({ team, side, broadcasts }) {
  const logo = getTeamLogo(team?.name);
  const isLeft = side === 'left';

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center overflow-hidden ${
        isLeft
          ? 'gi-panel-left bg-gradient-to-br from-slate-900 to-slate-700'
          : 'gi-panel-right bg-gradient-to-bl from-zinc-900 to-black'
      }`}
      style={{
        clipPath: isLeft
          ? 'polygon(0 0, 56% 0, 44% 100%, 0 100%)'
          : 'polygon(56% 0, 100% 0, 100% 100%, 44% 100%)',
      }}
    >
      {/* Marca de agua */}
      {logo && (
        <img
          src={logo}
          alt=""
          className="pointer-events-none absolute w-[70vh] h-[70vh] max-w-none opacity-[0.06] blur-[1px]"
          style={{ [isLeft ? 'left' : 'right']: '-12vh' }}
        />
      )}

      {/* Contenido */}
      <div
        className={`gi-content relative z-10 flex flex-col items-center text-center px-6 ${
          isLeft ? 'mr-[48vw]' : 'ml-[48vw]'
        }`}
      >
        <span className="mb-2 text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
          {isLeft ? 'Visitante' : 'Local'}
        </span>
        {logo && (
          <img
            src={logo}
            alt={team?.name}
            className="w-40 h-40 md:w-56 md:h-56 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
          />
        )}
        <h2 className="mt-4 text-3xl md:text-5xl font-black uppercase tracking-tight text-white leading-none">
          {team?.name}
        </h2>
        <div className="gi-content-2 mt-4 flex flex-col items-center">
          <span className="text-[0.6rem] md:text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-white/40">
            Temporada
          </span>
          <span className="mt-1 font-mono text-xl md:text-3xl font-bold text-white tabular-nums">
            {team?.wins ?? 0}-{team?.losses ?? 0}
          </span>
        </div>
        <TeamBroadcasts companies={broadcasts} />
      </div>
    </div>
  );
}

// narration: Promise<objectURL[]|null> con los mp3 del narrador en orden (opcional): clips
// pregrabados o un unico audio generado. La intro dura TOTAL_MS o lo que tarde el narrador en
// terminar (con tope MAX_MS).
// ambience: control de utils/introAmbience.js creado por GameView (opcional). La intro lo usa para
// el ducking y la ovacion; GameView apaga la musica al terminar y el publico sigue en el partido.
export default function GameIntro({ homeTeam, awayTeam, broadcasts, narration, ambience = null, onFinish }) {
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const [muted, setMuted] = useState(isNarratorMuted);
  const [ambienceMuted, setAmbienceMutedState] = useState(isAmbienceMuted);
  const stopNarrationRef = useRef(null);

  // Silenciar el ambiente lo corta con fundido; reactivarlo aplica desde el proximo partido.
  function toggleAmbience() {
    const next = !ambienceMuted;
    setAmbienceMutedState(next);
    setAmbienceMuted(next);
    if (next) ambience?.stop();
  }

  // Silenciar corta la narracion en curso (la intro termina al cumplir su duracion minima);
  // reactivar aplica desde el proximo partido.
  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setNarratorMuted(next);
    if (next) stopNarrationRef.current?.();
  }

  useEffect(() => {
    let cancelled = false;
    let finished = false;
    let minDone = false;
    let audioDone = !narration;
    let audio = null;
    const timers = [];

    const finish = () => {
      if (finished || cancelled) return;
      finished = true;
      onFinishRef.current?.();
    };
    const maybeFinish = () => {
      if (minDone && audioDone) finish();
    };
    const endAudio = (delay = 0) => {
      if (audioDone) return;
      audioDone = true;
      // el narrador termino: sube la musica y el publico ovaciona
      ambience?.duck(false);
      ambience?.cheer();
      timers.push(setTimeout(maybeFinish, delay));
    };

    if (ambience && !narration) timers.push(setTimeout(() => ambience.cheer(), SILENT_CHEER_MS));

    stopNarrationRef.current = () => {
      if (audio) audio.pause();
      endAudio();
    };

    timers.push(setTimeout(() => { minDone = true; maybeFinish(); }, TOTAL_MS));
    timers.push(setTimeout(finish, MAX_MS));

    if (narration) {
      timers.push(setTimeout(() => { if (!audio) endAudio(); }, AUDIO_WAIT_MS));
      narration.then((urls) => {
        if (cancelled || audioDone || !urls?.length) return endAudio();
        // Un solo <audio> que va cambiando de clip; un clip que falla se salta.
        audio = new Audio();
        let index = -1;
        // `from` = clip que termino o fallo; evita avanzar dos veces cuando un fallo dispara
        // a la vez el evento 'error' y el rechazo de play().
        const playNext = (from) => {
          if (cancelled || audioDone || from !== index) return;
          index += 1;
          if (index >= urls.length) return endAudio(AUDIO_TAIL_MS);
          const current = index;
          audio.src = urls[current];
          ambience?.duck(true);
          audio.play().catch((err) => {
            // autoplay bloqueado: intro muda; un clip roto: se salta
            if (err?.name === 'NotAllowedError') endAudio();
            else playNext(current);
          });
        };
        audio.addEventListener('ended', () => {
          const current = index;
          timers.push(setTimeout(() => playNext(current), CLIP_GAP_MS));
        });
        audio.addEventListener('error', () => playNext(index));
        playNext(-1);
      });
    }

    return () => {
      cancelled = true;
      stopNarrationRef.current = null;
      timers.forEach(clearTimeout);
      // la musica la apaga GameView en onFinish (endIntro): aqui no, porque StrictMode desmonta y
      // vuelve a montar el efecto en desarrollo
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
    };
  }, [narration, ambience]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      <TeamSide team={awayTeam} side="left" broadcasts={broadcasts?.away} />
      <TeamSide team={homeTeam} side="right" broadcasts={broadcasts?.home} />

      {/* Costura diagonal (misma pendiente que los paneles) */}
      <div
        className="gi-panel-left pointer-events-none absolute inset-0 z-10"
        style={{
          clipPath: 'polygon(55.5% 0, 56.5% 0, 44.5% 100%, 43.5% 100%)',
          background:
            'linear-gradient(to bottom, rgba(252,211,77,0) 0%, rgba(252,211,77,1) 50%, rgba(252,211,77,0) 100%)',
        }}
      />

      {/* Silenciar narrador / ambiente */}
      <div className="absolute right-4 top-4 z-30 flex gap-2">
      <button
        type="button"
        onClick={toggleMute}
        aria-pressed={muted}
        title={muted ? 'Activar narrador' : 'Silenciar narrador'}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/80 transition hover:bg-black/70 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" />
          {muted ? (
            <>
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          ) : (
            <>
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M19 5a10 10 0 0 1 0 14" />
            </>
          )}
        </svg>
        <span className="hidden sm:inline">{muted ? 'Narrador apagado' : 'Narrador'}</span>
      </button>
      <button
        type="button"
        onClick={toggleAmbience}
        aria-pressed={ambienceMuted}
        title={ambienceMuted ? 'Activar público y música' : 'Silenciar público y música'}
        className="flex items-center gap-2 rounded-full border border-white/20 bg-black/50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-white/80 transition hover:bg-black/70 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" fill="currentColor" />
          <circle cx="18" cy="16" r="3" fill="currentColor" />
          {ambienceMuted && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
        <span className="hidden sm:inline">{ambienceMuted ? 'Ambiente apagado' : 'Ambiente'}</span>
      </button>
      </div>

      {/* Badge VS */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <span className="gi-content-2 block rounded-full border-2 border-amber-300 bg-black/70 px-5 py-2 text-2xl md:text-4xl font-black italic text-amber-300 shadow-xl">
          VS
        </span>
      </div>
    </div>
  );
}
