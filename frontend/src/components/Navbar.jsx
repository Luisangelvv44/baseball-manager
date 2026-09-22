import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Newspaper, Calendar, Users, Sprout, ClipboardList,
  ShoppingCart, ArrowLeftRight, Star, Zap, Landmark, Binoculars,
  UserCog, Wallet, Shield, Radio, Trophy, ListChecks, History,
  Banknote, Shirt, Baby,
} from 'lucide-react';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from './TeamBadge.jsx';
import AlertsBell from './AlertsBell.jsx';
import PlayerSearch from './PlayerSearch.jsx';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/news', label: 'Noticias', icon: Newspaper },
  { to: '/schedule', label: 'Calendario', icon: Calendar },
  { to: '/roster', label: 'Roster', icon: Users },
  { to: '/rookie', label: 'Rookie', icon: Sprout },
  { to: '/lineup', label: 'Lineup', icon: ClipboardList },
  { to: '/market', label: 'Mercado', icon: ShoppingCart },
  { to: '/trades', label: 'Traspasos', icon: ArrowLeftRight },
  { to: '/stars', label: 'Estrellas', icon: Star },
  { to: '/derby', label: 'Eventos', icon: Zap },
  { to: '/stadium', label: 'Estadio', icon: Landmark },
  { to: '/scouts', label: 'Scouts', icon: Binoculars },
  { to: '/coaches', label: 'Coaches', icon: UserCog },
  { to: '/finances', label: 'Finanzas', icon: Wallet },
  { to: '/teams-overview', label: 'Equipos', icon: Shield },
  { to: '/broadcast', label: 'Transmisión', icon: Radio },
  { to: '/playoffs', label: 'Playoffs', icon: Trophy },
  { to: '/draft', label: 'Draft', icon: ListChecks },
  { to: '/history', label: 'Históricos', icon: History },
  { to: '/bank', label: 'Banco', icon: Banknote },
  { to: '/jerseys', label: 'Camisetas', icon: Shirt },
  { to: '/toddlers', label: 'Programa de Toddlers', icon: Baby },
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
          <AlertsBell />
          <PlayerSearch />
        </div>
      </div>

      {/* Sub-header nav */}
      <div className="bg-gray-800 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-0.5 h-11">
          {LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.to}
                to={link.to}
                title={link.label}
                aria-label={link.label}
                className={`w-10 h-10 shrink-0 rounded flex items-center justify-center transition-colors ${
                  location.pathname === link.to ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <Icon size={21} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
