import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

export default function DerbyView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshTeam } = useTeam();
  const [event, setEvent] = useState(null);
  const [visibleSwings, setVisibleSwings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const simulateStartedRef = useRef(false);

  useEffect(() => {
    simulateStartedRef.current = false;
    load();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDerbyEvent(id);
      // A stale fetch (e.g. React StrictMode's double-mount) can resolve after the user
      // already started/finished a simulation; ignore it so it doesn't clobber that state.
      if (simulateStartedRef.current) return;
      setEvent(data);
      setVisibleSwings(data.status === 'completed' ? (data.swings || []).filter(Boolean) : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulate() {
    setError('');
    setSimulating(true);
    simulateStartedRef.current = true;
    try {
      const result = await api.simulateDerbyEvent(id);
      setEvent(result);
      refreshTeam();
      setVisibleSwings([]);
      setSimulating(false);
      playSwings((result.swings || []).filter(Boolean));
    } catch (err) {
      setError(err.message);
      setSimulating(false);
    }
  }

  function playSwings(allSwings) {
    let idx = 0;
    function step() {
      if (idx >= allSwings.length) return;
      const swing = allSwings[idx];
      idx++;
      if (swing) setVisibleSwings((prev) => [...prev, swing]);
      timerRef.current = setTimeout(step, 220);
    }
    step();
  }

  if (loading) return <p>Cargando derby...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!event) return null;

  const entryById = Object.fromEntries(event.entries.map((e) => [e.id, e]));
  const finishedPlaying = event.status === 'completed' && visibleSwings.length === event.swings.length;

  const homeRunCounts = {};
  for (const entry of event.entries) homeRunCounts[entry.id] = 0;
  for (const s of visibleSwings) {
    if (s?.is_home_run) homeRunCounts[s.entry_id] = (homeRunCounts[s.entry_id] ?? 0) + 1;
  }

  const lastSwing = visibleSwings[visibleSwings.length - 1];
  const currentEntry = lastSwing && !finishedPlaying ? entryById[lastSwing.entry_id] : null;

  const winnerEntry = finishedPlaying ? entryById[event.winner_entry_id] : null;

  const sortedEntries = [...event.entries].sort((a, b) => homeRunCounts[b.id] - homeRunCounts[a.id]);

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/derby')} className="text-sm text-blue-600 hover:underline">
        ← Volver al Derby
      </button>

      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Derby de Jonrones — Dia {event.day}</h2>

        {event.status === 'pending' && (
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="mt-2 bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {simulating ? 'Simulando...' : 'Simular Derby'}
          </button>
        )}

        {currentEntry && (
          <p className="text-sm text-gray-500 mt-2">
            Bateando: <span className="font-semibold">{currentEntry.player.first_name} {currentEntry.player.last_name}</span>{' '}
            (<TeamBadge name={currentEntry.team.name} />)
          </p>
        )}

        {winnerEntry && (
          <div className="mt-4 bg-yellow-50 border border-yellow-300 rounded-lg p-4">
            <p className="text-lg font-bold">
              🏆 Ganador: {winnerEntry.player.first_name} {winnerEntry.player.last_name} (<TeamBadge name={winnerEntry.team.name} />)
            </p>
            <p className="text-green-700 font-semibold">
              Premio: ${Number(winnerEntry.reward_amount).toLocaleString()}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
        <h3 className="font-bold mb-2">Marcador</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="p-2">Equipo</th>
              <th className="p-2">Jugador</th>
              <th className="p-2 text-center">Jonrones</th>
              <th className="p-2 text-right">Recompensa</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => (
              <tr
                key={entry.id}
                className={`border-t ${entry.id === event.winner_entry_id && finishedPlaying ? 'bg-yellow-50 font-semibold' : ''}`}
              >
                <td className="p-2"><TeamBadge name={entry.team.name} /></td>
                <td className="p-2">
                  {entry.player.first_name} {entry.player.last_name}
                  <span className="text-gray-400 text-xs"> (Destreza {entry.player.current_skill})</span>
                </td>
                <td className="p-2 text-center font-bold">{homeRunCounts[entry.id] ?? 0}</td>
                <td className="p-2 text-right text-green-700">${Number(entry.reward_amount).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Swing by swing</h3>
        <div className="max-h-96 overflow-y-auto space-y-1 text-sm">
          {visibleSwings.length === 0 && <p className="text-gray-400">Aun no hay swings.</p>}
          {visibleSwings.map((s, idx) => {
            const entry = s && entryById[s.entry_id];
            if (!s || !entry) return null;
            return (
              <div key={idx} className="border-b py-1">
                <span className="text-gray-400 mr-2">Turno {s.turn_number}</span>
                {entry.player.first_name} {entry.player.last_name} ({entry.team.name}) —{' '}
                {s.is_home_run ? (
                  <span className="text-green-700 font-semibold">¡JONRON!</span>
                ) : (
                  <span className="text-gray-500">out</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
