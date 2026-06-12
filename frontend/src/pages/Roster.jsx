import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Roster() {
  const [team, setTeam] = useState(null);
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    api.getMyTeam().then((data) => {
      setTeam(data.team);
      setPlayers(data.players);
    });
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Tu Roster</h2>
      {team && (
        <p className="text-gray-600">
          {players.length} jugadores · Presupuesto: ${Number(team.budget).toLocaleString()}
        </p>
      )}

      {players.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          No tienes jugadores todavia. Ve al <b>Mercado</b> para fichar agentes libres o prospectos de tus scouts.
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
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="p-2">{p.position}</td>
                  <td className="p-2">{p.age}</td>
                  <td className="p-2">{p.current_skill}</td>
                  <td className="p-2">{p.potential_coefficient}</td>
                  <td className="p-2">{p.growth_age}</td>
                  <td className="p-2">${Number(p.salary).toLocaleString()}</td>
                  <td className="p-2">{p.contract_years_remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
