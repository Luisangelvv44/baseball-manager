import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';
import { distanceKm, layoutCities } from '../map/geometry.js';

const LeagueMap = lazy(() => import('../map/LeagueMap.jsx'));

export default function MapPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api.getMap().then(setData).catch((err) => setError(err.message));
  }, []);

  const positions = useMemo(() => (data ? layoutCities(data.teams) : null), [data]);
  const byId = useMemo(() => new Map((data?.teams ?? []).map((t) => [t.id, t])), [data]);

  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return <p>Cargando mapa...</p>;

  const userTeam = byId.get(data.userTeamId);
  const here = byId.get(data.currentCityTeamId);
  const next = data.nextGame;
  const nextCity = next && byId.get(next.home_team_id);
  const rival = next && byId.get(next.home_team_id === data.userTeamId ? next.away_team_id : next.home_team_id);
  const selected = selectedId != null ? byId.get(selectedId) : null;
  const km = (a, b) => distanceKm(positions.get(a?.id), positions.get(b?.id));
  const cities = [...data.teams].sort((a, b) => a.city.localeCompare(b.city));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Mapa de la liga</h1>
      <div className="flex flex-col lg:flex-row bg-white rounded-lg shadow overflow-hidden">
        <div className="flex-1 min-w-0">
          <Suspense fallback={<div className="h-[420px] lg:h-[620px] bg-[#1d4e73]" />}>
            <LeagueMap data={data} positions={positions} selectedId={selectedId} onSelect={setSelectedId} />
          </Suspense>
        </div>

        <aside className="w-full lg:w-80 flex-none border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 p-4 space-y-4 lg:max-h-[620px] lg:overflow-y-auto text-sm">
          <section className="bg-white border rounded-lg p-3 space-y-1">
            <h3 className="font-bold text-gray-800">📍 Ubicación actual</h3>
            <div className="text-lg font-semibold">{here?.city ?? '-'}</div>
            <div className="text-xs text-gray-500">
              {here?.id === data.userTeamId
                ? 'En casa'
                : `De visita · ${km(here, userTeam).toLocaleString()} km de ${userTeam?.city ?? 'casa'}`}
            </div>
          </section>

          <section className="bg-white border rounded-lg p-3 space-y-1">
            <h3 className="font-bold text-gray-800">✈️ Próximo partido</h3>
            {next && nextCity ? (
              <>
                <div className="text-xs text-gray-500">
                  Día {next.day_number}{next.is_playoff ? ' · Playoffs' : ''}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-gray-500">{next.home_team_id === data.userTeamId ? 'vs' : '@'}</span>
                  <TeamBadge name={rival?.name} />
                </div>
                <div className="text-xs text-gray-600">
                  En {nextCity.city}
                  {nextCity.id === here?.id ? ' · sin viaje' : ` · vuelo de ${km(here, nextCity).toLocaleString()} km`}
                </div>
              </>
            ) : (
              <div className="text-gray-500">No hay partidos pendientes.</div>
            )}
            <Link to="/schedule" className="text-xs text-blue-600 hover:underline">Ver calendario</Link>
          </section>

          <section className="bg-white border rounded-lg p-3 space-y-1">
            <h3 className="font-bold text-gray-800">🏙️ Ciudad</h3>
            {selected ? (
              <>
                <div className="text-lg font-semibold">{selected.city}</div>
                <TeamBadge name={selected.name} size="md" className="font-semibold" />
                <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 pt-1">
                  <span className="text-gray-500">División</span>
                  <span className="text-right">{selected.division_name ?? '-'}</span>
                  <span className="text-gray-500">Récord</span>
                  <span className="text-right tabular-nums">{selected.wins}-{selected.losses}</span>
                  <span className="text-gray-500">Reputación</span>
                  <span className="text-right tabular-nums">{selected.reputation}</span>
                  <span className="text-gray-500">Fans</span>
                  <span className="text-right tabular-nums">{(selected.fan_base ?? 0).toLocaleString()}</span>
                  <span className="text-gray-500">Distancia</span>
                  <span className="text-right tabular-nums">{km(here, selected).toLocaleString()} km</span>
                </div>
                <Link to="/teams-overview" className="text-xs text-blue-600 hover:underline">Ver equipos</Link>
              </>
            ) : (
              <div className="text-gray-500">Pulsa una ciudad en el mapa o en la lista.</div>
            )}
          </section>

          <section className="space-y-1">
            <h3 className="font-bold text-gray-800">Ciudades</h3>
            <ul className="divide-y bg-white border rounded-lg">
              {cities.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-indigo-50 ${
                      t.id === selectedId ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className={`font-semibold ${t.is_user_team ? 'text-amber-600' : ''}`}>{t.city}</span>
                    <TeamBadge name={t.name} className="text-xs text-gray-500" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
