import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useTeam } from '../context/TeamContext.jsx';
import { getTeamJersey } from '../utils/teamJerseys.js';
import { getTeamLogo } from '../utils/teamLogos.js';

const USER_TEAM_ID = 1;

export default function Jerseys() {
  const { myTeam } = useTeam();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    api.getTeams()
      .then((data) => {
        const list = Array.isArray(data) ? [...data] : [];
        list.sort((a, b) => {
          const aUser = a.id === USER_TEAM_ID || (myTeam && a.id === myTeam.id);
          const bUser = b.id === USER_TEAM_ID || (myTeam && b.id === myTeam.id);
          if (aUser && !bUser) return -1;
          if (bUser && !aUser) return 1;
          return 0;
        });
        setTeams(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [myTeam]);

  const total = teams.length;

  const prev = useCallback(() => {
    setIndex((i) => (total ? (i - 1 + total) % total : 0));
  }, [total]);

  const next = useCallback(() => {
    setIndex((i) => (total ? (i + 1) % total : 0));
  }, [total]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next]);

  if (loading) {
    return <div className="text-center py-10 text-gray-400">Cargando camisetas...</div>;
  }

  if (total === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        No hay equipos para mostrar.
      </div>
    );
  }

  const team = teams[index];
  const jersey = getTeamJersey(team.name);
  const logo = getTeamLogo(team.name);

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Camisetas</h2>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <button
            onClick={prev}
            aria-label="Anterior"
            className="w-11 h-11 shrink-0 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex-1 max-w-sm flex items-center justify-center">
            {jersey ? (
              <img src={jersey} alt={`Camiseta de ${team.name}`} className="max-h-[420px] w-auto" />
            ) : (
              <div className="text-gray-400 text-sm py-20">Sin camiseta disponible</div>
            )}
          </div>

          <button
            onClick={next}
            aria-label="Siguiente"
            className="w-11 h-11 shrink-0 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            {logo && <img src={logo} alt="" className="w-8 h-8 rounded-sm" />}
            <span className="text-lg font-semibold text-gray-800">{team.name}</span>
          </div>
          <span className="text-sm text-gray-400">{index + 1} / {total}</span>
        </div>
      </div>
    </div>
  );
}
