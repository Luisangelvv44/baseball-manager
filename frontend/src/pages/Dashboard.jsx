import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Leaderboard from '../components/Leaderboard.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import { useTeam } from '../context/TeamContext.jsx';
import { advanceDayAndRoute } from '../utils/advanceDayFlow.js';
import { seasonLabel } from '../utils/seasonLabel.js';

const fmtAvg = (avg) => (avg == null ? '—' : avg.startsWith('0') ? avg.slice(1) : avg);
const fmtEra = (era) => (era == null ? '—' : Number(era).toFixed(2));
const fmtIp = (ip) => Number(ip).toFixed(1);
const fullName = (p) => `${p.first_name} ${p.last_name}`;

function winPct(t) {
  const total = t.wins + t.losses;
  return total ? t.wins / total : 0;
}

// Posicion del equipo dentro de su division y juegos detras del lider
function divisionStanding(teams, team) {
  const div = teams.filter((t) => t.division_name === team.division_name).sort((a, b) => winPct(b) - winPct(a));
  const idx = div.findIndex((t) => t.id === team.id);
  if (idx < 0) return null;
  const leader = div[0];
  const gamesBehind = ((leader.wins - team.wins) + (team.losses - leader.losses)) / 2;
  return { rank: idx + 1, division: team.division_name, gamesBehind };
}

const COLLAPSED_KEY = 'dashboard.collapsedSections';

function readCollapsed() {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY)) ?? {};
  } catch {
    return {};
  }
}

// Secciones colapsadas del Dashboard, recordadas en localStorage entre visitas
function useCollapsedSections() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  function toggle(id) {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // sin almacenamiento: el estado vive solo en esta visita
      }
      return next;
    });
  }
  return [collapsed, toggle];
}

function CollapsibleSection({ id, title, subtitle, collapsed, onToggle, children }) {
  const isCollapsed = !!collapsed[id];
  return (
    <section>
      <div className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 ${isCollapsed ? '' : 'mb-3'}`}>
        <button
          type="button"
          onClick={() => onToggle(id)}
          aria-expanded={!isCollapsed}
          className="flex items-center gap-2 font-bold text-lg text-gray-900 hover:text-blue-700"
        >
          <span className={`text-sm text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} aria-hidden>▼</span>
          {title}
        </button>
        {subtitle && !isCollapsed && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {!isCollapsed && children}
    </section>
  );
}

function HeroStat({ label, value, accent = 'text-white' }) {
  return (
    <div className="bg-white/10 rounded-lg px-3 py-2 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-blue-200">{label}</p>
      <p className={`font-bold text-base truncate ${accent}`}>{value}</p>
    </div>
  );
}

// Tarjeta de mejor bateador / mejor lanzador (mismo formato para el equipo y para la liga)
function LeaderCard({ kind, player, showTeam, userTeamId }) {
  const isBatter = kind === 'batter';
  const tone = isBatter
    ? { box: 'bg-blue-50 border-blue-100', label: 'text-blue-600', value: 'text-blue-700' }
    : { box: 'bg-emerald-50 border-emerald-100', label: 'text-emerald-600', value: 'text-emerald-700' };
  return (
    <div className={`rounded-lg border p-3 min-w-0 ${tone.box}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${tone.label}`}>
        {isBatter ? 'Mejor bateador · AVG' : 'Mejor lanzador · ERA'}
      </p>
      {player ? (
        <>
          <p className="font-bold text-sm truncate">{fullName(player)}</p>
          {showTeam && (
            <div className={`text-xs mt-0.5 ${player.team_id === userTeamId ? 'text-blue-700 font-semibold' : 'text-gray-600'}`}>
              <TeamBadge name={player.team_name} />
            </div>
          )}
          <p className={`text-2xl font-mono font-bold mt-1 ${tone.value}`}>
            {isBatter ? fmtAvg(player.batting.avg) : `${fmtEra(player.pitching.era)}`}
          </p>
          <p className="text-xs text-gray-500">
            {isBatter
              ? `${player.batting.h} H · ${player.batting.hr} HR · ${player.batting.rbi} RBI`
              : `${player.pitching.w}-${player.pitching.l} · ${fmtIp(player.pitching.ip)} IP · ${player.pitching.so} SO`}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-400 py-4">Nadie califica todavía</p>
      )}
    </div>
  );
}

function LeadersPanel({ title, tag, tagClass, best, showTeam, userTeamId }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="font-bold text-gray-900 min-w-0">{title}</div>
        <span className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${tagClass}`}>{tag}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <LeaderCard kind="batter" player={best?.batter} showTeam={showTeam} userTeamId={userTeamId} />
        <LeaderCard kind="pitcher" player={best?.pitcher} showTeam={showTeam} userTeamId={userTeamId} />
      </div>
    </div>
  );
}

const MEDALS = ['bg-amber-400 text-amber-950', 'bg-gray-300 text-gray-800', 'bg-orange-300 text-orange-900'];

function RaceCard({ title, icon, headerClass, candidates, renderStat, userTeamId, emptyText }) {
  return (
    <div className="bg-white rounded-xl shadow overflow-hidden flex flex-col">
      <div className={`px-4 py-3 flex items-center gap-2 ${headerClass}`}>
        <span className="text-lg" aria-hidden>{icon}</span>
        <p className="font-bold">{title}</p>
      </div>
      <ol className="divide-y flex-1">
        {candidates.length === 0 && <li className="px-4 py-6 text-sm text-gray-400 text-center">{emptyText}</li>}
        {candidates.map((p, i) => (
          <li key={p.player_id} className={`px-4 py-2.5 flex items-center gap-3 ${p.team_id === userTeamId ? 'bg-blue-50' : ''}`}>
            <span className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold shrink-0 ${MEDALS[i]}`}>{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm truncate">
                {fullName(p)} <span className="text-gray-400 font-normal">· {p.position}</span>
              </p>
              <div className="text-xs text-gray-500"><TeamBadge name={p.team_name} /></div>
            </div>
            <div className="text-right shrink-0">{renderStat(p)}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const CATEGORIES = [
  { key: 'avg', label: 'Promedio (AVG)', value: (p) => fmtAvg(p.batting.avg), group: 'bat' },
  { key: 'hr', label: 'Jonrones (HR)', value: (p) => p.batting.hr, group: 'bat' },
  { key: 'rbi', label: 'Carreras impulsadas (RBI)', value: (p) => p.batting.rbi, group: 'bat' },
  { key: 'era', label: 'Efectividad (ERA)', value: (p) => fmtEra(p.pitching.era), group: 'pitch' },
  { key: 'w', label: 'Victorias (W)', value: (p) => p.pitching.w, group: 'pitch' },
  { key: 'so', label: 'Ponches (SO)', value: (p) => p.pitching.so, group: 'pitch' },
];

function CategoryTable({ category, players, userTeamId }) {
  const accent = category.group === 'bat' ? 'border-blue-500' : 'border-emerald-500';
  return (
    <div className={`bg-white rounded-xl shadow p-4 border-t-4 ${accent}`}>
      <p className="font-semibold text-sm text-gray-800 mb-2">{category.label}</p>
      {players.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Sin datos todavía</p>
      ) : (
        <ol className="space-y-1">
          {players.map((p, i) => (
            <li
              key={p.player_id}
              className={`flex items-center gap-2 text-sm rounded px-1.5 py-1 ${p.team_id === userTeamId ? 'bg-blue-50 font-semibold' : ''}`}
            >
              <span className="w-4 text-gray-400 text-xs">{i + 1}</span>
              <span className="truncate flex-1 min-w-0">{fullName(p)}</span>
              <span className="text-xs text-gray-500 max-w-[45%] min-w-0"><TeamBadge name={p.team_name} /></span>
              <span className="font-mono font-bold w-12 text-right shrink-0">{category.value(p)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { refreshTeam, refreshAlerts } = useTeam();
  const [myTeam, setMyTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [season, setSeason] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [leaders, setLeaders] = useState(null);
  const [collapsed, toggleSection] = useCollapsedSections();
  const navigate = useNavigate();

  async function loadAll() {
    try {
      const [me, allTeams, currentSeason] = await Promise.all([
        api.getMyTeam(),
        api.getTeams(),
        api.getSeason(),
      ]);
      setMyTeam(me.team);
      setTeams(allTeams);
      setSeason(currentSeason);
    } catch (err) {
      setMessage(err.message);
    }
    try {
      setLeaders(await api.getLeagueLeaders());
    } catch {
      // stats opcionales, no bloquear el resto del Dashboard
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleStartSeason() {
    setLoading(true);
    setMessage('');
    try {
      await api.startSeason();
      setMessage('Temporada iniciada. ¡Mucha suerte!');
      await Promise.all([loadAll(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvanceDay() {
    setLoading(true);
    setMessage('');
    try {
      await advanceDayAndRoute({
        navigate,
        refreshTeam,
        refreshAlerts,
        setMessage,
        onStay: () => loadAll(),
      });
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!myTeam) {
    return (
      <div className="text-center py-10">
        <p className="mb-4">Cargando... si es la primera vez, ve a <b>Nueva Partida</b> para inicializar la liga.</p>
      </div>
    );
  }

  const me = teams.find((t) => t.id === myTeam.id);
  const standing = me ? divisionStanding(teams, me) : null;
  const inRegularSeason = season && season.status === 'active' && season.current_day > season.preSeasonDays;
  const regularDays = season ? season.total_days - season.preSeasonDays : 0;
  const regularDay = season ? season.current_day - season.preSeasonDays : 0;
  const hasStats = leaders && Object.values(leaders.categories).some((list) => list.length > 0);

  return (
    <div className="space-y-6">
      {/* Cabecera del equipo */}
      <div className="rounded-xl shadow-lg bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 text-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <TeamBadge name={myTeam.name} size="lg" className="text-2xl font-bold" />
            <p className="text-blue-200 text-sm mt-1">
              {season ? seasonLabel(season.edition) : 'Sin temporada'}
              {standing && ` · ${standing.rank}º en ${standing.division}`}
              {standing && standing.rank > 1 && ` (${standing.gamesBehind} JD)`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(!season || season.status === 'completed') && (
              <button
                onClick={handleStartSeason}
                disabled={loading}
                className="bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 disabled:opacity-50"
              >
                Iniciar Temporada
              </button>
            )}
            {season && (season.status === 'active' || season.status === 'playoffs') && (
              <button
                onClick={handleAdvanceDay}
                disabled={loading}
                className="bg-blue-500 text-white px-5 py-2 rounded-lg font-semibold shadow hover:bg-blue-400 disabled:opacity-50"
              >
                Avanzar Dia
              </button>
            )}
            {season && season.status === 'playoffs' && (
              <button
                onClick={() => navigate('/playoffs')}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-yellow-600"
              >
                Ver Playoffs
              </button>
            )}
            {season && season.status === 'draft' && (
              <button
                onClick={() => navigate('/draft')}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700"
              >
                Ir al Draft
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <HeroStat label="Record" value={`${myTeam.wins}-${myTeam.losses}`} />
          <HeroStat label="Presupuesto" value={`$${Number(myTeam.budget).toLocaleString()}`} accent="text-green-300" />
          <HeroStat label="Base de fans" value={(myTeam.fan_base ?? 0).toLocaleString()} accent="text-sky-300" />
          <HeroStat label="Reputación" value={myTeam.reputation} accent="text-amber-300" />
        </div>

        {inRegularSeason && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-blue-200 mb-1">
              <span>Temporada regular</span>
              <span>Día {regularDay} de {regularDays}</span>
            </div>
            <div className="h-2 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(100, (regularDay / regularDays) * 100)}%` }} />
            </div>
          </div>
        )}
      </div>

      {season && season.current_day <= season.preSeasonDays && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <p className="font-semibold text-yellow-800">Pre-temporada</p>
          <p className="text-yellow-700 text-sm">
            Quedan {season.preSeasonDays - season.current_day + 1} dias para el inicio de la temporada.
            Aprovecha para firmar jugadores y armar tu equipo.
          </p>
        </div>
      )}

      {season && season.status === 'playoffs' && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <p className="font-semibold text-yellow-800">¡Temporada regular terminada — Playoffs en curso!</p>
          <p className="text-yellow-700 text-sm">{seasonLabel(season.edition)} · Ve a la sección de Playoffs para jugar.</p>
        </div>
      )}
      {season && season.status === 'draft' && (
        <div className="bg-purple-50 border border-purple-300 rounded-lg p-4">
          <p className="font-semibold text-purple-800">Draft Anual — {seasonLabel(season.edition)}</p>
          <p className="text-purple-700 text-sm">
            Los playoffs terminaron. Cada equipo elige un prospecto en orden inverso de la tabla. Ve al Draft para tu pick.
          </p>
        </div>
      )}
      {season && season.status === 'completed' && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="font-semibold text-gray-700">{seasonLabel(season.edition)} completada</p>
          <p className="text-gray-500 text-sm">El draft terminó. Puedes iniciar la siguiente temporada.</p>
        </div>
      )}

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>
      )}

      {hasStats && (
        <CollapsibleSection
          id="leaders"
          title="Líderes de temporada"
          subtitle={`Califican con ${leaders.qualification.minAB}+ AB / ${leaders.qualification.minIP}+ IP (proporcional a lo jugado)`}
          collapsed={collapsed}
          onToggle={toggleSection}
        >
          <div className="grid lg:grid-cols-2 gap-4">
            <LeadersPanel
              title={<TeamBadge name={myTeam.name} />}
              tag="Tu equipo"
              tagClass="bg-blue-100 text-blue-700"
              best={leaders.best.team}
              userTeamId={myTeam.id}
            />
            <LeadersPanel
              title="Toda la liga"
              tag="Liga"
              tagClass="bg-slate-800 text-white"
              best={leaders.best.league}
              showTeam
              userTeamId={myTeam.id}
            />
          </div>
        </CollapsibleSection>
      )}

      {hasStats && (
        <CollapsibleSection
          id="awards"
          title="Carrera por los premios"
          subtitle="Top 3 si la temporada terminara hoy"
          collapsed={collapsed}
          onToggle={toggleSection}
        >
          <div className="grid md:grid-cols-3 gap-4">
            <RaceCard
              title="MVP"
              icon="🏆"
              headerClass="bg-amber-50 text-amber-900"
              candidates={leaders.races.mvp}
              userTeamId={myTeam.id}
              emptyText="Ningún bateador califica todavía"
              renderStat={(p) => (
                <>
                  <p className="font-mono font-bold text-sm">{fmtAvg(p.batting.avg)}</p>
                  <p className="text-[11px] text-gray-500">{p.batting.hr} HR · {p.batting.rbi} RBI</p>
                </>
              )}
            />
            <RaceCard
              title="Cy Young"
              icon="⚾"
              headerClass="bg-emerald-50 text-emerald-900"
              candidates={leaders.races.cy_young}
              userTeamId={myTeam.id}
              emptyText="Ningún lanzador califica todavía"
              renderStat={(p) => (
                <>
                  <p className="font-mono font-bold text-sm">{fmtEra(p.pitching.era)}</p>
                  <p className="text-[11px] text-gray-500">{p.pitching.w}-{p.pitching.l} · {p.pitching.so} SO</p>
                </>
              )}
            />
            <RaceCard
              title="Novato del Año"
              icon="⭐"
              headerClass="bg-violet-50 text-violet-900"
              candidates={leaders.races.rookie}
              userTeamId={myTeam.id}
              emptyText="Ningún novato califica todavía"
              renderStat={(p) => (
                <>
                  <p className="font-mono font-bold text-sm">
                    {p.kind === 'batter' ? fmtAvg(p.batting.avg) : `${fmtEra(p.pitching.era)} ERA`}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {p.kind === 'batter' ? 'Bateador' : 'Lanzador'} · percentil {Math.round(p.percentile * 100)}
                  </p>
                </>
              )}
            />
          </div>
        </CollapsibleSection>
      )}

      <CollapsibleSection id="standings" title="Tabla de posiciones" collapsed={collapsed} onToggle={toggleSection}>
        <Leaderboard teams={teams} userTeamId={myTeam.id} />
      </CollapsibleSection>

      {hasStats && (
        <CollapsibleSection
          id="categories"
          title="Líderes por categoría"
          subtitle="Toda la liga · tus jugadores resaltados en azul"
          collapsed={collapsed}
          onToggle={toggleSection}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map((c) => (
              <CategoryTable key={c.key} category={c} players={leaders.categories[c.key]} userTeamId={myTeam.id} />
            ))}
          </div>
        </CollapsibleSection>
      )}
    </div>
  );
}
