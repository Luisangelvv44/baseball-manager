import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getTeamLogo } from '../utils/teamLogos.js';
import MapScene from './MapScene.js';
import { distanceKm, layoutCities } from './geometry.js';

// Overlay del dia de partido, antes de la intro (GameIntro): si el partido es en la ciudad donde ya
// esta el equipo, "Play Ball"; si no, vuelo desde ahi hasta la ciudad del partido.
export default function TravelOverlay({ gameId, onFinish }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const [trip, setTrip] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const scene = new MapScene(stageRef.current);
    sceneRef.current = scene;
    let cancelled = false;

    (async () => {
      try {
        const data = await api.getMap(gameId);
        if (cancelled) return;
        const game = data.nextGame;
        const byId = new Map(data.teams.map((t) => [t.id, t]));
        const from = byId.get(data.currentCityTeamId);
        const to = game && byId.get(game.home_team_id);
        if (!from || !to) {
          onFinishRef.current();
          return;
        }
        const positions = layoutCities(data.teams);
        scene.setData({ ...data, positions, nextGame: null });
        const rivalId = game.home_team_id === data.userTeamId ? game.away_team_id : game.home_team_id;
        const flight = from.id !== to.id;
        setTrip({
          flight,
          from,
          to,
          rival: byId.get(rivalId),
          isHome: game.home_team_id === data.userTeamId,
          day: game.day_number,
          isPlayoff: game.is_playoff,
          km: distanceKm(positions.get(from.id), positions.get(to.id)),
        });
        await (flight ? scene.playFlight(from.id, to.id) : scene.playPlayBall(to.id));
        if (!cancelled) setDone(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) onFinishRef.current();
      }
    })();

    return () => {
      cancelled = true;
      scene.destroy();
      sceneRef.current = null;
    };
  }, [gameId]);

  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Escape') return;
      e.preventDefault();
      if (done) onFinishRef.current();
      else sceneRef.current?.skip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done]);

  let title = '';
  let subtitle = '';
  if (trip) {
    if (trip.flight) {
      title = `✈️ Viaje a ${trip.to.city}`;
      subtitle = `${trip.from.city} → ${trip.to.city} · ${trip.km.toLocaleString()} km`;
    } else if (trip.isHome) {
      title = `🏟️ Partido en casa · ${trip.to.city}`;
      subtitle = 'El equipo juega hoy en su ciudad';
    } else {
      title = `📍 Seguimos en ${trip.to.city}`;
      subtitle = 'Sin viaje: el partido es en la misma ciudad';
    }
  }
  const rivalLogo = getTeamLogo(trip?.rival?.name);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none bg-[#1d4e73]">
      <div ref={stageRef} className="absolute inset-0" />

      {trip && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-4">
          <div className="rounded-xl bg-slate-900/80 px-6 py-3 text-center text-white shadow-xl backdrop-blur">
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/50">
              Día {trip.day}{trip.isPlayoff ? ' · Playoffs' : ''}
            </div>
            <div className="mt-1 text-xl md:text-2xl font-black">{title}</div>
            <div className="text-sm text-white/70">{subtitle}</div>
            {trip.rival && (
              <div className="mt-2 flex items-center justify-center gap-2 text-sm text-amber-300 font-semibold">
                {rivalLogo && <img src={rivalLogo} alt="" className="w-6 h-6" />}
                {trip.isHome ? 'vs' : '@'} {trip.rival.name}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex justify-center gap-3 p-6">
        {done ? (
          <button
            onClick={() => onFinishRef.current()}
            autoFocus
            className="rounded-full bg-amber-400 hover:bg-amber-300 px-8 py-3 text-lg font-black text-slate-900 shadow-xl"
          >
            Ir al partido →
          </button>
        ) : (
          <button
            onClick={() => sceneRef.current?.skip()}
            className="rounded-full bg-white/15 hover:bg-white/25 px-5 py-2 text-sm font-semibold text-white"
          >
            Saltar ⏭
          </button>
        )}
      </div>
    </div>
  );
}
