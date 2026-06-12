import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const RESULT_LABELS = {
  SO: 'Strikeout (K)',
  GO: 'Out en rodado',
  FO: 'Out de fly',
  '1B': 'Sencillo',
  '2B': 'Doble',
  '3B': 'Triple',
  HR: '¡Jonron!',
  BB: 'Base por bolas',
};

export default function GameView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [homeTeam, setHomeTeam] = useState(null);
  const [awayTeam, setAwayTeam] = useState(null);
  const [events, setEvents] = useState([]);
  const [visibleEvents, setVisibleEvents] = useState([]);
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

  const finished = game.status === 'finished' || visibleEvents.length === events.length && events.length > 0;

  return (
    <div className="space-y-4">
      <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline">
        ← Volver al Dashboard
      </button>

      <div className="bg-white rounded-lg shadow p-6 text-center">
        <h2 className="text-xl font-bold mb-2">
          {awayTeam?.name} <span className="text-gray-400">@</span> {homeTeam?.name}
        </h2>
        <div className="flex justify-center items-center gap-8 text-4xl font-bold">
          <div className="flex flex-col items-center">
            <span>{score.away}</span>
            <span className="text-sm font-normal text-gray-500 mt-1">{awayTeam?.name}</span>
          </div>
          <span className="text-gray-300">-</span>
          <div className="flex flex-col items-center">
            <span>{score.home}</span>
            <span className="text-sm font-normal text-gray-500 mt-1">{homeTeam?.name}</span>
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

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Play by play</h3>
        <div className="max-h-96 overflow-y-auto space-y-1 text-sm">
          {visibleEvents.length === 0 && <p className="text-gray-400">Aun no hay jugadas.</p>}
          {visibleEvents.map((ev, idx) => (
            <div key={idx} className="border-b py-1">
              <span className="text-gray-400 mr-2">
                {ev.half === 'top' ? 'Alta' : 'Baja'} {ev.inning}
              </span>
              {RESULT_LABELS[ev.result] || ev.result}
              {ev.runs_scored > 0 && <span className="text-green-700 font-semibold ml-2">+{ev.runs_scored} carrera(s)</span>}
            </div>
          ))}
        </div>
      </div>

      {finished && game.status !== 'finished' && (
        <div className="text-center">
          <button onClick={() => navigate('/')} className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700">
            Continuar
          </button>
        </div>
      )}
    </div>
  );
}
