import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Pagination from '../components/Pagination.jsx';

const USER_TEAM_ID = 1;

const TYPE_LABELS = {
  ticket_sales: 'Venta de entradas',
  merch_sales: 'Merchandising',
  salaries: 'Salarios',
  stadium_upgrade: 'Estadio',
  scouting: 'Scouting',
  signing: 'Fichajes',
  operating_cost: 'Costos operativos',
  broadcast_revenue: 'Ingresos Transmisión',
  luxury_tax: 'Impuesto al lujo',
};

export default function Finances() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    api.getFinances({ page, pageSize: 15 }).then((d) => {
      setData(d);
      setTotalPages(d.totalPages);
    });
  }, [page]);

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
        <h3 className="font-bold mb-2">Salarios de la liga (roster activo)</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">Promedio de la liga</p>
            <p className="text-lg font-bold">
              ${Number(data.leagueAvgSalary).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400">{data.leagueActivePlayerCount} jugadores</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Promedio de tu equipo</p>
            <p className={`text-lg font-bold ${Number(data.teamAvgSalary) > Number(data.leagueAvgSalary) ? 'text-red-600' : 'text-green-700'}`}>
              ${Number(data.teamAvgSalary).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-gray-400">{data.teamActivePlayerCount} jugadores</p>
          </div>
        </div>

        <h4 className="font-semibold text-sm text-gray-500 mb-1">Top 3 salarios de la liga</h4>
        {data.topSalaries && data.topSalaries.length > 0 ? (
          <table className="w-full text-sm">
            <tbody>
              {data.topSalaries.map((p) => (
                <tr key={p.id} className={`border-t ${p.team?.id === USER_TEAM_ID ? 'bg-yellow-50' : ''}`}>
                  <td className="p-2">{p.first_name} {p.last_name}</td>
                  <td className="p-2 text-gray-500">{p.position}</td>
                  <td className="p-2 text-gray-500">{p.team?.name}</td>
                  <td className="p-2 text-right font-semibold text-green-700">
                    ${Number(p.salary).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-400">Sin datos de jugadores activos.</p>
        )}
      </div>

      {data.userLuxuryTax && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">Impuesto al lujo</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Nómina de tu equipo</p>
              <p className="text-lg font-bold">
                ${Number(data.userLuxuryTax.payroll).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Umbral de la liga</p>
              <p className="text-lg font-bold">
                ${Number(data.userLuxuryTax.threshold).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">
                Impuesto {data.userLuxuryTax.charged ? 'cobrado' : 'proyectado'} (día {data.userLuxuryTax.day})
              </p>
              <p className={`text-lg font-bold ${data.userLuxuryTax.totalTax > 0 ? 'text-red-600' : 'text-green-700'}`}>
                ${Number(data.userLuxuryTax.totalTax).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

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
            <tr className="border-t-2 border-gray-300">
              <td className="p-2 font-bold">Ingresos promedio por temporada</td>
              <td className={`p-2 text-right font-bold ${Number(data.avgIncomePerSeason) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                ${Number(data.avgIncomePerSeason).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
            </tr>
            <tr className="border-t">
              <td className="p-2 font-bold">Ganancia promedio por temporada</td>
              <td className={`p-2 text-right font-bold ${Number(data.avgProfitPerSeason) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                ${Number(data.avgProfitPerSeason).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </td>
            </tr>
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
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
