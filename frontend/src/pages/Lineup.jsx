import { useEffect, useState } from 'react';
import { api } from '../api';

const MAX_PITCHERS = 4;
const SLOT_COUNT = 9;

export default function Lineup() {
  const [roster, setRoster] = useState([]);
  const [pitchers, setPitchers] = useState(Array(MAX_PITCHERS).fill(null));
  const [batters, setBatters] = useState(Array(SLOT_COUNT).fill(null));
  const [nextPitcherIdx, setNextPitcherIdx] = useState(0);
  const [savedMsg, setSavedMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [teamData, lineupData] = await Promise.all([api.getMyTeam(), api.getLineup()]);
        setRoster(teamData.players || []);
        if (lineupData.saved) {
          const slots = Array(MAX_PITCHERS).fill(null);
          lineupData.pitchers.forEach((p, i) => { slots[i] = p; });
          setPitchers(slots);
          const batterSlots = Array(SLOT_COUNT).fill(null);
          lineupData.batters.forEach((p, i) => { batterSlots[i] = p; });
          setBatters(batterSlots);
          setNextPitcherIdx(lineupData.nextPitcherIdx ?? 0);
        }
      } catch {
        setSavedMsg('Error cargando el roster.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const assignedIds = new Set([
    ...pitchers.filter(Boolean).map((p) => p.id),
    ...batters.filter(Boolean).map((p) => p.id),
  ]);

  const activePitcherCount = pitchers.filter(Boolean).length;
  const availablePitchers = roster.filter((p) => p.position === 'P' && !assignedIds.has(p.id));
  const availableBatters = roster.filter((p) => p.position !== 'P' && !assignedIds.has(p.id));

  function addPitcher(player) {
    const firstEmpty = pitchers.findIndex((s) => s === null);
    if (firstEmpty === -1) return;
    const next = [...pitchers];
    next[firstEmpty] = player;
    setPitchers(next);
  }

  function removePitcher(idx) {
    const next = [...pitchers];
    next[idx] = null;
    // Compact: shift remaining pitchers up
    const compacted = next.filter(Boolean);
    while (compacted.length < MAX_PITCHERS) compacted.push(null);
    setPitchers(compacted);
  }

  function movePitcher(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= MAX_PITCHERS || !pitchers[target]) return;
    const next = [...pitchers];
    [next[idx], next[target]] = [next[target], next[idx]];
    setPitchers(next);
  }

  function addBatter(player) {
    const firstEmpty = batters.findIndex((s) => s === null);
    if (firstEmpty === -1) return;
    const next = [...batters];
    next[firstEmpty] = player;
    setBatters(next);
  }

  function removeBatter(idx) {
    const next = [...batters];
    next[idx] = null;
    setBatters(next);
  }

  function moveBatter(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= SLOT_COUNT) return;
    const next = [...batters];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBatters(next);
  }

  const isComplete = activePitcherCount >= 1 && batters.every((s) => s !== null);

  async function handleSave() {
    if (!isComplete) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const pitcherIds = pitchers.filter(Boolean).map((p) => p.id);
      const batterIds = batters.map((p) => p.id);
      await api.saveLineup(pitcherIds, batterIds);
      setSavedMsg('Lineup guardado. Se usara en tus proximos partidos.');
    } catch (e) {
      setSavedMsg(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-gray-500 mt-8 text-center">Cargando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Lineup</h1>
      <p className="text-gray-500 text-sm mb-4">
        Configura tu rotacion de pitchers (1–4) y el orden al bate. Si no guardas uno, el juego generara un lineup automaticamente.
      </p>

      <div className="flex gap-6">
        {/* Left: available players */}
        <div className="w-72 shrink-0 space-y-4">
          <div className="bg-white rounded shadow p-3">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">
              Pitchers disponibles
            </h2>
            {availablePitchers.length === 0 ? (
              <p className="text-xs text-gray-400">
                {activePitcherCount >= MAX_PITCHERS ? 'Rotacion llena (max 4)' : 'Sin pitchers disponibles'}
              </p>
            ) : (
              <ul className="space-y-1">
                {availablePitchers.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addPitcher(p)}
                      disabled={activePitcherCount >= MAX_PITCHERS}
                      className="w-full text-left px-2 py-1 rounded text-sm hover:bg-blue-50 disabled:opacity-40 flex justify-between"
                    >
                      <span>{p.first_name} {p.last_name}</span>
                      <span className="text-gray-400 text-xs">{p.current_skill}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white rounded shadow p-3">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">Bateadores disponibles</h2>
            {availableBatters.length === 0 ? (
              <p className="text-xs text-gray-400">Sin bateadores disponibles</p>
            ) : (
              <ul className="space-y-1">
                {availableBatters.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addBatter(p)}
                      className="w-full text-left px-2 py-1 rounded text-sm hover:bg-green-50 flex justify-between"
                    >
                      <span>
                        <span className="text-xs font-mono text-gray-400 mr-1">{p.position}</span>
                        {p.first_name} {p.last_name}
                      </span>
                      <span className="text-gray-400 text-xs">{p.current_skill}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: lineup config */}
        <div className="flex-1 space-y-4">
          {/* Pitcher rotation */}
          <div className="bg-white rounded shadow p-4">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">
              Rotacion de pitchers
              <span className="ml-2 text-xs font-normal text-gray-400">(minimo 1, maximo 4)</span>
            </h2>
            <div className="space-y-1">
              {pitchers.map((player, idx) => {
                const isNextUp = player && idx === nextPitcherIdx && activePitcherCount > 1;
                return (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 px-3 py-2 rounded border ${
                      player
                        ? isNextUp
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-300 bg-gray-50'
                        : 'border-dashed border-gray-200'
                    }`}
                  >
                    <span className={`text-xs font-bold w-6 ${isNextUp ? 'text-blue-600' : 'text-gray-400'}`}>
                      R{idx + 1}
                    </span>
                    {player ? (
                      <>
                        <span className="text-sm flex-1">
                          {player.first_name} {player.last_name}
                          <span className="ml-2 text-xs text-gray-500">{player.current_skill}</span>
                          {isNextUp && (
                            <span className="ml-2 text-xs text-blue-600 font-medium">siguiente</span>
                          )}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => movePitcher(idx, -1)}
                            disabled={idx === 0 || !pitchers[idx - 1]}
                            className="text-xs px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => movePitcher(idx, 1)}
                            disabled={idx >= MAX_PITCHERS - 1 || !pitchers[idx + 1]}
                            className="text-xs px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                          >
                            ▼
                          </button>
                          <button
                            onClick={() => removePitcher(idx)}
                            className="text-xs text-red-400 hover:text-red-600 ml-1"
                          >
                            Quitar
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="text-sm text-gray-300">
                        {idx === 0 ? 'Selecciona un pitcher de la lista' : 'Opcional'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Batting order */}
          <div className="bg-white rounded shadow p-4">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">Orden al bate</h2>
            <div className="space-y-1">
              {batters.map((player, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-3 py-2 rounded border ${
                    player ? 'border-green-400 bg-green-50' : 'border-dashed border-gray-300'
                  }`}
                >
                  <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                  {player ? (
                    <>
                      <span className="text-sm flex-1">
                        <span className="font-mono text-xs text-gray-400 mr-1">{player.position}</span>
                        {player.first_name} {player.last_name}
                        <span className="ml-2 text-xs text-gray-500">{player.current_skill}</span>
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => moveBatter(idx, -1)}
                          disabled={idx === 0}
                          className="text-xs px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveBatter(idx, 1)}
                          disabled={idx === SLOT_COUNT - 1}
                          className="text-xs px-1 text-gray-400 hover:text-gray-700 disabled:opacity-20"
                        >
                          ▼
                        </button>
                        <button
                          onClick={() => removeBatter(idx)}
                          className="text-xs text-red-400 hover:text-red-600 ml-1"
                        >
                          Quitar
                        </button>
                      </div>
                    </>
                  ) : (
                    <span className="text-sm text-gray-400">Vacio — haz click en un bateador</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={!isComplete || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar Lineup'}
            </button>
            {!isComplete && (
              <span className="text-xs text-amber-600">
                Asigna al menos 1 pitcher y los 9 bateadores para guardar.
              </span>
            )}
            {savedMsg && (
              <span className={`text-xs ${savedMsg.startsWith('Error') ? 'text-red-500' : 'text-green-600'}`}>
                {savedMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
