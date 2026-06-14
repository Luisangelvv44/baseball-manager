import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/schedule', label: 'Calendario' },
  { to: '/roster', label: 'Roster' },
  { to: '/lineup', label: 'Lineup' },
  { to: '/market', label: 'Mercado' },
  { to: '/stadium', label: 'Estadio' },
  { to: '/scouts', label: 'Scouts' },
  { to: '/finances', label: 'Finanzas' },
  { to: '/broadcast', label: 'Transmisión' },
];

export default function Navbar() {
  const location = useLocation();

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/" className="font-bold text-lg">⚾ Baseball Manager</Link>
        <div className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-2 rounded text-sm ${
                location.pathname === link.to ? 'bg-blue-600' : 'hover:bg-gray-700'
              }`}
            >
              {link.label}
            </Link>
          ))}
          <Link to="/newgame" className="px-3 py-2 rounded text-sm text-red-300 hover:bg-gray-700">
            Nueva Partida
          </Link>
        </div>
      </div>
    </nav>
  );
}
