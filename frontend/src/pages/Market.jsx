import { useEffect, useState } from 'react';
import { api } from '../api.js';

function PlayerTable({ players, onSign }) {
  const [years, setYears] = useState({});

  if (players.length === 0) {
    return <p className="text-gray-500 text-sm py-4">No hay jugadores disponibles por ahora.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="p-2">Nombre</th>
          <th className="p-2">Pos</th>
          <th className="p-2">Edad</th>
          <th className="p-2">Destreza</th>
          <th className="p-2">Potencial</th>
          <th className="p-2">Edad de uso</th>
          <th className="p-2">Salario/año</th>
          <th className="p-2">Años</th>
          <th className="p-2"></th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr key={p.id} className="border-t">
            <td className="p-2 font-medium">{p.first_name} {p.last_name}</td>
            <td className="p-2">{p.position}</td>
            <td className="p-2">{p.age}</td>
            <td className="p-2">{p.current_skill}</td>
            <td className="p-2 font-semibold text-amber-700">{p.potential_coefficient}</td>
            <td className="p-2">{p.growth_age}</td>
            <td className="p-2">${Number(p.salary).toLocaleString()}</td>
            <td className="p-2">
              <input
                type="number"
                min="1"
                max="10"
                value={years[p.id] || 1}
                onChange={(e) => setYears({ ...years, [p.id]: e.target.value })}
                className="border rounded w-16 px-1 py-0.5"
              />
            </td>
            <td className="p-2">
              <button
                onClick={() => onSign(p.id, years[p.id] || 1)}
                className="bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700"
              >
                Fichar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function Market() {
  const [freeAgents, setFreeAgents] = useState([]);
  const [scouted, setScouted] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [fa, sc] = await Promise.all([api.getFreeAgents(), api.getScoutedPlayers()]);
    setFreeAgents(fa);
    setScouted(sc);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSign(id, years) {
    setMessage('');
    try {
      const res = await api.signPlayer(id, years);
      setMessage(`Fichado. Bono de firma: $${res.signingBonus.toLocaleString()}. Nuevo presupuesto: $${res.newBudget.toLocaleString()}`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Mercado</h2>
      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Prospectos de Scouts</h3>
        <p className="text-xs text-gray-500 mb-2">
          Alto coeficiente de potencial, pero destreza actual baja: son jovenes sin pulir, riesgo/recompensa.
        </p>
        <PlayerTable players={scouted} onSign={handleSign} />
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Agentes Libres</h3>
        <PlayerTable players={freeAgents} onSign={handleSign} />
      </div>
    </div>
  );
}
