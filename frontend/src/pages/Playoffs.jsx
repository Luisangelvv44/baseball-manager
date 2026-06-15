import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const ROUND_LABELS = { 1: 'Cuartos de Final', 2: 'Semifinales', 3: 'Gran Final' };
const USER_TEAM_ID = 1;

function SeriesCard({ series, onSimulate, onPlay, disabled }) {
  const isCompleted = series.status === 'completed';
  const nextGame = series.games.find((g) => g.status === 'scheduled');
  const isUserSeries = nextGame?.is_user_game;

  const homeWinRate = series.wins_needed;
  const totalPossible = homeWinRate * 2 - 1;

  return (
    <div
      className={`border rounded-lg p-3 text-sm bg-white shadow-sm ${
        isCompleted ? 'opacity-70' : ''
      }`}
    >
      <div className="flex justify-between items-center gap-2 mb-1">
        <span
          className={`font-semibold truncate ${
            isCompleted && series.winner_id === series.home_team_id
              ? 'text-green-700'
              : ''
          }`}
        >
          {series.home_team.name}
        </span>
        <span className="text-lg font-bold text-gray-800 shrink-0">
          {series.home_wins}
        </span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span
          className={`font-semibold truncate ${
            isCompleted && series.winner_id === series.away_team_id
              ? 'text-green-700'
              : ''
          }`}
        >
          {series.away_team.name}
        </span>
        <span className="text-lg font-bold text-gray-800 shrink-0">
          {series.away_wins}
        </span>
      </div>

      <p className="text-xs text-gray-400 mt-1">Mejor de {totalPossible}</p>

      {isCompleted ? (
        <p className="mt-2 text-xs font-semibold text-green-700">
          Ganador: {series.winner.name}
        </p>
      ) : nextGame ? (
        isUserSeries ? (
          <button
            onClick={() => onPlay(nextGame.id)}
            disabled={disabled}
            className="mt-2 w-full bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Jugar partido
          </button>
        ) : (
          <button
            onClick={() => onSimulate(series.id)}
            disabled={disabled}
            className="mt-2 w-full bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            Simular
          </button>
        )
      ) : null}
    </div>
  );
}

function RoundColumn({ round, series, onSimulate, onPlay, disabled }) {
  return (
    <div className="flex flex-col gap-3 min-w-[200px]">
      <h3 className="font-bold text-center text-gray-700 text-sm border-b pb-1">
        {ROUND_LABELS[round] ?? `Ronda ${round}`}
      </h3>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {series.map((s) => (
          <SeriesCard
            key={s.id}
            series={s}
            onSimulate={onSimulate}
            onPlay={onPlay}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

export default function Playoffs() {
  const [series, setSeries] = useState([]);
  const [seasonStatus, setSeasonStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function load() {
    try {
      const data = await api.getPlayoffs();
      setSeries(data.series ?? []);
      setSeasonStatus(data.season_status);
    } catch (err) {
      setMessage(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const round1 = series.filter((s) => s.round === 1);
  const round2 = series.filter((s) => s.round === 2);
  const round3 = series.filter((s) => s.round === 3);

  const currentRound = series.length ? Math.max(...series.map((s) => s.round)) : 0;
  const currentRoundSeries = series.filter((s) => s.round === currentRound);
  const allCurrentComplete =
    currentRoundSeries.length > 0 && currentRoundSeries.every((s) => s.status === 'completed');

  const nextRoundExists = series.some((s) => s.round === currentRound + 1);
  const champion = round3.length > 0 && round3[0].status === 'completed' ? round3[0].winner : null;

  // CPU series with a pending game in the current round
  const cpuPending = currentRoundSeries.some(
    (s) =>
      s.status === 'active' &&
      s.home_team_id !== USER_TEAM_ID &&
      s.away_team_id !== USER_TEAM_ID &&
      s.games.some((g) => g.status === 'scheduled')
  );

  async function handleSimulate(seriesId) {
    setLoading(true);
    setMessage('');
    try {
      await api.simulatePlayoffGame(seriesId);
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulateRound() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api.simulatePlayoffRound();
      setSeries(data.series ?? []);
      setMessage('Series CPU simuladas.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdvanceRound() {
    setLoading(true);
    setMessage('');
    try {
      const data = await api.advancePlayoffRound();
      setSeries(data.series ?? []);
      if (data.champion) {
        setSeasonStatus('finished');
        await load();
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (series.length === 0 && seasonStatus !== 'playoffs') {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        <p className="text-lg font-semibold mb-2">No hay playoffs activos</p>
        <p className="text-sm">Los playoffs comenzarán al terminar la temporada regular.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold">Playoffs</h2>
        <div className="flex gap-2 items-center flex-wrap">
          {cpuPending && !allCurrentComplete && (
            <button
              onClick={handleSimulateRound}
              disabled={loading}
              className="bg-gray-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-gray-700 disabled:opacity-50"
            >
              Simular series CPU
            </button>
          )}
          {allCurrentComplete && !nextRoundExists && currentRound < 3 && (
            <button
              onClick={handleAdvanceRound}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              Avanzar a {ROUND_LABELS[currentRound + 1] ?? `Ronda ${currentRound + 1}`}
            </button>
          )}
          {allCurrentComplete && currentRound === 3 && seasonStatus !== 'finished' && (
            <button
              onClick={handleAdvanceRound}
              disabled={loading}
              className="bg-yellow-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50"
            >
              Coronar Campeón
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">
          {message}
        </div>
      )}

      {champion && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 text-center">
          <p className="text-3xl mb-1">🏆</p>
          <p className="text-xl font-bold text-yellow-800">{champion.name}</p>
          <p className="text-yellow-700 text-sm mt-1">¡Campeón de la temporada!</p>
        </div>
      )}

      {/* Bracket */}
      <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
        <div className="flex gap-6 min-w-max">
          {round1.length > 0 && (
            <RoundColumn
              round={1}
              series={round1}
              onSimulate={handleSimulate}
              onPlay={(id) => navigate(`/game/${id}`)}
              disabled={loading}
            />
          )}

          {/* Arrow connector */}
          {round2.length > 0 && (
            <>
              <div className="flex items-center text-gray-300 text-2xl self-center">›</div>
              <RoundColumn
                round={2}
                series={round2}
                onSimulate={handleSimulate}
                onPlay={(id) => navigate(`/game/${id}`)}
                disabled={loading}
              />
            </>
          )}

          {round3.length > 0 && (
            <>
              <div className="flex items-center text-gray-300 text-2xl self-center">›</div>
              <RoundColumn
                round={3}
                series={round3}
                onSimulate={handleSimulate}
                onPlay={(id) => navigate(`/game/${id}`)}
                disabled={loading}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
