import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';
import { formatCompactMoney } from '../utils/formatMoney.js';

const MAX_ROSTER_SIZE = 25;

export default function TeamsOverview() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTeamsOverview()
      .then(setTeams)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-10 text-gray-400">Cargando equipos...</div>;
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-800">Equipos</h2>
      <p className="text-sm text-gray-500 mb-4">
        Revenue estimado por temporada, budget y disposición a pagar por un jugador solo aplican a equipos CPU.
      </p>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2">Equipo</th>
              <th className="px-3 py-2">División</th>
              <th className="px-3 py-2">Roster</th>
              <th className="px-3 py-2">Budget</th>
              <th className="px-3 py-2">Revenue est./temporada</th>
              <th className="px-3 py-2">Máx. puja</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className={`border-t ${t.is_user_team ? 'bg-blue-100 font-bold' : ''}`}>
                <td className="px-3 py-2"><TeamBadge name={t.name} /></td>
                <td className="px-3 py-2 text-gray-500">{t.division_name}</td>
                <td className="px-3 py-2">{t.roster_count} / {MAX_ROSTER_SIZE}</td>
                <td className="px-3 py-2">{t.budget != null ? formatCompactMoney(t.budget) : '—'}</td>
                <td className="px-3 py-2">
                  {t.revenue_min != null
                    ? `${formatCompactMoney(t.revenue_min)} – ${formatCompactMoney(t.revenue_max)}`
                    : '—'}
                </td>
                <td className="px-3 py-2">
                  {t.max_bid_amount != null
                    ? `${t.bid_aggressiveness_pct.toFixed(1)}% (${formatCompactMoney(t.max_bid_amount)})`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
