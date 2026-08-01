import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import Pagination from '../components/Pagination.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

const PAGE_SIZE = 10;

export default function Derby() {
  const navigate = useNavigate();
  const { myTeam } = useTeam();
  const [players, setPlayers] = useState([]);
  const [playerId, setPlayerId] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api.getMyTeam().then((data) => {
      const eligible = data.players.filter(
        (p) => p.position !== 'P' && p.level === 'MAJOR' && p.injury_days_remaining === 0
      );
      setPlayers(eligible);
    });
  }, []);

  useEffect(() => {
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function loadEvents() {
    const data = await api.getDerbyEvents({ page, pageSize: PAGE_SIZE });
    setEvents(data.events);
    setTotalPages(data.totalPages);
  }

  async function handleCreate() {
    const reward = Math.round(Number(rewardAmount));
    if (!playerId) {
      setError('Selecciona un jugador');
      return;
    }
    if (!reward || reward <= 0) {
      setError('Ingresa un monto de recompensa valido');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const event = await api.createDerbyEvent(Number(playerId), reward);
      navigate(`/derby/${event.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Derby de Jonrones</h2>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        Cada uno de los 16 equipos envia un jugador de posicion. Entre mas destreza tenga, mas probable es que
        conecte jonron en cada swing. Si tu jugador gana, tu equipo le paga la recompensa que definas abajo;
        los equipos CPU pagan entre 50% y 100% de lo maximo que estarian dispuestos a ofrecer.
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-3">Nuevo Derby</h3>
        {myTeam && (
          <p className="text-xs text-gray-500 mb-3">
            Presupuesto disponible: <span className="font-semibold text-green-700">${Number(myTeam.budget).toLocaleString()}</span>
          </p>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-0.5">Tu jugador</label>
            <select
              value={playerId}
              onChange={(e) => setPlayerId(e.target.value)}
              className="border rounded px-2 py-1 w-full text-sm"
            >
              <option value="">Selecciona un jugador</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({p.position} · Destreza {p.current_skill})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Recompensa si gana</label>
            <input
              type="number"
              min={1}
              step={10000}
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
              placeholder="$"
              className="border rounded px-2 py-1 w-40 text-sm"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear Derby'}
          </button>
        </div>
        {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        {players.length === 0 && (
          <p className="text-gray-400 text-xs mt-2">No tienes jugadores de posicion elegibles (Mayores, sin lesion).</p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Eventos anteriores</h3>
        {events.length === 0 ? (
          <p className="text-gray-400 text-sm">Aun no se ha jugado ningun derby.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-2">Dia</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Ganador</th>
                <th className="p-2 text-right">Premio</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => {
                const winner = ev.entries.find((e) => e.id === ev.winner_entry_id);
                return (
                  <tr key={ev.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/derby/${ev.id}`)}>
                    <td className="p-2">{ev.day}</td>
                    <td className="p-2">{ev.status === 'completed' ? 'Completado' : 'Pendiente'}</td>
                    <td className="p-2">
                      {winner ? (
                        <span className="inline-flex items-center gap-1.5">
                          {winner.player.first_name} {winner.player.last_name} <TeamBadge name={winner.team.name} />
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">—</span>
                      )}
                    </td>
                    <td className="p-2 text-right font-semibold text-green-700">
                      {winner ? `$${Number(winner.reward_amount).toLocaleString()}` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
