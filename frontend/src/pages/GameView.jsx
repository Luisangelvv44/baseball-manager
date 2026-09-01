import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';
import SkillTierBadge from '../components/SkillTierBadge.jsx';
import GameIntro from '../components/GameIntro.jsx';
import { useTeam } from '../context/TeamContext.jsx';
import { advanceDayAndRoute } from '../utils/advanceDayFlow.js';
import { getTeamLogo } from '../utils/teamLogos.js';
import { teamColor } from '../utils/teamColor.js';

const RESULT_TEXT = {
  SO: 'Ponche',
  GO: 'Roletazo de out',
  FO: 'Elevado de out',
  BB: 'Base por bolas',
  '1B': 'Sencillo',
  '2B': 'Doble',
  '3B': 'Triple',
  HR: '¡Jonrón!',
};

function halfInningLabel(ev) {
  if (!ev) return 'Por comenzar';
  return `${ev.half === 'top' ? 'Alta' : 'Baja'} ${ev.inning}ª`;
}

function buildNameMap(homeLineup, awayLineup) {
  const map = {};
  for (const lu of [homeLineup, awayLineup]) {
    if (!lu) continue;
    if (lu.pitcher) map[lu.pitcher.id] = lu.pitcher.name;
    for (const b of lu.batters ?? []) map[b.id] = b.name;
  }
  return map;
}

function initialsOf(name) {
  return (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function BasesDiamond({ bases }) {
  const [first, second, third] = bases;
  const occupied = 'bg-yellow-400 border-yellow-600';
  const empty = 'bg-gray-200 border-gray-400';

  return (
    <div className="relative w-24 h-24">
      {/* 2B — top center */}
      <div className={`absolute w-6 h-6 rotate-45 border-2 ${second ? occupied : empty}`}
        style={{ top: 0, left: '50%', transform: 'translateX(-50%) rotate(45deg)' }} />
      {/* 3B — middle left */}
      <div className={`absolute w-6 h-6 rotate-45 border-2 ${third ? occupied : empty}`}
        style={{ top: '50%', left: 0, transform: 'translateY(-50%) rotate(45deg)' }} />
      {/* 1B — middle right */}
      <div className={`absolute w-6 h-6 rotate-45 border-2 ${first ? occupied : empty}`}
        style={{ top: '50%', right: 0, transform: 'translateY(-50%) rotate(45deg)' }} />
      {/* Home — bottom center */}
      <div className="absolute w-6 h-6 rotate-45 border-2 bg-white border-gray-500"
        style={{ bottom: 0, left: '50%', transform: 'translateX(-50%) rotate(45deg)' }} />
    </div>
  );
}

function OutsIndicator({ outs }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-500 font-medium">OUTS</span>
      <div className="flex gap-2">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`w-4 h-4 rounded-full border-2 ${outs >= n ? 'bg-red-500 border-red-700' : 'bg-gray-200 border-gray-400'}`}
          />
        ))}
      </div>
    </div>
  );
}

function TabSwitcher({ tab, onChange }) {
  const btn = (id, label) => (
    <button
      key={id}
      onClick={() => onChange(id)}
      className={`px-4 py-1.5 rounded-md text-xs font-display font-bold tracking-[0.12em] uppercase transition-colors ${
        tab === id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex gap-1 bg-gray-200 p-1 rounded-lg">
      {btn('previa', 'Previa')}
      {btn('envivo', 'En vivo')}
    </div>
  );
}

function TeamMark({ name, color }) {
  const logo = getTeamLogo(name);
  if (logo) return <img src={logo} alt="" className="w-16 h-16 object-contain" />;
  return (
    <div
      className="w-16 h-16 rounded-full flex items-center justify-center font-display font-extrabold text-xl text-white"
      style={{ background: color.accent }}
    >
      {initialsOf(name)}
    </div>
  );
}

const STATUS_PILL = {
  PROGRAMADO: 'text-gray-500 border-gray-300',
  'EN VIVO': 'text-red-600 border-red-300',
  FINAL: 'text-gray-800 border-gray-400',
};

function MatchupHeader({ homeTeam, awayTeam, score, status, canPlay, loading, onPlay }) {
  const away = teamColor(awayTeam?.name);
  const home = teamColor(homeTeam?.name);

  const side = (team, color, value) => (
    <div className="flex flex-col items-center gap-2 min-w-[8rem]">
      <TeamMark name={team?.name} color={color} />
      <div className="font-display font-bold uppercase tracking-wide text-center text-lg leading-tight">
        {team?.name}
      </div>
      <div className="font-display font-extrabold text-5xl sm:text-6xl leading-none">{value}</div>
    </div>
  );

  return (
    <div className="relative overflow-hidden rounded-xl border bg-white shadow p-6">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: away.accent }} />
      <div className="absolute inset-y-0 right-0 w-1.5" style={{ background: home.accent }} />
      <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
        {side(awayTeam, away, score.away)}
        <div className="flex flex-col items-center gap-2">
          <span className={`text-[11px] font-bold tracking-[0.15em] border rounded-full px-3 py-1 ${STATUS_PILL[status] || STATUS_PILL.PROGRAMADO}`}>
            {status}
          </span>
          <span className="font-display font-semibold text-xl text-gray-400">VS</span>
          {canPlay && (
            <button
              onClick={onPlay}
              disabled={loading}
              className="bg-green-600 text-white px-6 py-2 rounded font-display font-bold uppercase tracking-wide hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Simulando...' : 'Jugar Partido'}
            </button>
          )}
        </div>
        {side(homeTeam, home, score.home)}
      </div>
    </div>
  );
}

function PitchersCard({ homeTeam, awayTeam, homeLineup, awayLineup }) {
  if (!homeLineup?.pitcher || !awayLineup?.pitcher) return null;

  const away = teamColor(awayTeam?.name);
  const home = teamColor(homeTeam?.name);
  const barWidth = (skill) => `${Math.min(100, (skill / 150) * 100)}%`;

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <h3 className="font-display font-bold tracking-[0.12em] text-sm text-gray-500 mb-4">
        PITCHERS PROBABLES
      </h3>
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <div className="flex justify-between items-baseline mb-1.5 gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: away.accent }}>
                {awayTeam?.name}
              </div>
              <div className="font-display font-bold text-lg sm:text-xl">{awayLineup.pitcher.name}</div>
            </div>
            <div className="font-display font-extrabold text-2xl sm:text-3xl">{awayLineup.pitcher.current_skill}</div>
          </div>
          <div className="h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-full rounded" style={{ width: barWidth(awayLineup.pitcher.current_skill), background: away.accent }} />
          </div>
        </div>

        <div className="font-display font-bold text-gray-400">VS</div>

        <div className="flex-1">
          <div className="flex justify-between items-baseline mb-1.5 gap-2">
            <div className="font-display font-extrabold text-2xl sm:text-3xl">{homeLineup.pitcher.current_skill}</div>
            <div className="min-w-0 text-right">
              <div className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: home.accent }}>
                {homeTeam?.name}
              </div>
              <div className="font-display font-bold text-lg sm:text-xl">{homeLineup.pitcher.name}</div>
            </div>
          </div>
          <div className="h-2 rounded bg-gray-200 overflow-hidden flex justify-end">
            <div className="h-full rounded" style={{ width: barWidth(homeLineup.pitcher.current_skill), background: home.accent }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function LineupCard({ team, lineup }) {
  const color = teamColor(team?.name);
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3" style={{ background: color.soft }}>
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color.accent }} />
        <span className="font-display font-bold uppercase tracking-wide">
          <TeamBadge name={team?.name} />
        </span>
      </div>
      {lineup?.batters?.length > 0 ? (
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-4 py-2 w-8 font-display">#</th>
              <th className="px-2 py-2 font-display">Nombre</th>
              <th className="px-2 py-2 font-display text-center">Pos</th>
              <th className="px-4 py-2 font-display text-right">Skill</th>
            </tr>
          </thead>
          <tbody>
            {lineup.batters.map((p, idx) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                <td className="px-2 py-2 font-medium">{p.name}</td>
                <td className="px-2 py-2 text-center text-gray-500">{p.position}</td>
                <td className="px-4 py-2 text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <span className="font-display font-bold">{p.current_skill}</span>
                    <SkillTierBadge skill={p.current_skill} className="hidden sm:inline-block" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-400 text-sm p-4">Lineup no disponible.</p>
      )}
    </div>
  );
}

function LineScore({ innings, inningScores, homeTeam, awayTeam, homeTotal, awayTotal, live, inningLabel }) {
  const rows = [
    { key: 'away', team: awayTeam, total: awayTotal },
    { key: 'home', team: homeTeam, total: homeTotal },
  ];
  return (
    <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
      <div className="flex items-center justify-between mb-3 min-w-[280px]">
        <div className="flex items-center gap-2">
          {live && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
          <span className={`font-display font-bold tracking-[0.15em] text-xs ${live ? 'text-red-600' : 'text-gray-500'}`}>
            {live ? 'EN VIVO' : 'RESUMEN'}
          </span>
        </div>
        <span className="font-display font-semibold uppercase tracking-wide text-sm text-gray-500">
          {inningLabel}
        </span>
      </div>
      <table className="text-sm text-center w-full">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="text-left pr-4 py-1 font-medium min-w-[90px]">Equipo</th>
            {innings.map((n) => (
              <th key={n} className="px-2 py-1 font-display w-8">{n}</th>
            ))}
            <th className="px-3 py-1 font-display font-bold border-l">R</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b last:border-0">
              <td className="text-left pr-4 py-1 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: teamColor(row.team?.name).accent }} />
                  <TeamBadge name={row.team?.name} />
                </span>
              </td>
              {innings.map((n) => (
                <td key={n} className="px-2 py-1 font-display">
                  {inningScores[n] !== undefined ? inningScores[n][row.key] : '-'}
                </td>
              ))}
              <td className="px-3 py-1 font-display font-bold border-l">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LivePanel({ currentEvent, batterName, pitcherName, bases, outs }) {
  return (
    <div className="bg-white rounded-lg shadow p-6 flex flex-col items-center gap-5">
      <div className="text-center">
        <div className="text-xs text-gray-500 uppercase tracking-wide">
          {currentEvent ? (currentEvent.half === 'top' ? 'Entrada alta' : 'Entrada baja') : 'Entrada'}
        </div>
        <div className="font-display font-extrabold text-4xl leading-none">{currentEvent?.inning ?? '—'}</div>
      </div>
      <BasesDiamond bases={bases} />
      <OutsIndicator outs={outs} />
      <div className="w-full grid grid-cols-2 gap-3 text-center">
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Al bate</div>
          <div className="font-display font-bold text-base leading-tight">{batterName || '—'}</div>
        </div>
        <div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-0.5">Lanzando</div>
          <div className="font-display font-bold text-base leading-tight">{pitcherName || '—'}</div>
        </div>
      </div>
    </div>
  );
}

function PlayByPlayFeed({ events, nameMap, homeTeam, awayTeam }) {
  if (!events.length) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-400 flex items-center justify-center text-center min-h-[160px]">
        Pulsa «Jugar Partido» para ver la narración jugada por jugada.
      </div>
    );
  }
  const ordered = [...events].reverse();
  return (
    <div className="bg-white rounded-lg shadow divide-y max-h-[520px] overflow-y-auto">
      {ordered.map((ev) => {
        const isHome = ev.batting_team_id === homeTeam?.id;
        const team = isHome ? homeTeam : awayTeam;
        const color = teamColor(team?.name);
        let desc = `${nameMap[ev.player_id] ?? 'Bateador'} — ${RESULT_TEXT[ev.result] ?? ev.result}`;
        if (ev.outs_after === 3) desc += ' · fin de la entrada';
        return (
          <div key={ev.event_order} className="flex gap-3 items-start p-4">
            <div className="w-1.5 self-stretch rounded shrink-0" style={{ background: color.accent }} />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-0.5">
                {halfInningLabel(ev)} · {team?.name}
              </div>
              <div className="text-sm font-medium">{desc}</div>
            </div>
            {ev.runs_scored > 0 && (
              <div className="font-display font-bold text-xs text-amber-600 whitespace-nowrap">
                +{ev.runs_scored} {ev.runs_scored > 1 ? 'CARRERAS' : 'CARRERA'}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function GameView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refreshTeam } = useTeam();
  const [game, setGame] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [events, setEvents] = useState([]);
  const [visibleEvents, setVisibleEvents] = useState([]);
  const [homeLineup, setHomeLineup] = useState(null);
  const [awayLineup, setAwayLineup] = useState(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [economy, setEconomy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showIntro, setShowIntro] = useState(false);
  const [tab, setTab] = useState('previa');
  const timerRef = useRef(null);

  useEffect(() => {
    load();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const info = await api.getGame(id);
      setGame(info.game);
      setHomeTeam(info.homeTeam);
      setAwayTeam(info.awayTeam);
      setHomeLineup(info.homeLineup);
      setAwayLineup(info.awayLineup);
      setEconomy(null);

      if (info.game.status === 'finished') {
        setShowIntro(false);
        setTab('envivo');
        setEvents(info.events);
        setVisibleEvents(info.events);
        setScore({ home: info.game.home_score, away: info.game.away_score });
      } else {
        setShowIntro(true);
        setTab('previa');
        setEvents([]);
        setVisibleEvents([]);
        setScore({ home: 0, away: 0 });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulate() {
    setError('');
    setLoading(true);
    setTab('envivo');
    try {
      const result = await api.simulateGame(id);
      setHomeTeam(result.homeTeam);
      setAwayTeam(result.awayTeam);
      setHomeLineup(result.homeLineup);
      setAwayLineup(result.awayLineup);
      setEvents(result.events);
      setEconomy({ ...result.economy, isUserHome: result.isUserHome });
      setVisibleEvents([]);
      setScore({ home: 0, away: 0 });
      setLoading(false);
      playEvents(result.events, result.homeScore, result.awayScore);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function handleAdvanceDay() {
    setError('');
    setLoading(true);
    try {
      await advanceDayAndRoute({ navigate, refreshTeam });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function playEvents(allEvents, finalHome, finalAway) {
    let idx = 0;
    let homeRuns = 0;
    let awayRuns = 0;

    function step() {
      if (idx >= allEvents.length) {
        setScore({ home: finalHome, away: finalAway });
        return;
      }
      const ev = allEvents[idx];
      if (ev.half === 'top') awayRuns += ev.runs_scored;
      else homeRuns += ev.runs_scored;

      setVisibleEvents((prev) => [...prev, ev]);
      setScore({ home: homeRuns, away: awayRuns });
      idx++;
      timerRef.current = setTimeout(step, 180);
    }
    step();
  }

  if (loading && !homeTeam) return <p>Cargando partido...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!game) return null;

  const finished =
    game.status === 'finished' || (visibleEvents.length === events.length && events.length > 0);

  // Estado actual derivado del último evento visible
  const currentEvent = visibleEvents[visibleEvents.length - 1];
  const currentOuts = currentEvent ? Math.min(currentEvent.outs_after, 3) : 0;
  const currentBases =
    currentEvent && currentEvent.bases_after && currentEvent.outs_after < 3
      ? currentEvent.bases_after
      : [false, false, false];

  // Marcador por inning
  const inningScores = {};
  visibleEvents.forEach((ev) => {
    if (!inningScores[ev.inning]) inningScores[ev.inning] = { home: 0, away: 0 };
    if (ev.half === 'bot') inningScores[ev.inning].home += ev.runs_scored;
    else inningScores[ev.inning].away += ev.runs_scored;
  });
  const maxInning = Math.max(9, ...Object.keys(inningScores).map(Number));
  const innings = Array.from({ length: maxInning }, (_, i) => i + 1);

  const nameMap = buildNameMap(homeLineup, awayLineup);
  const batterName = currentEvent ? nameMap[currentEvent.player_id] : '';
  const pitcherName = currentEvent
    ? currentEvent.half === 'top'
      ? homeLineup?.pitcher?.name
      : awayLineup?.pitcher?.name
    : '';

  const headerStatus = finished ? 'FINAL' : visibleEvents.length > 0 ? 'EN VIVO' : 'PROGRAMADO';
  const canPlay = game.status !== 'finished' && visibleEvents.length === 0;

  return (
    <div className="space-y-4">
      {showIntro && homeTeam && awayTeam && (
        <GameIntro homeTeam={homeTeam} awayTeam={awayTeam} onFinish={() => setShowIntro(false)} />
      )}

      <div className="flex items-center justify-between gap-3">
        <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline">
          ← Volver al Dashboard
        </button>
        <TabSwitcher tab={tab} onChange={setTab} />
      </div>

      <MatchupHeader
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        score={score}
        status={headerStatus}
        canPlay={canPlay}
        loading={loading}
        onPlay={handleSimulate}
      />

      {tab === 'previa' && (
        <>
          <PitchersCard
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeLineup={homeLineup}
            awayLineup={awayLineup}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LineupCard team={awayTeam} lineup={awayLineup} />
            <LineupCard team={homeTeam} lineup={homeLineup} />
          </div>
        </>
      )}

      {tab === 'envivo' && (
        <>
          <LineScore
            innings={innings}
            inningScores={inningScores}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeTotal={score.home}
            awayTotal={score.away}
            live={visibleEvents.length > 0 && !finished}
            inningLabel={halfInningLabel(currentEvent)}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
            <LivePanel
              currentEvent={currentEvent}
              batterName={batterName}
              pitcherName={pitcherName}
              bases={currentBases}
              outs={currentOuts}
            />
            <PlayByPlayFeed
              events={visibleEvents}
              nameMap={nameMap}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          </div>

          {economy && (
            <div className="bg-white rounded-lg shadow p-4 text-sm">
              <h3 className="font-bold mb-2">Resultado económico</h3>
              {economy.isUserHome ? (
                <ul className="space-y-1 text-gray-700">
                  <li>Asistencia: {economy.attendance}</li>
                  <li>Ingresos por entradas: ${economy.ticketRevenue.toLocaleString()}</li>
                  <li>Merchandising: ${economy.merchRevenue.toLocaleString()}</li>
                  <li>Costos operativos: -${economy.operatingCost.toLocaleString()}</li>
                  <li className="font-bold">Neto: ${economy.total.toLocaleString()}</li>
                </ul>
              ) : (
                <p>Merchandising (visitante): ${economy.merchRevenue.toLocaleString()}</p>
              )}
            </div>
          )}
        </>
      )}

      {finished && game.status !== 'finished' && (
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="bg-gray-200 text-gray-800 px-6 py-2 rounded font-semibold hover:bg-gray-300"
          >
            ← Volver al Dashboard
          </button>
          <button
            onClick={handleAdvanceDay}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Avanzando...' : 'Avanzar Día'}
          </button>
        </div>
      )}
    </div>
  );
}
