import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

const DAY_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_SPLIT = 30;

export default function Schedule() {
  const [games, setGames] = useState([]);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
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
        if (seasonData?.status === 'playoffs') setCurrentMonth(1);
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

  const preSeasonDays = season.preSeasonDays ?? 15;
  const totalRegularDays = season.total_days ?? 45;
  const currentDay = season.current_day;

  // Map playoff day_numbers (>=1000) to display days starting at totalRegularDays+1
  const playoffDayNums = [...new Set(
    games.filter(g => g.day_number >= 1000).map(g => g.day_number)
  )].sort((a, b) => a - b);

  const playoffDisplayMap = Object.fromEntries(
    playoffDayNums.map((dn, i) => [dn, totalRegularDays + 1 + i])
  );

  const toDisplayDay = (dn) => dn < 1000 ? dn : playoffDisplayMap[dn];
  const totalDisplayDays = totalRegularDays + playoffDayNums.length;

  // Group games by display day
  const gamesByDay = {};
  games.forEach(g => {
    const dd = toDisplayDay(g.day_number);
    if (!gamesByDay[dd]) gamesByDay[dd] = [];
    gamesByDay[dd].push(g);
  });

  // Current display day (playoffs keep current_day at totalRegularDays; find first scheduled playoff display day)
  let currentDisplayDay = currentDay;
  if (season.status === 'playoffs') {
    const firstScheduledPlayoff = playoffDayNums.find(dn =>
      gamesByDay[playoffDisplayMap[dn]]?.some(g => g.status === 'scheduled')
    );
    currentDisplayDay = firstScheduledPlayoff
      ? playoffDisplayMap[firstScheduledPlayoff]
      : totalDisplayDays + 1;
  }

  const getMonthDays = (month) =>
    month === 0
      ? Array.from({ length: MONTH_SPLIT }, (_, i) => i + 1)
      : Array.from({ length: totalDisplayDays - MONTH_SPLIT }, (_, i) => MONTH_SPLIT + 1 + i);

  const days = getMonthDays(currentMonth);
  const numRows = Math.ceil(days.length / 7);
  const cells = [...days, ...Array(numRows * 7 - days.length).fill(null)];

  const isPreSeason = (dd) => dd <= preSeasonDays;
  const isPlayoffDay = (dd) => dd > totalRegularDays;
  const isPast = (dd) => dd < currentDisplayDay;
  const isToday = (dd) => dd === currentDisplayDay;

  const monthLabel = currentMonth === 0
    ? 'Pre-temporada / Temporada Regular (1–30)'
    : 'Temporada Regular / Playoffs (31+)';

  // Selected day data
  const selectedGames = selectedDay ? (gamesByDay[selectedDay] || []) : [];
  const selectedIsPreSeason = selectedDay ? isPreSeason(selectedDay) : false;
  const selectedIsPlayoff = selectedDay ? isPlayoffDay(selectedDay) : false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-xl font-bold">Calendario — Temporada {season.year}</h2>
        {currentDay <= preSeasonDays && (
          <p className="text-yellow-700 text-sm mt-1">
            Pre-temporada activa · Quedan {preSeasonDays - currentDay + 1} días para el inicio
          </p>
        )}
      </div>

      {/* Month navigator */}
      <div className="bg-white rounded-lg shadow p-3 flex items-center justify-between">
        <button
          onClick={() => setCurrentMonth(0)}
          disabled={currentMonth === 0}
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg"
        >
          ‹
        </button>
        <span className="font-semibold text-gray-700 text-sm">{monthLabel}</span>
        <button
          onClick={() => setCurrentMonth(1)}
          disabled={currentMonth === 1}
          className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-lg"
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-lg shadow p-4">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-xs font-bold text-gray-500 py-1">{h}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dd, idx) => {
            if (dd === null) {
              return <div key={`empty-${idx}`} className="h-20 rounded bg-gray-50" />;
            }

            const dayGames = gamesByDay[dd] || [];
            const hasUserGame = dayGames.some(g => g.is_user_game);
            const preSeason = isPreSeason(dd);
            const playoff = isPlayoffDay(dd);
            const past = isPast(dd);
            const today = isToday(dd);
            const gameCount = dayGames.length;

            let cellBg = 'bg-gray-50 hover:bg-gray-100';
            if (today) cellBg = 'bg-blue-600 text-white hover:bg-blue-700';
            else if (past) cellBg = 'bg-gray-100 hover:bg-gray-200';
            else if (!preSeason) cellBg = 'bg-gray-800 text-white hover:bg-gray-700';

            return (
              <button
                key={dd}
                onClick={() => setSelectedDay(dd)}
                className={`h-20 rounded p-1.5 flex flex-col items-start relative transition-colors ${cellBg} ${today ? '' : past ? 'opacity-70' : ''}`}
              >
                {/* Day number */}
                <span className={`text-xs font-bold ${today ? 'text-white' : past ? 'text-gray-500' : preSeason ? 'text-gray-600' : 'text-gray-300'}`}>
                  {dd}
                </span>

                {/* Badges */}
                <div className="mt-auto w-full space-y-0.5">
                  {preSeason && (
                    <span className="block text-center text-[9px] px-1 py-0.5 rounded bg-yellow-200 text-yellow-800 font-medium leading-tight truncate">
                      Pre-T
                    </span>
                  )}
                  {playoff && (
                    <span className="block text-center text-[9px] px-1 py-0.5 rounded bg-purple-200 text-purple-800 font-medium leading-tight truncate">
                      Playoff
                    </span>
                  )}
                  {!preSeason && gameCount > 0 && (
                    <span className={`block text-center text-[9px] px-1 py-0.5 rounded font-medium leading-tight ${today ? 'bg-white/20 text-white' : past ? 'bg-gray-300 text-gray-600' : 'bg-white/10 text-gray-300'}`}>
                      {gameCount} {gameCount === 1 ? 'partido' : 'partidos'}
                    </span>
                  )}
                </div>

                {/* User game dot */}
                {hasUserGame && !preSeason && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400" />
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-600 inline-block" /> Hoy</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-800 inline-block" /> Próximo</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border inline-block" /> Pasado</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> Pre-temporada</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 inline-block" /> Playoffs</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Tu partido</span>
        </div>
      </div>

      {/* Day detail modal */}
      {selectedDay !== null && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className={`px-5 py-4 rounded-t-xl flex items-center justify-between ${
              isToday(selectedDay)
                ? 'bg-blue-600 text-white'
                : isPast(selectedDay)
                ? 'bg-gray-200 text-gray-700'
                : 'bg-gray-800 text-white'
            }`}>
              <div>
                <h3 className="font-bold text-lg">Día {selectedDay}</h3>
                <div className="flex gap-2 mt-0.5">
                  {selectedIsPreSeason && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-800 font-medium">Pre-temporada</span>
                  )}
                  {selectedIsPlayoff && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 font-medium">Playoffs</span>
                  )}
                  {isToday(selectedDay) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">HOY</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="text-2xl leading-none opacity-70 hover:opacity-100 font-light"
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
              {selectedIsPreSeason ? (
                <div className="px-5 py-8 text-center text-gray-500">
                  <p className="text-4xl mb-3">⚾</p>
                  <p className="font-medium">Día de pre-temporada</p>
                  <p className="text-sm mt-1">Sin partidos programados. La temporada comienza en el día {preSeasonDays + 1}.</p>
                </div>
              ) : selectedGames.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-500">
                  <p className="text-sm">Sin partidos para este día.</p>
                </div>
              ) : (
                selectedGames.map(g => {
                  const finished = g.status === 'finished';
                  const isUserGame = g.is_user_game;
                  return (
                    <div
                      key={g.id}
                      onClick={() => finished && isUserGame && navigate(`/game/${g.id}`)}
                      className={`px-5 py-3 flex items-center justify-between text-sm ${
                        isUserGame ? 'bg-blue-50' : ''
                      } ${finished && isUserGame ? 'cursor-pointer hover:bg-blue-100' : ''}`}
                    >
                      <div className="flex flex-col">
                        <span className={isUserGame ? 'font-semibold text-blue-900' : 'text-gray-700'}>
                          {g.away_team?.name ?? '—'} @ {g.home_team?.name ?? '—'}
                        </span>
                        {isUserGame && (
                          <span className="text-xs text-blue-500 font-medium">Tu partido{finished ? ' · Ver resumen →' : ''}</span>
                        )}
                      </div>
                      <span className={`font-mono ${finished ? 'text-gray-800 font-semibold' : 'text-gray-400'}`}>
                        {finished ? `${g.away_score} – ${g.home_score}` : 'Pendiente'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
