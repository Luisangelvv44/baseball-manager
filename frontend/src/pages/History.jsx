import { useEffect, useState } from 'react';
import { api } from '../api.js';

function SeasonCard({ season }) {
  const hasRecord = season.champion_wins != null && season.champion_losses != null;
  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2 aspect-square">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">Temporada {season.year}</span>
        <span className="text-lg">🏆</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-1">
        <p className="font-bold text-lg text-gray-800 leading-tight">{season.champion_name ?? 'N/D'}</p>
        {season.champion_division && (
          <p className="text-xs text-gray-400">{season.champion_division}</p>
        )}
        {hasRecord && (
          <p className="text-sm text-green-700 font-semibold">
            {season.champion_wins}-{season.champion_losses}
          </p>
        )}
      </div>
      <div className="text-xs text-gray-500 text-center border-t pt-2">
        {season.runner_up ? (
          <span>Subcampeón: <span className="font-medium text-gray-700">{season.runner_up}</span></span>
        ) : (
          <span className="italic text-gray-400">Sin subcampeón registrado</span>
        )}
      </div>
    </div>
  );
}

export default function History() {
  const [champions, setChampions] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getChampionsHistory(), api.getSeasonHistory()])
      .then(([championsData, seasonsData]) => {
        setChampions(championsData);
        setSeasons(seasonsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-10 text-gray-400">Cargando históricos...</div>;
  }

  return (
    <div className="flex gap-6 items-start">
      {/* Champions by team */}
      <div className="w-64 shrink-0">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Campeonatos</h2>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-white text-xs">
                <th className="px-2 py-2 text-left">Equipo</th>
                <th className="px-2 py-2 text-center">Títulos</th>
              </tr>
            </thead>
            <tbody>
              {champions.map((c, i) => (
                <tr key={c.team_id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 font-medium text-gray-800 truncate max-w-[140px]">{c.name}</td>
                  <td className="px-2 py-1.5 text-center font-semibold text-yellow-700">
                    {c.championships > 0 ? c.championships : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Season-by-season grid */}
      <div className="flex-1 min-w-0">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Temporadas</h2>
        {seasons.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            Aún no se ha completado ninguna temporada. Juega hasta el final de los playoffs para que aparezca aquí.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {seasons.map((s) => (
              <SeasonCard key={s.id} season={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
