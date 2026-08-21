import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Pagination from '../components/Pagination.jsx';

const PAGE_SIZE = 25;

function formatDate(dateStr) {
  if (!dateStr) return 'Nunca calculado';
  return new Date(dateStr).toLocaleString();
}

export default function AllTimePlayers() {
  const [players, setPlayers] = useState([]);
  const [lastCalculated, setLastCalculated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);

  function loadStats() {
    setLoading(true);
    return api
      .getAllTimeStats()
      .then((data) => {
        setPlayers(data.players);
        setLastCalculated(data.last_calculated);
        setPage(1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function handleRecalculate() {
    setCalculating(true);
    setError(null);
    try {
      await api.recalculateAllTimeStats();
      await loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setCalculating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(players.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagePlayers = players.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">All-Time Players</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">Última actualización: {formatDate(lastCalculated)}</span>
          <button
            onClick={handleRecalculate}
            disabled={calculating}
            className="px-3 py-1.5 text-sm font-semibold rounded bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {calculating ? 'Calculando...' : 'Calcular estadísticas históricas'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando ranking histórico...</div>
      ) : players.length === 0 || !lastCalculated ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          Aún no se ha calculado el ranking histórico. Presioná "Calcular estadísticas históricas" para generarlo.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs">
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Nombre</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-center">HR</th>
                <th className="px-3 py-2 text-center">H</th>
                <th className="px-3 py-2 text-center">RBI</th>
              </tr>
            </thead>
            <tbody>
              {pagePlayers.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 text-gray-400">{pageStart + i + 1}</td>
                  <td className="px-3 py-1.5 font-medium text-gray-800">
                    {p.first_name} {p.last_name}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        p.retired ? 'bg-gray-200 text-gray-600' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {p.retired ? 'Retirado' : 'Activo'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-center font-semibold text-yellow-700">{p.home_runs}</td>
                  <td className="px-3 py-1.5 text-center">{p.hits}</td>
                  <td className="px-3 py-1.5 text-center">{p.rbi}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
