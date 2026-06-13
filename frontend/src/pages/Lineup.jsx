import { useEffect, useState } from 'react';
import { api } from '../api';

const SLOT_COUNT = 9;

export default function Lineup() {
  const [roster, setRoster] = useState([]);
  const [pitcher, setPitcher] = useState(null);
  const [batters, setBatters] = useState(Array(SLOT_COUNT).fill(null));
  const [savedMsg, setSavedMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [teamData, lineupData] = await Promise.all([api.getMyTeam(), api.getLineup()]);
        setRoster(teamData.players || []);
        if (lineupData.saved) {
          setPitcher(lineupData.pitcher);
          const slots = Array(SLOT_COUNT).fill(null);
          lineupData.batters.forEach((p, i) => { slots[i] = p; });
          setBatters(slots);
        }
      } catch (e) {
        setSavedMsg('Error cargando el roster.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const assignedIds = new Set([
    pitcher?.id,
    ...batters.filter(Boolean).map((p) => p.id),
  ].filter(Boolean));

  const availablePitchers = roster.filter((p) => p.position === 'P' && !assignedIds.has(p.id));
  const availableBatters = roster.filter((p) => p.position !== 'P' && !assignedIds.has(p.id));

  function selectPitcher(player) {
    if (pitcher?.id === player.id) {
      setPitcher(null);
    } else {
      setPitcher(player);
    }
  }

  function addBatter(player) {
    const firstEmpty = batters.findIndex((s) => s === null);
    if (firstEmpty === -1) return;
    const next = [...batters];
    next[firstEmpty] = player;
    setBatters(next);
  }

  function removeFromSlot(idx) {
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

  const isComplete = pitcher !== null && batters.every((s) => s !== null);

  async function handleSave() {
    if (!isComplete) return;
    setSaving(true);
    setSavedMsg('');
    try {
      await api.saveLineup(pitcher.id, batters.map((p) => p.id));
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
        Configura tu alineacion. Si no guardas una, el juego generara una automaticamente.
      </p>

      <div className="flex gap-6">
        {/* Left: available players */}
        <div className="w-72 shrink-0 space-y-4">
          <div className="bg-white rounded shadow p-3">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">Pitchers disponibles</h2>
            {availablePitchers.length === 0 ? (
              <p className="text-xs text-gray-400">Sin pitchers disponibles</p>
            ) : (
              <ul className="space-y-1">
                {availablePitchers.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => selectPitcher(p)}
                      className="w-full text-left px-2 py-1 rounded text-sm hover:bg-blue-50 flex justify-between"
                    >
                      <span>{p.first_name} {p.last_name}</span>
                      <span className="text-gray-400 text-xs">Habilidad {p.current_skill}</span>
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

        {/* Right: lineup slots */}
        <div className="flex-1 bg-white rounded shadow p-4">
          {/* Pitcher slot */}
          <div className="mb-4">
            <h2 className="font-semibold text-sm text-gray-700 mb-2">Pitcher titular</h2>
            <div
              className={`flex items-center justify-between px-3 py-2 rounded border ${
                pitcher ? 'border-blue-400 bg-blue-50' : 'border-dashed border-gray-300'
              }`}
            >
              {pitcher ? (
                <>
                  <span className="text-sm font-medium">
                    {pitcher.first_name} {pitcher.last_name}
                    <span className="ml-2 text-xs text-gray-500">Habilidad {pitcher.current_skill}</span>
                  </span>
                  <button
                    onClick={() => setPitcher(null)}
                    className="text-xs text-red-400 hover:text-red-600 ml-2"
                  >
                    Quitar
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-400">Selecciona un pitcher de la lista</span>
              )}
            </div>
          </div>

          {/* Batting order */}
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
                        onClick={() => removeFromSlot(idx)}
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

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={!isComplete || saving}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Guardando...' : 'Guardar Lineup'}
            </button>
            {!isComplete && (
              <span className="text-xs text-amber-600">
                Asigna pitcher + 9 bateadores para guardar.
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
