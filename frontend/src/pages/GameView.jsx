import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';

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

function PitchersCard({ homeTeam, awayTeam, homeLineup, awayLineup }) {
  if (!homeLineup?.pitcher || !awayLineup?.pitcher) return null;

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold mb-3">Pitchers</h3>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-gray-500 mb-1"><TeamBadge name={awayTeam?.name} /></div>
          <div className="font-semibold">{awayLineup.pitcher.name}</div>
          <div className="text-gray-600">Skill: {awayLineup.pitcher.current_skill}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1"><TeamBadge name={homeTeam?.name} /></div>
          <div className="font-semibold">{homeLineup.pitcher.name}</div>
          <div className="text-gray-600">Skill: {homeLineup.pitcher.current_skill}</div>
        </div>
      </div>
    </div>
  );
}

function LineupTable({ teamName, lineup }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-bold mb-2"><TeamBadge name={teamName} /></h3>
      {lineup?.batters?.length > 0 ? (
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="p-1 w-6">#</th>
              <th className="p-1">Nombre</th>
              <th className="p-1">Pos</th>
              <th className="p-1">Skill</th>
            </tr>
          </thead>
          <tbody>
            {lineup.batters.map((p, idx) => (
              <tr key={p.id} className="border-t">
                <td className="p-1 text-gray-400">{idx + 1}</td>
                <td className="p-1">{p.name}</td>
                <td className="p-1">{p.position}</td>
                <td className="p-1">{p.current_skill}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-400 text-sm">Lineup no disponible.</p>
      )}
    </div>
  );
}

function InningScoreboard({ innings, inningScores, homeTeam, awayTeam, homeTotal, awayTotal }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
      <table className="text-sm text-center w-full">
        <thead>
          <tr className="text-gray-500 border-b">
            <th className="text-left pr-4 py-1 font-medium min-w-[80px]">Equipo</th>
            {innings.map((n) => (
              <th key={n} className="px-2 py-1 font-medium w-8">{n}</th>
            ))}
            <th className="px-3 py-1 font-bold border-l">R</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className="text-left pr-4 py-1 font-semibold max-w-[80px]"><TeamBadge name={awayTeam?.name} /></td>
            {innings.map((n) => (
              <td key={n} className="px-2 py-1">
                {inningScores[n] !== undefined ? inningScores[n].away : '-'}
              </td>
            ))}
            <td className="px-3 py-1 font-bold border-l">{awayTotal}</td>
          </tr>
          <tr>
            <td className="text-left pr-4 py-1 font-semibold max-w-[80px]"><TeamBadge name={homeTeam?.name} /></td>
            {innings.map((n) => (
              <td key={n} className="px-2 py-1">
                {inningScores[n] !== undefined ? inningScores[n].home : '-'}
              </td>
            ))}
            <td className="px-3 py-1 font-bold border-l">{homeTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function GameView() {
  const { id } = useParams();
  const navigate = useNavigate();
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

      if (info.game.status === 'finished') {
        setEvents(info.events);
        setVisibleEvents(info.events);
        setScore({ home: info.game.home_score, away: info.game.away_score });
      } else {
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

  const finished = game.status === 'finished' || (visibleEvents.length === events.length && events.length > 0);

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

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline">
        ← Volver al Dashboard
      </button>

      {/* Marcador total */}
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-2 flex items-center justify-center gap-2">
          <TeamBadge name={awayTeam?.name} /> <span className="text-gray-400">@</span> <TeamBadge name={homeTeam?.name} />
        </h2>
        <div className="flex justify-center items-center gap-8 text-4xl font-bold">
          <div className="flex flex-col items-center">
            <span>{score.away}</span>
            <span className="text-sm font-normal text-gray-500 mt-1"><TeamBadge name={awayTeam?.name} /></span>
          </div>
          <span className="text-gray-300">-</span>
          <div className="flex flex-col items-center">
            <span>{score.home}</span>
            <span className="text-sm font-normal text-gray-500 mt-1"><TeamBadge name={homeTeam?.name} /></span>
          </div>
        </div>

        {game.status !== 'finished' && (
          <button
            onClick={handleSimulate}
            disabled={loading}
            className="mt-4 bg-green-600 text-white px-6 py-2 rounded font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Simulando...' : 'Jugar Partido'}
          </button>
        )}
      </div>

      {/* Panel de estado en juego: inning + diamante + outs */}
      {visibleEvents.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 flex gap-8 items-center justify-center">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              {currentEvent?.half === 'top' ? 'Alta' : 'Baja'}
            </div>
            <div className="text-3xl font-bold">{currentEvent?.inning}</div>
          </div>
          <BasesDiamond bases={currentBases} />
          <OutsIndicator outs={currentOuts} />
        </div>
      )}

      {/* Marcador por inning */}
      {visibleEvents.length > 0 && (
        <InningScoreboard
          innings={innings}
          inningScores={inningScores}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          homeTotal={score.home}
          awayTotal={score.away}
        />
      )}

      {/* Resultado económico */}
      {economy && (
        <div className="bg-white rounded-lg shadow p-4 text-sm">
          <h3 className="font-bold mb-2">Resultado economico</h3>
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

      {/* Pitchers */}
      <PitchersCard homeTeam={homeTeam} awayTeam={awayTeam} homeLineup={homeLineup} awayLineup={awayLineup} />

      {/* Lineups */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LineupTable teamName={awayTeam?.name} lineup={awayLineup} />
        <LineupTable teamName={homeTeam?.name} lineup={homeLineup} />
      </div>

      {finished && game.status !== 'finished' && (
        <div className="text-center">
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700"
          >
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}
