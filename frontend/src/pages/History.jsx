import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';
import AllTimePlayers from './AllTimePlayers.jsx';

function SeasonCard({ season }) {
  const hasRecord = season.champion_wins != null && season.champion_losses != null;
  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2 aspect-square">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">Temporada {season.year}</span>
        <span className="text-lg">🏆</span>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-1">
        {season.champion_name ? (
          <TeamBadge name={season.champion_name} size="md" className="font-bold text-lg text-gray-800 leading-tight justify-center" />
        ) : (
          <p className="font-bold text-lg text-gray-800 leading-tight">N/D</p>
        )}
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
          <span className="inline-flex items-center gap-1">Subcampeón: <TeamBadge name={season.runner_up} className="font-medium text-gray-700" /></span>
        ) : (
          <span className="italic text-gray-400">Sin subcampeón registrado</span>
        )}
      </div>
    </div>
  );
}

const TABS = [
  { key: 'seasons', label: 'Temporadas' },
  { key: 'alltime', label: 'All-Time Players' },
  { key: 'awards', label: 'Premios' },
  { key: 'records', label: 'Récords' },
];

const AWARD_LABELS = {
  MVP: { icon: '🏆', title: 'MVP' },
  CY_YOUNG: { icon: '🥇', title: 'Mejor Lanzador' },
  ROOKIE_OF_YEAR: { icon: '⭐', title: 'Novato del Año' },
};

export default function History() {
  const [tab, setTab] = useState('seasons');
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

  return (
    <div>
      <div className="flex gap-2 border-b border-gray-200 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-gray-800 text-gray-800'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'alltime' ? (
        <AllTimePlayers />
      ) : tab === 'awards' ? (
        <AwardsTab seasons={seasons} />
      ) : tab === 'records' ? (
        <RecordsTab />
      ) : loading ? (
        <div className="text-center py-10 text-gray-400">Cargando históricos...</div>
      ) : (
        <SeasonsTab champions={champions} seasons={seasons} />
      )}
    </div>
  );
}

function AwardsTab({ seasons }) {
  const [seasonId, setSeasonId] = useState(null);
  const [awards, setAwards] = useState([]);
  const [year, setYear] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSeasonAwards(seasonId)
      .then((data) => {
        setAwards(data.awards);
        if (seasonId == null) setSeasonId(data.season_id);
        const match = seasons.find((s) => s.season_id === data.season_id);
        setYear(match?.year ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  if (loading) return <div className="text-center py-10 text-gray-400">Cargando premios...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Premios de temporada {year ? `— ${year}` : ''}</h2>
        {seasons.length > 0 && (
          <select
            value={seasonId ?? ''}
            onChange={(e) => setSeasonId(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {seasons.map((s) => (
              <option key={s.season_id} value={s.season_id}>
                Temporada {s.year}
              </option>
            ))}
          </select>
        )}
      </div>

      {awards.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No hay premios registrados para esta temporada.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {awards.map((a) => {
            const label = AWARD_LABELS[a.category] || { icon: '🎖️', title: a.category };
            return (
              <div key={a.category} className="bg-white rounded-lg shadow p-4 flex flex-col gap-2 aspect-square">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">{label.title}</span>
                  <span className="text-lg">{label.icon}</span>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-1">
                  <p className="font-bold text-lg text-gray-800 leading-tight">{a.player_name || 'N/D'}</p>
                  {a.team_name && <TeamBadge name={a.team_name} size="md" className="text-gray-500 justify-center" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LeaderTable({ title, unit, rows, valueKey, formatValue }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 mb-2">{title}</h3>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 text-white text-xs">
              <th className="px-3 py-2 text-left">Jugador</th>
              <th className="px-3 py-2 text-center">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-3 text-center text-gray-400">Sin datos</td>
              </tr>
            ) : (
              rows.map((p, i) => (
                <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">
                    {p.first_name} {p.last_name}
                    {p.status === 'retired' && <span className="ml-1 text-xs text-gray-400">(Retirado)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-center font-semibold text-yellow-700">
                    {formatValue ? formatValue(p[valueKey]) : p[valueKey]}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SeasonRecordCard({ icon, title, record, formatValue }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">{title}</span>
        <span className="text-lg">{icon}</span>
      </div>
      {record ? (
        <div className="text-center py-1">
          <p className="font-bold text-lg text-gray-800 leading-tight">
            {record.player_name || record.team_name}
          </p>
          {record.player_name && record.team_name && (
            <TeamBadge name={record.team_name} size="sm" className="text-gray-500 justify-center" />
          )}
          <p className="text-sm text-yellow-700 font-semibold mt-1">
            {formatValue ? formatValue(record.value) : record.value} — Temporada {record.year}
          </p>
        </div>
      ) : (
        <p className="text-center text-gray-400 text-sm py-3">Sin registros aún</p>
      )}
    </div>
  );
}

function RecordsTab() {
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getRecords()
      .then(setRecords)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">Cargando récords...</div>;
  if (!records) return <div className="text-center py-10 text-gray-500">No se pudo cargar el libro de récords.</div>;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Récords de una sola temporada</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SeasonRecordCard icon="💣" title="Más HR en una temporada" record={records.season_records.home_runs} />
          <SeasonRecordCard
            icon="🎯"
            title="Mejor efectividad de la temporada"
            record={records.season_records.era}
            formatValue={(v) => v.toFixed(2)}
          />
          <SeasonRecordCard icon="🔥" title="Racha de victorias más larga" record={records.season_records.win_streak} />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-4">Líderes de carrera</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <LeaderTable title="Jonrones (carrera)" unit="HR" rows={records.career.home_runs} valueKey="career_home_runs" />
          <LeaderTable title="Hits (carrera)" unit="H" rows={records.career.hits} valueKey="career_hits" />
          <LeaderTable title="Carreras impulsadas (carrera)" unit="RBI" rows={records.career.rbi} valueKey="career_rbi" />
          <LeaderTable title="Victorias (carrera)" unit="W" rows={records.career.wins} valueKey="career_wins" />
          <LeaderTable title="Ponches (carrera)" unit="K" rows={records.career.strikeouts} valueKey="career_strikeouts" />
          <LeaderTable
            title="Efectividad (carrera)"
            unit="ERA"
            rows={records.career.era}
            valueKey="era"
            formatValue={(v) => v.toFixed(2)}
          />
        </div>
      </div>
    </div>
  );
}

function SeasonsTab({ champions, seasons }) {
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
                  <td className="px-2 py-1.5 font-medium text-gray-800 max-w-[140px]"><TeamBadge name={c.name} /></td>
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
