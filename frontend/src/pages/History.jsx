import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';
import AllTimePlayers from './AllTimePlayers.jsx';
import { seasonLabel } from '../utils/seasonLabel.js';

function SeasonCard({ season }) {
  const hasRecord = season.champion_wins != null && season.champion_losses != null;
  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-2 aspect-square">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">{seasonLabel(season.edition)}</span>
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
  { key: 'rivalries', label: 'Rivalidades' },
  { key: 'hof', label: 'Salón de la Fama' },
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
      ) : tab === 'rivalries' ? (
        <RivalriesTab />
      ) : tab === 'hof' ? (
        <HallOfFameTab />
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
  const [edition, setEdition] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getSeasonAwards(seasonId)
      .then((data) => {
        setAwards(data.awards);
        if (seasonId == null) setSeasonId(data.season_id);
        const match = seasons.find((s) => s.season_id === data.season_id);
        setEdition(match?.edition ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  if (loading) return <div className="text-center py-10 text-gray-400">Cargando premios...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Premios de temporada {edition ? `— ${seasonLabel(edition)}` : ''}</h2>
        {seasons.length > 0 && (
          <select
            value={seasonId ?? ''}
            onChange={(e) => setSeasonId(Number(e.target.value))}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            {seasons.map((s) => (
              <option key={s.season_id} value={s.season_id}>
                {seasonLabel(s.edition)}
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
            {formatValue ? formatValue(record.value) : record.value} — {seasonLabel(record.edition)}
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

function RivalryBar({ intensity }) {
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-orange-500"
        style={{ width: `${Math.min(100, Math.max(0, intensity))}%` }}
      />
    </div>
  );
}

function RivalriesTab() {
  const [rivalries, setRivalries] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getRivalries()
      .then((data) => setRivalries(data.rivalries))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">Cargando rivalidades...</div>;
  if (!rivalries || rivalries.length === 0) {
    return <div className="text-center py-10 text-gray-500">Todavía no hay rivalidades registradas.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Rivalidades históricas</h2>
      {rivalries.map((r) => (
        <div key={r.id} className="bg-white rounded-lg shadow p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 font-semibold text-gray-800">
              <TeamBadge name={r.team_a.name} /> vs <TeamBadge name={r.team_b.name} />
            </span>
            <span className="font-mono text-gray-500">{r.wins_a}-{r.wins_b}</span>
          </div>
          <RivalryBar intensity={r.intensity} />
          <div className="text-xs text-gray-400">Intensidad: {Math.round(r.intensity)}/100</div>
        </div>
      ))}
    </div>
  );
}

function CareerLine({ entry }) {
  const t = entry.career_totals || {};
  if (entry.role === 'PITCHER') {
    return (
      <span>
        {t.wins ?? 0}-{t.losses ?? 0} · {t.strikeouts ?? 0} K · EFE {t.era != null ? t.era.toFixed(2) : '—'}
      </span>
    );
  }
  return (
    <span>
      {t.hits ?? 0} H · {t.home_runs ?? 0} HR · {t.rbi ?? 0} RBI
    </span>
  );
}

function HallOfFamePlaque({ entry }) {
  return (
    <div
      className={`rounded-lg shadow p-4 flex flex-col gap-2 border bg-gradient-to-b from-amber-50 to-white ${
        entry.is_user_team ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-amber-700">Clase de {seasonLabel(entry.inducted_edition)}</span>
        <span className="text-lg">🏛️</span>
      </div>
      <div className="text-center flex flex-col items-center gap-1">
        <p className="font-bold text-lg text-gray-800 leading-tight">{entry.player_name}</p>
        <span className="text-xs text-gray-500">{entry.position} · {entry.seasons_played} temporadas</span>
        {entry.team_name && <TeamBadge name={entry.team_name} size="md" className="text-gray-500 justify-center" />}
      </div>
      <div className="text-xs text-gray-600 text-center">
        <CareerLine entry={entry} />
      </div>
      <div className="text-xs text-gray-400 text-center">
        {entry.last_vote_pct}% de los votos
        {entry.years_on_ballot === 1 ? ' · primera papeleta' : ` · ${entry.years_on_ballot}º año`}
      </div>
    </div>
  );
}

function VoteBar({ pct, inductionPct }) {
  return (
    <div className="relative w-28 h-2 bg-gray-200 rounded">
      <div
        className={`h-2 rounded ${pct >= inductionPct ? 'bg-amber-500' : 'bg-gray-500'}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
      <div className="absolute top-[-3px] h-[14px] w-px bg-red-500" style={{ left: `${inductionPct}%` }} />
    </div>
  );
}

function HallOfFameTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getHallOfFame()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-400">Cargando Salón de la Fama...</div>;
  if (!data) return <div className="text-center py-10 text-gray-500">No se pudo cargar el Salón de la Fama.</div>;

  const { inducted, ballot, rules } = data;

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xl font-bold text-gray-800 mb-1">Salón de la Fama</h2>
        <p className="text-sm text-gray-500 mb-4">
          Los mejores retirados se votan cada temporada: con {rules.induction_pct}% entran, con menos de {rules.drop_pct}% o
          tras {rules.max_years} intentos salen de la papeleta.
        </p>
        {inducted.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">Todavía no hay exaltados.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inducted.map((e) => (
              <HallOfFamePlaque key={e.player_id} entry={e} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-lg font-bold text-gray-800 mb-3">Papeleta actual</h3>
        {ballot.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">No hay candidatos en la papeleta.</div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2">Jugador</th>
                  <th className="text-left px-3 py-2">Equipo</th>
                  <th className="text-left px-3 py-2">Carrera</th>
                  <th className="text-right px-3 py-2">Legado</th>
                  <th className="text-center px-3 py-2">Año</th>
                  <th className="text-left px-3 py-2">Última votación</th>
                </tr>
              </thead>
              <tbody>
                {ballot.map((e) => {
                  const history = e.vote_history;
                  const prev = history.length >= 2 ? history[history.length - 2].pct : null;
                  const trend = prev == null ? null : e.last_vote_pct - prev;
                  return (
                    <tr key={e.player_id} className={`border-t ${e.is_user_team ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-gray-800">{e.player_name}</div>
                        <div className="text-xs text-gray-400">{e.position} · {e.seasons_played} temp.</div>
                      </td>
                      <td className="px-3 py-2">{e.team_name ? <TeamBadge name={e.team_name} /> : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-600"><CareerLine entry={e} /></td>
                      <td className="px-3 py-2 text-right font-mono">{Math.round(e.legacy_score)}</td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        {e.years_on_ballot}/{rules.max_years}
                      </td>
                      <td className="px-3 py-2">
                        {e.last_vote_pct == null ? (
                          <span className="text-xs text-gray-400">Debuta en la próxima votación</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <VoteBar pct={e.last_vote_pct} inductionPct={rules.induction_pct} />
                            <span className="font-mono text-gray-700">{e.last_vote_pct}%</span>
                            {trend != null && (
                              <span className={`text-xs ${trend >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
