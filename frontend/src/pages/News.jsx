import { useEffect, useState } from 'react';
import { api } from '../api';

const TYPE_CONFIG = {
  game:    { label: 'Partido',  bg: 'bg-blue-600',   border: 'border-blue-500',  text: 'text-blue-400'  },
  injury:  { label: 'Lesión',   bg: 'bg-red-600',    border: 'border-red-500',   text: 'text-red-400'   },
  signing: { label: 'Fichaje',  bg: 'bg-green-600',  border: 'border-green-500', text: 'text-green-400' },
  auction: { label: 'Subasta',  bg: 'bg-yellow-600', border: 'border-yellow-500',text: 'text-yellow-400'},
};

const DEFAULT_CONFIG = { label: 'Noticia', bg: 'bg-gray-600', border: 'border-gray-500', text: 'text-gray-400' };

export default function News() {
  const [news, setNews] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchDay, setFetchDay] = useState(null);
  const [inputDay, setInputDay] = useState('');
  const [seasonId, setSeasonId] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getNews(fetchDay, seasonId), api.getTeams()])
      .then(([newsData, teamsData]) => {
        setNews(newsData.items);
        setTeams(teamsData);
        if (seasonId === null && newsData.seasonId) setSeasonId(newsData.seasonId);
        if (fetchDay === null && newsData.items.length > 0) {
          setInputDay(String(newsData.items[0].season_day));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [fetchDay, seasonId]);

  const applyFilter = () => {
    const d = parseInt(inputDay, 10);
    if (!isNaN(d)) setFetchDay(d);
  };

  const goToLatest = () => {
    setFetchDay(null);
  };

  const sorted = [...teams].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const rdA = a.runs_scored - a.runs_allowed;
    const rdB = b.runs_scored - b.runs_allowed;
    return rdB - rdA;
  });

  return (
    <div className="flex gap-6 items-start">
      {/* News feed */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Noticias</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Día:</label>
            <input
              type="number"
              min="1"
              value={inputDay}
              onChange={(e) => setInputDay(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={applyFilter}
              className="bg-blue-600 text-white text-sm px-3 py-1 rounded hover:bg-blue-700"
            >
              Filtrar
            </button>
            <button
              onClick={goToLatest}
              className="bg-gray-200 text-gray-700 text-sm px-3 py-1 rounded hover:bg-gray-300"
            >
              Último día
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-400">Cargando noticias...</div>
        ) : news.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No hay noticias aún. Avanza días de temporada para que aparezcan resultados, lesiones y fichajes.
          </div>
        ) : (
          <div className="space-y-2">
            {news.map((item) => {
              const cfg = TYPE_CONFIG[item.type] ?? DEFAULT_CONFIG;
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-lg shadow flex items-start gap-3 p-3 border-l-4 ${cfg.border}`}
                >
                  <span className={`${cfg.bg} text-white text-xs font-semibold px-2 py-0.5 rounded shrink-0 mt-0.5`}>
                    {cfg.label}
                  </span>
                  <span className="text-gray-800 text-sm flex-1">{item.headline}</span>
                  <span className="text-gray-400 text-xs shrink-0 mt-0.5">Día {item.season_day}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Standings sidebar */}
      <div className="w-64 shrink-0">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Clasificación</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs">
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Equipo</th>
                <th className="px-2 py-2 text-center">G</th>
                <th className="px-2 py-2 text-center">P</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((team, i) => (
                <tr key={team.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 text-gray-500 text-xs">{i + 1}</td>
                  <td className="px-2 py-1.5 font-medium text-gray-800 truncate max-w-[120px]">{team.name}</td>
                  <td className="px-2 py-1.5 text-center text-green-700 font-semibold">{team.wins}</td>
                  <td className="px-2 py-1.5 text-center text-red-600">{team.losses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
