import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Leaderboard from '../components/Leaderboard.jsx';

export default function Dashboard() {
  const [myTeam, setMyTeam] = useState(null);
  const [teams, setTeams] = useState([]);
  const [season, setSeason] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
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
      await loadAll();
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
      const result = await api.advanceDay();
      if (!result.advanced && result.userGameId) {
        navigate(`/game/${result.userGameId}`);
        return;
      }
      if (result.seasonFinished) {
        setMessage('¡La temporada ha terminado!');
      } else if (result.userGameId) {
        setMessage(`Dia ${result.day}. Tienes un partido hoy.`);
        navigate(`/game/${result.userGameId}`);
        return;
      } else {
        setMessage(`Dia ${result.day}. Sin partido hoy. Se simularon ${result.simulated} partidos.`);
      }
      await loadAll();
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">{myTeam.name}</h2>
          <p className="text-gray-600">
            Presupuesto: <span className="font-semibold text-green-700">${Number(myTeam.budget).toLocaleString()}</span>
            {' · '}Reputacion: {myTeam.reputation}
            {' · '}Record: {myTeam.wins}-{myTeam.losses}
          </p>
        </div>

        <div className="flex gap-2">
          {!season && (
            <button
              onClick={handleStartSeason}
              disabled={loading}
              className="bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              Iniciar Temporada
            </button>
          )}
          {season && season.status === 'active' && (
            <button
              onClick={handleAdvanceDay}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Avanzar Dia
            </button>
          )}
        </div>
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

      {season && season.current_day > season.preSeasonDays && (
        <div className="bg-white rounded-lg shadow p-4 text-sm text-gray-600">
          Temporada {season.year} · Dia {season.current_day - season.preSeasonDays} de {season.total_days - season.preSeasonDays} · Estado: {season.status}
        </div>
      )}

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>
      )}

      <div>
        <h3 className="font-bold text-lg mb-2">Tabla de posiciones</h3>
        <Leaderboard teams={teams} userTeamId={myTeam.id} />
      </div>
    </div>
  );
}
