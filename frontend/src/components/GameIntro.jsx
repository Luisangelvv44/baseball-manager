import { useEffect } from 'react';
import { getTeamLogo } from '../utils/teamLogos.js';

const TOTAL_MS = 7500;

function TeamSide({ team, side }) {
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
      </div>
    </div>
  );
}

export default function GameIntro({ homeTeam, awayTeam, onFinish }) {
  useEffect(() => {
    const t = setTimeout(onFinish, TOTAL_MS);
    return () => clearTimeout(t);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      <TeamSide team={awayTeam} side="left" />
      <TeamSide team={homeTeam} side="right" />

      {/* Costura diagonal (misma pendiente que los paneles) */}
      <div
        className="gi-panel-left pointer-events-none absolute inset-0 z-10"
        style={{
          clipPath: 'polygon(55.5% 0, 56.5% 0, 44.5% 100%, 43.5% 100%)',
          background:
            'linear-gradient(to bottom, rgba(252,211,77,0) 0%, rgba(252,211,77,1) 50%, rgba(252,211,77,0) 100%)',
        }}
      />

      {/* Badge VS */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <span className="gi-content-2 block rounded-full border-2 border-amber-300 bg-black/70 px-5 py-2 text-2xl md:text-4xl font-black italic text-amber-300 shadow-xl">
          VS
        </span>
      </div>
    </div>
  );
}
