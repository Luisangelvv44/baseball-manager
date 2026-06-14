import { useEffect, useState } from 'react';
import { api } from '../api.js';

const TYPE_LABELS = {
  ticket_sales: 'Venta de entradas',
  merch_sales: 'Merchandising',
  salaries: 'Salarios',
  stadium_upgrade: 'Estadio',
  scouting: 'Scouting',
  signing: 'Fichajes',
  operating_cost: 'Costos operativos',
  broadcast_revenue: 'Ingresos Transmisión',
};

export default function Finances() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getFinances().then(setData);
  }, []);

  if (!data) return <p>Cargando...</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Finanzas</h2>
      <div className="bg-white rounded-lg shadow p-4">
        <p className="text-lg">
          Presupuesto actual: <span className="font-bold text-green-700">${Number(data.budget).toLocaleString()}</span>
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Resumen por categoria</h3>
        <table className="w-full text-sm">
          <tbody>
            {data.summary.map((row) => (
              <tr key={row.type} className="border-t">
                <td className="p-2">{TYPE_LABELS[row.type] || row.type}</td>
                <td className={`p-2 text-right font-semibold ${Number(row.total) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  ${Number(row.total).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Ultimas transacciones</h3>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="p-2">Dia</th>
              <th className="p-2">Tipo</th>
              <th className="p-2">Descripcion</th>
              <th className="p-2 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.season_day}</td>
                <td className="p-2">{TYPE_LABELS[t.type] || t.type}</td>
                <td className="p-2">{t.description}</td>
                <td className={`p-2 text-right font-semibold ${Number(t.amount) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  ${Number(t.amount).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
