import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

function StatsModal({ player, stats, onClose }) {
  const isPitcher = player.position === 'P';
  const b = stats?.batting;
  const p = stats?.pitching;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {player.first_name} {player.last_name}
            <span className="ml-2 text-sm font-normal text-gray-500">{player.position}</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>

        {isPitcher ? (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Lanzamiento</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['G', p?.g ?? 0],
                ['W-L', p ? `${p.w}-${p.l}` : '0-0'],
                ['IP', p?.ip ?? '0.0'],
                ['ERA', p?.era ?? '—'],
                ['SO', p?.so ?? 0],
                ['BB', p?.bb ?? 0],
                ['WHIP', p?.whip ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-bold text-sm">{value}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Bateo</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['G', b?.g ?? 0],
                ['AB', b?.ab ?? 0],
                ['H', b?.h ?? 0],
                ['AVG', b?.avg ? `.${b.avg.slice(2)}` : '—'],
                ['HR', b?.hr ?? 0],
                ['RBI', b?.rbi ?? 0],
                ['BB', b?.bb ?? 0],
                ['SO', b?.so ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-bold text-sm">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {isPitcher && b && b.ab > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Bateo</p>
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                ['G', b.g],
                ['AB', b.ab],
                ['AVG', b.avg ? `.${b.avg.slice(2)}` : '—'],
                ['HR', b.hr],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded p-2">
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-bold text-sm">{value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full px-4 py-2 text-sm border rounded hover:bg-gray-50"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

export default function Roster() {
  const { refreshTeam } = useTeam();
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);
  const [statsMap, setStatsMap] = useState({});
  const [renewingPlayer, setRenewingPlayer] = useState(null);
  const [renewSalary, setRenewSalary] = useState('');
  const [renewYears, setRenewYears] = useState('');
  const [renewError, setRenewError] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  const loadRoster = () => {
    api.getMyTeam().then((data) => {
      setTeam(data.team);
      setPlayers(data.players);
    });
  };

  const loadStats = () => {
    api.getTeamStats().then((data) => {
      const map = {};
      for (const s of data.stats) map[s.player_id] = s;
      setStatsMap(map);
    }).catch(() => {});
  };

  useEffect(() => {
    loadRoster();
    loadStats();
  }, []);

  const openRenew = (e, player) => {
    e.stopPropagation();
    setRenewingPlayer(player);
    setRenewSalary('');
    setRenewYears('');
    setRenewError('');
  };

  const closeRenew = () => {
    setRenewingPlayer(null);
    setRenewError('');
  };

  const handleRenew = async () => {
    const salary = Math.round(Number(renewSalary));
    const years = parseInt(renewYears, 10);

    if (!salary || salary <= Number(renewingPlayer.salary)) {
      setRenewError('El nuevo salario debe ser mayor al salario actual.');
      return;
    }
    if (!years || years < 1) {
      setRenewError('Ingresa un número de años válido (mínimo 1).');
      return;
    }

    try {
      await api.renewContract(renewingPlayer.id, salary, years);
      closeRenew();
      await Promise.all([loadRoster(), refreshTeam()]);
    } catch (err) {
      setRenewError(err.message);
    }
  };

  const getStatSummary = (player) => {
    const s = statsMap[player.id];
    if (!s) return '—';
    if (player.position === 'P' && s.pitching) {
      return s.pitching.era ? `${s.pitching.era} ERA` : '—';
    }
    return s.batting?.avg ? `.${s.batting.avg.slice(2)}` : '—';
  };

  const majorPlayers = players.filter((p) => p.level !== 'MINOR');
  const activePlayers = majorPlayers.filter((p) => p.injury_days_remaining === 0);
  const injuredPlayers = majorPlayers.filter((p) => p.injury_days_remaining > 0);

  const handleDemote = async (e, playerId) => {
    e.stopPropagation();
    try {
      await api.demotePlayer(playerId);
      await loadRoster();
    } catch (err) {
      alert(err.message);
    }
  };

  const rosterTable = (list) => (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="p-2">Nombre</th>
          <th className="p-2">Pos</th>
          <th className="p-2">Edad</th>
          <th className="p-2">Destreza</th>
          <th className="p-2">Potencial</th>
          <th className="p-2">Edad de uso</th>
          <th className="p-2">Salario</th>
          <th className="p-2">Contrato (años)</th>
          <th className="p-2">Stats</th>
          <th className="p-2">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => (
          <tr
            key={p.id}
            className="border-t hover:bg-gray-50 cursor-pointer"
            onClick={() => setSelectedPlayer(p)}
          >
            <td className="p-2 font-medium text-blue-700 hover:underline">{p.first_name} {p.last_name}</td>
            <td className="p-2">{p.position}</td>
            <td className="p-2">{p.age}</td>
            <td className="p-2">{p.current_skill}</td>
            <td className="p-2">{p.potential_coefficient}</td>
            <td className="p-2">{p.growth_age}</td>
            <td className="p-2">${Number(p.salary).toLocaleString()}</td>
            <td className="p-2">{p.contract_years_remaining}</td>
            <td className="p-2 font-mono text-xs text-gray-700">{getStatSummary(p)}</td>
            <td className="p-2">
              <div className="flex items-center gap-1.5">
                {p.injury_days_remaining > 0 ? (
                  <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded font-medium">
                    Lesionado ({p.injury_days_remaining}d)
                  </span>
                ) : p.contract_years_remaining <= 2 ? (
                  <button
                    onClick={(e) => openRenew(e, p)}
                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                  >
                    Renovar
                  </button>
                ) : null}
                <button
                  onClick={(e) => handleDemote(e, p.id)}
                  className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                >
                  Enviar a Minors
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tu Roster</h2>
      {team && (
        <p className="text-gray-600">
          {majorPlayers.length}/25 jugadores · Presupuesto: ${Number(team.budget).toLocaleString()}
        </p>
      )}

      {players.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No tienes jugadores todavia. Ve al <b>Mercado</b> para fichar agentes libres o prospectos de tus scouts.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            {rosterTable(activePlayers)}
          </div>

          {injuredPlayers.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-red-700 mb-1">
                Lista de Lesionados ({injuredPlayers.length})
              </h3>
              <div className="bg-red-50 border border-red-200 rounded-lg overflow-x-auto">
                {rosterTable(injuredPlayers)}
              </div>
            </div>
          )}
        </>
      )}

      {selectedPlayer && (
        <StatsModal
          player={selectedPlayer}
          stats={statsMap[selectedPlayer.id]}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {renewingPlayer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">Renovar contrato</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">Jugador:</span> {renewingPlayer.first_name} {renewingPlayer.last_name}</p>
              <p><span className="font-medium">Salario actual:</span> ${Number(renewingPlayer.salary).toLocaleString()} / año</p>
              <p><span className="font-medium">Años restantes:</span> {renewingPlayer.contract_years_remaining}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nuevo salario por año ($)
                </label>
                <input
                  type="number"
                  min={Number(renewingPlayer.salary) + 1}
                  value={renewSalary}
                  onChange={(e) => setRenewSalary(e.target.value)}
                  placeholder={`Más de $${Number(renewingPlayer.salary).toLocaleString()}`}
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Años de contrato
                </label>
                <input
                  type="number"
                  min={1}
                  value={renewYears}
                  onChange={(e) => setRenewYears(e.target.value)}
                  placeholder="Ej: 3"
                  className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            {renewError && (
              <p className="text-red-600 text-sm">{renewError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={closeRenew}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleRenew}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Confirmar renovación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
