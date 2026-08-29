import { Link, useLocation } from 'react-router-dom';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from './TeamBadge.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/news', label: 'Noticias' },
  { to: '/schedule', label: 'Calendario' },
  { to: '/roster', label: 'Roster' },
  { to: '/rookie', label: 'Rookie' },
  { to: '/lineup', label: 'Lineup' },
  { to: '/market', label: 'Mercado' },
  { to: '/trades', label: 'Traspasos' },
  { to: '/stars', label: 'Estrellas' },
  { to: '/derby', label: 'Eventos' },
  { to: '/stadium', label: 'Estadio' },
  { to: '/scouts', label: 'Scouts' },
  { to: '/coaches', label: 'Coaches' },
  { to: '/finances', label: 'Finanzas' },
  { to: '/teams-overview', label: 'Equipos' },
  { to: '/broadcast', label: 'Transmisión' },
  { to: '/playoffs', label: 'Playoffs' },
  { to: '/draft', label: 'Draft' },
  { to: '/history', label: 'Históricos' },
];

export default function Navbar() {
  const location = useLocation();
  const { myTeam } = useTeam();

  const budget = myTeam ? `$${Number(myTeam.budget).toLocaleString()}` : '-';
  const fans = myTeam ? `${(myTeam.fan_base ?? 0).toLocaleString()} fans` : '-';
  const rep = myTeam ? `Rep: ${myTeam.reputation}` : '-';

  return (
    <div className="bg-gray-900 text-white">
      {/* Main header */}
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="font-bold text-lg shrink-0">⚾ Baseball Manager</Link>
        {myTeam && <TeamBadge name={myTeam.name} size="md" className="text-white font-semibold" />}
        <div className="flex items-center gap-4 text-sm text-gray-300">
          <span className="font-semibold text-green-400">{budget}</span>
          <span>{fans}</span>
          <span>{rep}</span>
          <Link
            to="/jerseys"
            title="Camisetas"
            aria-label="Camisetas"
            className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
              location.pathname === '/jerseys'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8.5 3 4 5.2 2 9.4l3 1.6.6-1.3V21h12.8V9.7l.6 1.3 3-1.6-2-4.2L15.5 3a3.5 3.5 0 0 1-7 0Z" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Sub-header nav */}
      <div className="bg-gray-800 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-0.5 h-9">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-2.5 py-1 rounded text-xs ${
                location.pathname === link.to ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
