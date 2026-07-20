import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

const ROUND_LABELS = { 1: 'Cuartos de Final', 2: 'Semifinales', 3: 'Gran Final' };

function SeriesCard({ series, onPlay, disabled }) {
  const isCompleted = series.status === 'completed';
  const nextGame = series.games.find((g) => g.status === 'scheduled');
  const isUserSeries = nextGame?.is_user_game;

  const totalPossible = series.wins_needed * 2 - 1;

  return (
    <div
      className={`border rounded-lg p-3 text-sm bg-white shadow-sm ${
        isCompleted ? 'opacity-70' : ''
      }`}
    >
      <div className="flex justify-between items-center gap-2 mb-1">
        <span
          className={`font-semibold truncate ${
            isCompleted && series.winner_id === series.home_team_id ? 'text-green-700' : ''
          }`}
        >
          <TeamBadge name={series.home_team.name} />
        </span>
        <span className="text-lg font-bold text-gray-800 shrink-0">{series.home_wins}</span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span
          className={`font-semibold truncate ${
            isCompleted && series.winner_id === series.away_team_id ? 'text-green-700' : ''
          }`}
        >
          <TeamBadge name={series.away_team.name} />
        </span>
        <span className="text-lg font-bold text-gray-800 shrink-0">{series.away_wins}</span>
      </div>

      <p className="text-xs text-gray-400 mt-1">Mejor de {totalPossible}</p>

      {isCompleted ? (
        <p className="mt-2 text-xs font-semibold text-green-700 flex items-center gap-1">
          Ganador: <TeamBadge name={series.winner.name} />
        </p>
      ) : nextGame && isUserSeries ? (
        <button
          onClick={() => onPlay(nextGame.id)}
          disabled={disabled}
          className="mt-2 w-full bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Jugar partido
        </button>
      ) : null}
    </div>
  );
}

function RoundColumn({ round, series, onPlay, disabled }) {
  return (
    <div className="flex flex-col gap-3 min-w-[200px]">
      <h3 className="font-bold text-center text-gray-700 text-sm border-b pb-1">
        {ROUND_LABELS[round] ?? `Ronda ${round}`}
      </h3>
      <div className="flex flex-col gap-3 justify-around flex-1">
        {series.map((s) => (
          <SeriesCard key={s.id} series={s} onPlay={onPlay} disabled={disabled} />
        ))}
      </div>
    </div>
  );
}

export default function Playoffs() {
  const { refreshTeam } = useTeam();
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

  const champion = round3.length > 0 && round3[0].status === 'completed' ? round3[0].winner : null;

  async function handleAdvanceDay() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api.advanceDay();
      refreshTeam();
      if (!result.advanced && result.userGameId) {
        navigate(`/game/${result.userGameId}`);
        return;
      }
      if (result.seasonFinished) {
        setMessage('¡La temporada ha terminado!');
        await load();
        return;
      }
      if (result.userGameId) {
        navigate(`/game/${result.userGameId}`);
        return;
      }
      const msg = result.simulated > 0
        ? `${result.simulated} partido(s) simulado(s).`
        : 'Sin partidos CPU pendientes.';
      setMessage(msg);
      await load();
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
        {seasonStatus === 'playoffs' && !champion && (
          <button
            onClick={handleAdvanceDay}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Avanzar Día
          </button>
        )}
      </div>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">
          {message}
        </div>
      )}

      {champion && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 text-center">
          <p className="text-3xl mb-1">🏆</p>
          <TeamBadge name={champion.name} size="md" className="text-xl font-bold text-yellow-800 justify-center" />
          <p className="text-yellow-700 text-sm mt-1">¡Campeón de la temporada!</p>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4 overflow-x-auto">
        <div className="flex gap-6 min-w-max">
          {round1.length > 0 && (
            <RoundColumn
              round={1}
              series={round1}
              onPlay={(id) => navigate(`/game/${id}`)}
              disabled={loading}
            />
          )}
          {round2.length > 0 && (
            <>
              <div className="flex items-center text-gray-300 text-2xl self-center">›</div>
              <RoundColumn
                round={2}
                series={round2}
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
