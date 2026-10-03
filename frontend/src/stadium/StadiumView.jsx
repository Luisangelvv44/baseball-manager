import { useEffect, useMemo, useRef, useState } from 'react';
import StadiumScene, { hourName } from './StadiumScene.js';

// Estado visual de la escena a partir de la respuesta de GET /api/stadium
export function visualState(data) {
  const lv = (key) => data.facilities.find((f) => f.key === key)?.level ?? 1;
  return {
    field: lv('field'),
    lights: lv('lights'),
    board: lv('board'),
    medical: lv('medical'),
    sections: data.sections.map(({ id, row_pos, col_pos, section_type, upgrade_level, label }) => ({
      id, row_pos, col_pos, section_type, upgrade_level, label,
    })),
    floors: data.floors,
  };
}

const ICONS = { field: '🌱', lights: '💡', board: '📋', medical: '🩺' };
const fmtMoney = (n) => `$${Math.round(n).toLocaleString()}`;
const fmtHour = (h) => {
  const hh = Math.floor(h) % 24;
  const mm = Math.floor((h % 1) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${hourName(h)}`;
};

// `onUpgradeFacility(key)` llama a la API y devuelve los datos frescos del estadio (o lanza error).
export default function StadiumView({ data, onUpgradeFacility, onManageStands }) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const [hour, setHour] = useState(14);
  const [playing, setPlaying] = useState(false);
  const [shadows, setShadows] = useState(true);
  const [busyKey, setBusyKey] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const visual = useMemo(() => visualState(data), [data]);
  const latestVisual = useRef(visual);
  latestVisual.current = visual;
  // mientras corre la animacion de obra, los datos frescos no se aplican directo a la escena
  const upgrading = useRef(false);

  useEffect(() => {
    // redondeo a 0.1h: durante el ciclo dia/noche evita re-renderizar el panel en cada frame
    const scene = new StadiumScene(stageRef.current, visual, {
      onHourChange: (h) => setHour(Math.round(h * 10) / 10),
    });
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
      clearTimeout(toastTimer.current);
    };
    // la escena se crea una sola vez; los cambios de datos entran por setState
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!upgrading.current) sceneRef.current?.setState(visual);
  }, [visual]);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }

  async function handleUpgrade(facility) {
    if (busyKey) return;
    setBusyKey(facility.key);
    upgrading.current = true;
    try {
      const fresh = await onUpgradeFacility(facility.key);
      await sceneRef.current?.playUpgrade(facility.key, visualState(fresh));
      const up = fresh.facilities.find((f) => f.key === facility.key);
      showToast(`${ICONS[facility.key]} ${up.name} · ${up.levelName}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      upgrading.current = false;
      sceneRef.current?.setState(latestVisual.current);
      setBusyKey(null);
    }
  }

  const grandstands = data.sections.filter((s) => s.section_type === 'grandstand');
  const capacity = grandstands.reduce((sum, s) => sum + s.capacity, 0);
  const avgLevel = grandstands.length
    ? grandstands.reduce((sum, s) => sum + s.upgrade_level, 0) / grandstands.length
    : 0;

  return (
    <div className="flex flex-col lg:flex-row bg-white rounded-lg shadow overflow-hidden">
      <div className="relative flex-1 min-w-0 h-[420px] lg:h-[680px] bg-[#151a24]">
        <div ref={stageRef} className="absolute inset-0" />
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          {[
            ['+', 'Acercar', () => sceneRef.current?.zoomBy(1.4)],
            ['−', 'Alejar', () => sceneRef.current?.zoomBy(1 / 1.4)],
            ['⤢', 'Ver todo el estadio', () => sceneRef.current?.fitView()],
          ].map(([label, aria, fn]) => (
            <button
              key={aria}
              onClick={fn}
              aria-label={aria}
              className="w-9 h-9 rounded bg-white/90 hover:bg-white shadow text-lg font-semibold text-gray-700"
            >
              {label}
            </button>
          ))}
        </div>
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="absolute left-1/2 top-3 -translate-x-1/2 bg-white border border-indigo-300 rounded-lg px-4 py-2 text-sm font-semibold shadow max-w-[90%] text-center"
          >
            {toast}
          </div>
        )}
      </div>

      <aside className="w-full lg:w-80 flex-none border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 p-4 space-y-4 lg:max-h-[680px] lg:overflow-y-auto">
        <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm bg-white border rounded-lg p-3">
          <span className="text-gray-500">Presupuesto</span>
          <b className="text-right tabular-nums">{fmtMoney(data.budget)}</b>
          <span className="text-gray-500">Capacidad</span>
          <b className="text-right tabular-nums">{capacity.toLocaleString()}</b>
        </div>

        <section className="space-y-2">
          <h3 className="font-bold text-gray-800">Mejoras</h3>

          <div className="bg-white border rounded-lg p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-semibold">🏟️ Gradas</span>
              <span className="text-xs text-gray-500">
                Nv. prom. {avgLevel.toFixed(1)}/{data.max_grandstand_level}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {grandstands.length} secciones · planta {data.floors}
            </p>
            <button
              onClick={onManageStands}
              className="mt-2 w-full h-8 rounded border border-gray-300 hover:border-indigo-400 text-sm"
            >
              Gestionar gradas
            </button>
          </div>

          {data.facilities.map((f) => {
            const atMax = f.level >= f.max;
            const poor = !atMax && data.budget < f.next_cost;
            const disabled = atMax || poor || !!busyKey;
            const label = busyKey === f.key
              ? 'Construyendo…'
              : atMax ? 'Nivel máximo' : poor ? 'Sin fondos' : `Mejorar · ${fmtMoney(f.next_cost)}`;
            return (
              <div key={f.key} className="bg-white border rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{ICONS[f.key]} {f.name}</span>
                  <span className="text-xs text-gray-500">Nv. {f.level}/{f.max}</span>
                </div>
                <div className="flex gap-1 my-1.5" aria-hidden="true">
                  {Array.from({ length: f.max }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded ${i < f.level ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <div className="text-xs text-gray-600">{f.levelName}</div>
                {f.effect && <div className="text-xs text-green-700">{f.effect}</div>}
                {!atMax && (
                  <div className="text-xs mt-1">
                    Siguiente: {f.nextLevelName}
                    {f.nextEffect && <span className="text-gray-500"> ({f.nextEffect})</span>}
                  </div>
                )}
                <button
                  onClick={() => handleUpgrade(f)}
                  disabled={disabled}
                  className={`mt-2 w-full h-8 rounded text-sm font-semibold ${
                    disabled
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {label}
                </button>
              </div>
            );
          })}
        </section>

        <section className="space-y-2 text-sm">
          <h3 className="font-bold text-gray-800">Hora del día</h3>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="24"
              step="0.1"
              value={hour}
              aria-label="Hora del día"
              onChange={(e) => sceneRef.current?.setHour(Number(e.target.value))}
              className="flex-1 accent-indigo-600"
            />
            <span className="tabular-nums text-xs w-28 text-right">{fmtHour(hour)}</span>
          </div>
          <button
            onClick={() => {
              const next = !playing;
              setPlaying(next);
              sceneRef.current?.setPlaying(next);
            }}
            className="w-full h-8 rounded border border-gray-300 hover:border-indigo-400"
          >
            {playing ? '⏸ Pausar ciclo' : '▶ Ciclo día/noche'}
          </button>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={shadows}
              onChange={(e) => {
                setShadows(e.target.checked);
                sceneRef.current?.setShadows(e.target.checked);
              }}
              className="accent-indigo-600"
            />
            Sombras
          </label>
          <p className="text-xs text-gray-500">
            Arrastra para mover · rueda o pellizco para zoom. De noche, la iluminación define cuánto se ve el campo.
          </p>
        </section>
      </aside>
    </div>
  );
}
