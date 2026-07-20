import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';

const USER_TEAM_ID = 1;

export default function Draft() {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');

  async function load() {
    try {
      const d = await api.getDraft();
      setDraft(d);
    } catch {
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdvance() {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.advanceDraftPick();
      if (res.draftComplete) {
        setMessage('El draft ha terminado.');
      } else if (res.isUserTurn) {
        setMessage('Es tu turno de elegir.');
      }
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(prospectId) {
    if (!draft?.is_user_turn) return;
    setBusy(true);
    setMessage('');
    try {
      const res = await api.draftPick(prospectId);
      setMessage(
        `Drafteaste a ${res.player.first_name} ${res.player.last_name}! ${res.draftComplete ? 'El draft ha terminado.' : ''}`
      );
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-gray-500">Cargando...</p>;

  if (!draft) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Draft Anual</h2>
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No hay draft activo. El draft se activa automáticamente al terminar los playoffs de cada temporada.
        </div>
      </div>
    );
  }

  const pickOrder = draft.pick_order ?? [];
  const prospects = draft.prospects ?? [];
  const available = prospects.filter((p) => !p.picked_by_team_id);
  const picked = prospects.filter((p) => p.picked_by_team_id);

  const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const filteredAvailable = filter === 'all' ? available : available.filter((p) => p.position === filter);

  const currentTeam = draft.status === 'active' && draft.current_pick <= pickOrder.length
    ? pickOrder[draft.current_pick - 1]
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Draft Anual</h2>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${
          draft.status === 'completed' ? 'bg-gray-100 text-gray-600' : 'bg-green-100 text-green-700'
        }`}>
          {draft.status === 'completed' ? 'Completado' : 'En curso'}
        </span>
      </div>

      {draft.status === 'active' && (
        <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Pick #{draft.current_pick} de {pickOrder.length}</p>
            {currentTeam && (
              <p className="font-semibold">
                Turno de:{' '}
                <span className={currentTeam.id === USER_TEAM_ID ? 'text-blue-600' : 'text-gray-800'}>
                  {currentTeam.id === USER_TEAM_ID ? 'Tu equipo' : <TeamBadge name={currentTeam.name} />}
                </span>
              </p>
            )}
          </div>
          {!draft.is_user_turn && (
            <button
              onClick={handleAdvance}
              disabled={busy}
              className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Avanzando...' : 'Avanzar pick CPU'}
            </button>
          )}
          {draft.is_user_turn && (
            <div className="text-sm text-blue-700 font-medium bg-blue-50 px-3 py-2 rounded">
              Es tu turno — elige un prospecto abajo
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">{message}</div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Available prospects */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Prospectos disponibles ({available.length})</h3>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option value="all">Todas las posiciones</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            {filteredAvailable.length === 0 ? (
              <p className="p-4 text-gray-500 text-sm">No hay prospectos disponibles en esta posición.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-left">
                  <tr>
                    <th className="p-2">Nombre</th>
                    <th className="p-2">Pos</th>
                    <th className="p-2">Edad</th>
                    <th className="p-2">Destreza</th>
                    <th className="p-2">Potencial</th>
                    {draft.is_user_turn && <th className="p-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredAvailable.map((p) => (
                    <tr key={p.id} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">{p.name}</td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{p.position}</span>
                      </td>
                      <td className="p-2">{p.age}</td>
                      <td className="p-2">
                        <span className={`font-semibold ${p.current_skill >= 30 ? 'text-green-600' : 'text-gray-700'}`}>
                          {p.current_skill}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`font-semibold ${p.potential_coefficient >= 80 ? 'text-purple-600' : p.potential_coefficient >= 65 ? 'text-blue-600' : 'text-gray-600'}`}>
                          {p.potential_coefficient}
                        </span>
                      </td>
                      {draft.is_user_turn && (
                        <td className="p-2">
                          <button
                            onClick={() => handlePick(p.id)}
                            disabled={busy}
                            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Elegir
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Pick order & history */}
        <div className="space-y-3">
          <h3 className="font-bold text-gray-800">Orden del Draft</h3>
          <div className="bg-white rounded-lg shadow divide-y max-h-96 overflow-y-auto">
            {pickOrder.map((team, i) => {
              const pickNum = i + 1;
              const isCurrent = pickNum === draft.current_pick && draft.status === 'active';
              const isPast = pickNum < draft.current_pick || draft.status === 'completed';
              const pickedProspect = picked.find((p) => p.pick_number === pickNum);
              return (
                <div key={pickNum} className={`px-3 py-2 text-sm flex items-start justify-between ${isCurrent ? 'bg-blue-50' : ''}`}>
                  <div>
                    <span className="text-gray-400 mr-2">#{pickNum}</span>
                    <span className={team.id === USER_TEAM_ID ? 'font-bold text-blue-700' : 'text-gray-800'}>
                      {team.id === USER_TEAM_ID ? 'Tu equipo' : <TeamBadge name={team.name} />}
                    </span>
                    {pickedProspect && (
                      <p className="text-xs text-gray-500 mt-0.5 ml-5">{pickedProspect.name} ({pickedProspect.position})</p>
                    )}
                  </div>
                  {isCurrent && <span className="text-xs text-blue-600 font-medium">Ahora</span>}
                  {isPast && !isCurrent && <span className="text-xs text-gray-300">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
