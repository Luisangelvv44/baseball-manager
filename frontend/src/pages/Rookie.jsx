import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

const MAX_MINOR_ROSTER_SIZE = 15;

export default function Rookie() {
  const { refreshTeam } = useTeam();
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState('');

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
                    <button
                      onClick={() => handlePromote(p.id)}
                      className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    >
                      Subir a Mayores
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
