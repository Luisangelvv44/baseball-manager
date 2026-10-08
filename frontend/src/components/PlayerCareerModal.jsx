import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from './TeamBadge.jsx';
import PlayerSpriteLoader from './PlayerSpriteLoader.jsx';
import { formatCompactMoney } from '../utils/formatMoney.js';
import { seasonLabel } from '../utils/seasonLabel.js';

const CONTRACT_STATUS_LABELS = {
  active: 'Vigente',
  expired: 'Terminado',
  replaced: 'Renovado',
  released: 'Liberado',
  traded: 'Traspasado',
  retired: 'Retirado',
};

// Temporadas cubiertas por contrato pero sin juegos: se muestran en 0, atenuadas.
function rowClass(s) {
  return `border-b last:border-0${s.contract_only ? ' text-gray-400' : ''}`;
}

function SeasonCell({ season }) {
  return (
    <td className="py-1 px-2 text-left font-medium">
      {seasonLabel(season.edition)}
      {season.contract_only && <span className="ml-1 text-[10px] font-normal">(sin jugar)</span>}
    </td>
  );
}

export default function PlayerCareerModal({ playerId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getPlayerCareerHistory(playerId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [playerId]);

  const seasons = data?.seasons ?? [];
  const battingRows = seasons.filter((s) => s.batting);
  const pitchingRows = seasons.filter((s) => s.pitching);
  const contracts = data?.contracts ?? [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {error && <p className="text-red-600 text-sm">{error}</p>}

        {!data && !error && (
          <p className="text-center text-gray-500 text-sm py-8">Cargando historial...</p>
        )}

        {data && (
          <>
            <div className="flex items-start gap-4 mb-4">
              <PlayerSpriteLoader playerId={data.player.id} width={110} />
              <div>
                <h3 className="font-bold text-lg mb-1">{data.player.first_name} {data.player.last_name}</h3>
                <p className="text-sm text-gray-500">{data.player.position}</p>
              </div>
            </div>

            {seasons.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-6">
                Sin historial de temporadas jugadas todavía.
              </p>
            ) : (
              <div className="space-y-6">
                {battingRows.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Bateo</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-center">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="py-1 px-2 text-left">Temporada</th>
                            <th className="py-1 px-2 text-left">Equipo</th>
                            <th className="py-1 px-2">G</th>
                            <th className="py-1 px-2">AB</th>
                            <th className="py-1 px-2">H</th>
                            <th className="py-1 px-2">HR</th>
                            <th className="py-1 px-2">RBI</th>
                            <th className="py-1 px-2">AVG</th>
                            <th className="py-1 px-2">BB</th>
                            <th className="py-1 px-2">SO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {battingRows.map((s) => (
                            <tr key={`bat-${s.season_id}-${s.team_id}`} className={rowClass(s)}>
                              <SeasonCell season={s} />
                              <td className="py-1 px-2 text-left"><TeamBadge name={s.team_name} /></td>
                              <td className="py-1 px-2">{s.batting.g}</td>
                              <td className="py-1 px-2">{s.batting.ab}</td>
                              <td className="py-1 px-2">{s.batting.h}</td>
                              <td className="py-1 px-2 font-semibold">{s.batting.hr}</td>
                              <td className="py-1 px-2">{s.batting.rbi}</td>
                              <td className="py-1 px-2">{s.batting.avg ?? '-'}</td>
                              <td className="py-1 px-2">{s.batting.bb}</td>
                              <td className="py-1 px-2">{s.batting.so}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {pitchingRows.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm text-gray-700 mb-2">Pitcheo</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-center">
                        <thead>
                          <tr className="text-xs text-gray-500 border-b">
                            <th className="py-1 px-2 text-left">Temporada</th>
                            <th className="py-1 px-2 text-left">Equipo</th>
                            <th className="py-1 px-2">G</th>
                            <th className="py-1 px-2">W-L</th>
                            <th className="py-1 px-2">IP</th>
                            <th className="py-1 px-2">ERA</th>
                            <th className="py-1 px-2">SO</th>
                            <th className="py-1 px-2">BB</th>
                            <th className="py-1 px-2">WHIP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pitchingRows.map((s) => (
                            <tr key={`pit-${s.season_id}-${s.team_id}`} className={rowClass(s)}>
                              <SeasonCell season={s} />
                              <td className="py-1 px-2 text-left"><TeamBadge name={s.team_name} /></td>
                              <td className="py-1 px-2">{s.pitching.g}</td>
                              <td className="py-1 px-2">{s.pitching.w}-{s.pitching.l}</td>
                              <td className="py-1 px-2">{s.pitching.ip}</td>
                              <td className="py-1 px-2">{s.pitching.era ?? '-'}</td>
                              <td className="py-1 px-2 font-semibold">{s.pitching.so}</td>
                              <td className="py-1 px-2">{s.pitching.bb}</td>
                              <td className="py-1 px-2">{s.pitching.whip ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {contracts.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Contratos</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-center">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b">
                        <th className="py-1 px-2 text-left">Temporadas</th>
                        <th className="py-1 px-2 text-left">Equipo</th>
                        <th className="py-1 px-2">Anual</th>
                        <th className="py-1 px-2">Años</th>
                        <th className="py-1 px-2">Restan</th>
                        <th className="py-1 px-2">Total</th>
                        <th className="py-1 px-2">Bono/logro</th>
                        <th className="py-1 px-2">Bonos pagados</th>
                        <th className="py-1 px-2">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-1 px-2 text-left">
                            {c.start_season_id != null ? seasonLabel(c.start_edition) : 'Próxima'}
                            {c.end_season_id != null && c.end_season_id !== c.start_season_id && ` – ${seasonLabel(c.end_edition)}`}
                            {c.end_season_id == null && c.start_season_id != null && ' – hoy'}
                          </td>
                          <td className="py-1 px-2 text-left">
                            <TeamBadge name={c.team_name} />
                            {c.is_rookie && <span className="ml-1 text-[10px] text-blue-600">Rookie</span>}
                          </td>
                          <td className="py-1 px-2">{formatCompactMoney(c.annual_salary)}</td>
                          <td className="py-1 px-2">{c.total_years}</td>
                          <td className="py-1 px-2">{c.status === 'active' ? c.years_remaining : '-'}</td>
                          <td className="py-1 px-2">{formatCompactMoney(c.total_value)}</td>
                          <td className="py-1 px-2">{c.achievement_bonus > 0 ? formatCompactMoney(c.achievement_bonus) : '-'}</td>
                          <td className="py-1 px-2">{c.bonus_paid_total > 0 ? formatCompactMoney(c.bonus_paid_total) : '-'}</td>
                          <td className="py-1 px-2">
                            <span className={c.status === 'active' ? 'text-green-700 font-medium' : 'text-gray-500'}>
                              {CONTRACT_STATUS_LABELS[c.status] ?? c.status}
                            </span>
                            {c.is_reconstructed && (
                              <span className="ml-1 text-[10px] text-gray-400" title="Reconstruido desde el historial; montos aproximados">aprox.</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <button onClick={onClose} className="w-full mt-5 text-gray-500 text-sm hover:underline">
          Cerrar
        </button>
      </div>
    </div>
  );
}
