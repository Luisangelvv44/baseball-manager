import { Link, useLocation } from 'react-router-dom';
import { useTeam } from '../context/TeamContext.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/schedule', label: 'Calendario' },
  { to: '/roster', label: 'Roster' },
  { to: '/lineup', label: 'Lineup' },
  { to: '/market', label: 'Mercado' },
  { to: '/stadium', label: 'Estadio' },
  { to: '/scouts', label: 'Scouts' },
  { to: '/coaches', label: 'Coaches' },
  { to: '/finances', label: 'Finanzas' },
  { to: '/broadcast', label: 'Transmisión' },
  { to: '/playoffs', label: 'Playoffs' },
  { to: '/draft', label: 'Draft' },
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
        <div className="flex items-center gap-4 text-sm text-gray-300">
          <span className="font-semibold text-green-400">{budget}</span>
          <span>{fans}</span>
          <span>{rep}</span>
          <Link to="/newgame" className="px-3 py-1.5 rounded text-red-300 hover:bg-gray-700 font-medium">
            Nueva Partida
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
