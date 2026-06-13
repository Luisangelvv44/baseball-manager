import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Schedule() {
  const [games, setGames] = useState([]);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [scheduleData, seasonData] = await Promise.all([
          api.getSchedule(),
          api.getSeason(),
        ]);
        setGames(scheduleData);
        setSeason(seasonData);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="text-center py-10 text-gray-500">Cargando calendario...</div>;

  if (!season) {
    return (
      <div className="text-center py-10 text-gray-500">
        No hay temporada activa. Inicia una desde el Dashboard.
      </div>
    );
  }

  // Agrupar partidos por dia
  const byDay = games.reduce((acc, g) => {
    if (!acc[g.day_number]) acc[g.day_number] = [];
    acc[g.day_number].push(g);
    return acc;
  }, {});

  const sortedDays = Object.keys(byDay)
    .map(Number)
    .sort((a, b) => a - b);

  const preSeasonDays = season.preSeasonDays ?? 0;
  const currentDay = season.current_day;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-bold">Calendario — Temporada {season.year}</h2>
        {currentDay <= preSeasonDays && (
          <p className="text-yellow-700 text-sm mt-1">
            Pre-temporada activa · Quedan {preSeasonDays - currentDay + 1} dias para el inicio
          </p>
        )}
      </div>

      {sortedDays.map((dayNum) => {
        const dayGames = byDay[dayNum];
        const gameDay = dayNum - preSeasonDays;
        const isPast = dayNum < currentDay;
        const isToday = dayNum === currentDay;
        const hasUserGame = dayGames.some((g) => g.is_user_game);

        return (
          <div
            key={dayNum}
            className={`rounded-lg shadow overflow-hidden border-l-4 ${
              hasUserGame ? 'border-blue-500' : 'border-transparent'
            }`}
          >
            <div
              className={`px-4 py-2 flex items-center justify-between ${
                isToday
                  ? 'bg-blue-600 text-white'
                  : isPast
                  ? 'bg-gray-200 text-gray-600'
                  : 'bg-gray-800 text-white'
              }`}
            >
              <span className="font-semibold">
                Dia {gameDay}
                {isToday && ' — HOY'}
              </span>
              {hasUserGame && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isToday ? 'bg-white text-blue-700' : 'bg-blue-500 text-white'}`}>
                  Tu partido
                </span>
              )}
            </div>

            <div className="bg-white divide-y divide-gray-100">
              {dayGames.map((g) => {
                const finished = g.status === 'finished';
                const isUserGame = g.is_user_game;
                return (
                  <div
                    key={g.id}
                    onClick={() => finished && isUserGame && navigate(`/game/${g.id}`)}
                    className={`px-4 py-2 flex items-center justify-between text-sm ${
                      isUserGame ? 'bg-blue-50' : ''
                    } ${finished && isUserGame ? 'cursor-pointer hover:bg-blue-100' : ''}`}
                  >
                    <span className={isUserGame ? 'font-semibold text-blue-900' : 'text-gray-700'}>
                      {g.away_team?.name ?? '—'} @ {g.home_team?.name ?? '—'}
                    </span>
                    <span className={finished ? 'text-gray-800 font-mono' : 'text-gray-400'}>
                      {finished ? `${g.away_score} – ${g.home_score}` : 'Pendiente'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
