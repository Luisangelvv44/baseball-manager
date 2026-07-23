import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

const MAX_MINOR_ROSTER_SIZE = 15;

export default function Rookie() {
  const { refreshTeam } = useTeam();
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState('');
  const [renewingPlayer, setRenewingPlayer] = useState(null);
  const [renewSalary, setRenewSalary] = useState('');
  const [renewYears, setRenewYears] = useState('');
  const [renewError, setRenewError] = useState('');

  const loadRoster = () => {
    api.getMyTeam().then((data) => {
      setPlayers(data.players);
    });
  };

  useEffect(() => {
    loadRoster();
  }, []);

  const minorPlayers = players.filter((p) => p.level === 'MINOR');

  const handlePromote = async (playerId) => {
    setMessage('');
    try {
      await api.promotePlayer(playerId);
      await Promise.all([loadRoster(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const openRenew = (player) => {
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

    if (!salary || salary < Number(renewingPlayer.salary)) {
      setRenewError('El nuevo salario debe ser igual o mayor al salario actual.');
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

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Ligas Menores</h2>
      <p className="text-gray-600">
        {minorPlayers.length}/{MAX_MINOR_ROSTER_SIZE} jugadores
      </p>
      <p className="text-xs text-gray-500">
        Prospectos fichados por tus scouts. Siguen envejeciendo y desarrollando destreza cada temporada,
        pero no juegan partidos. Súbelos a Mayores cuando estén listos.
      </p>

      {message && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {message}
        </div>
      )}

      {minorPlayers.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No tienes jugadores en Ligas Menores todavía. Contrata scouts para encontrar prospectos.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
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
                <th className="p-2"></th>
                <th className="p-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {minorPlayers.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="p-2">{p.position}</td>
                  <td className="p-2">{p.age}</td>
                  <td className="p-2">{p.current_skill}</td>
                  <td className="p-2 font-semibold text-amber-700">{p.potential_coefficient}</td>
                  <td className="p-2">{p.growth_age}</td>
                  <td className="p-2">${Number(p.salary).toLocaleString()}</td>
                  <td className="p-2">{p.contract_years_remaining}</td>
                  <td className="p-2">
                    {p.rookie_contract && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs rounded font-medium">
                        Rookie
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      {p.contract_years_remaining <= 2 && (
                        <button
                          onClick={() => openRenew(p)}
                          className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                        >
                          Renovar
                        </button>
                      )}
                      <button
                        onClick={() => handlePromote(p.id)}
                        className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Subir a Mayores
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  min={Number(renewingPlayer.salary)}
                  value={renewSalary}
                  onChange={(e) => setRenewSalary(e.target.value)}
                  placeholder={`$${Number(renewingPlayer.salary).toLocaleString()} o más`}
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
