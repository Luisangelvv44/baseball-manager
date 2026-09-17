import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Pagination from '../components/Pagination.jsx';

function healthColor(ratio) {
  if (ratio >= 0.5) return 'text-green-700';
  if (ratio >= 0.2) return 'text-yellow-600';
  return 'text-red-600';
}

function healthLabel(ratio) {
  if (ratio >= 0.5) return 'Saludable';
  if (ratio >= 0.2) return 'Cauteloso';
  return 'En apuros';
}

export default function Bank() {
  const [status, setStatus] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [loans, setLoans] = useState(null);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [amount, setAmount] = useState('');
  const [requestResult, setRequestResult] = useState(null);
  const [requestError, setRequestError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.getBankStatus().then(setStatus);
    api.getBankEligibility().then((e) => {
      setEligibility(e);
      setAmount(String(Math.round((e.suggestedMin + e.suggestedMax) / 2)));
    });
    api.getBankLoans({ status: 'history', pageSize: 10 }).then((d) => setHistory(d.loans));
  }

  useEffect(refresh, []);

  useEffect(() => {
    api.getBankLoans({ status: 'active', page, pageSize: 15 }).then((d) => {
      setLoans(d.loans);
      setTotalPages(d.totalPages);
    });
  }, [page]);

  async function handleRequest(e) {
    e.preventDefault();
    setRequestError(null);
    setRequestResult(null);
    setSubmitting(true);
    try {
      const result = await api.requestBankLoan(Number(amount));
      setRequestResult(result);
      refresh();
      setPage(1);
      api.getBankLoans({ status: 'active', page: 1, pageSize: 15 }).then((d) => {
        setLoans(d.loans);
        setTotalPages(d.totalPages);
      });
    } catch (err) {
      setRequestError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!status || !eligibility || !loans) return <p>Cargando...</p>;

  const ratio = status.liquidityRatio;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Banco</h2>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Balance del Banco</p>
            <p className={`text-lg font-bold ${healthColor(ratio)}`}>${Math.round(status.balance).toLocaleString()}</p>
            <p className="text-xs text-gray-400">{healthLabel(ratio)} ({Math.round(ratio * 100)}%)</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Tasa base</p>
            <p className="text-lg font-bold">{(status.baseInterestRate * 100).toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Total prestado (histórico)</p>
            <p className="text-lg font-bold">${Math.round(status.totalLoaned).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Intereses cobrados</p>
            <p className="text-lg font-bold text-green-700">${Math.round(status.totalInterestCollected).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Financiado por impuestos</p>
            <p className="text-lg font-bold">${Math.round(status.totalTaxFunded).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Condonado por mora</p>
            <p className="text-lg font-bold text-red-600">${Math.round(status.totalDefaulted).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Solicitar préstamo</h3>
        {eligibility.activeLoan ? (
          <p className="text-sm text-gray-500">
            Ya tienes un préstamo activo: balance pendiente ${Math.round(eligibility.activeLoan.balanceRemaining).toLocaleString()}
            {' '}(tasa {(eligibility.activeLoan.interestRate * 100).toFixed(1)}%).
          </p>
        ) : eligibility.eligible ? (
          <form onSubmit={handleRequest} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm text-gray-500 mb-1">
                Monto (entre ${eligibility.suggestedMin.toLocaleString()} y ${eligibility.suggestedMax.toLocaleString()})
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={eligibility.suggestedMin}
                max={eligibility.suggestedMax}
                className="border rounded px-3 py-1.5 w-56"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white rounded px-4 py-1.5 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Solicitando...' : 'Solicitar'}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500">{eligibility.reason}</p>
        )}

        {requestResult && (
          <p className={`text-sm mt-2 ${requestResult.rejected ? 'text-red-600' : 'text-green-700'}`}>
            {requestResult.rejected
              ? `Solicitud rechazada: ${requestResult.reason}`
              : `Préstamo aprobado: $${Math.round(requestResult.approvedAmount).toLocaleString()} a ${(requestResult.interestRate * 100).toFixed(1)}% de interés.`}
          </p>
        )}
        {requestError && <p className="text-sm text-red-600 mt-2">{requestError}</p>}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-2">Préstamos activos</h3>
        {loans.length === 0 ? (
          <p className="text-sm text-gray-400">No hay préstamos activos.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-2">Equipo</th>
                <th className="p-2 text-right">Principal</th>
                <th className="p-2 text-right">Balance pendiente</th>
                <th className="p-2 text-right">Tasa</th>
                <th className="p-2 text-right">Día emisión</th>
                <th className="p-2 text-right">Pagos atrasados</th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => (
                <tr key={l.id} className={`border-t ${l.isUserTeam ? 'bg-yellow-50' : ''}`}>
                  <td className="p-2">{l.teamName}</td>
                  <td className="p-2 text-right">${Math.round(l.principal).toLocaleString()}</td>
                  <td className="p-2 text-right font-semibold text-red-600">${Math.round(l.balanceRemaining).toLocaleString()}</td>
                  <td className="p-2 text-right">{(l.interestRate * 100).toFixed(1)}%</td>
                  <td className="p-2 text-right">{l.dayIssued}</td>
                  <td className="p-2 text-right">{l.missedPayments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>

      {history && history.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">Historial</h3>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-2">Equipo</th>
                <th className="p-2">Estado</th>
                <th className="p-2 text-right">Principal</th>
                <th className="p-2 text-right">Total pagado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2">{l.teamName}</td>
                  <td className={`p-2 ${l.status === 'paid' ? 'text-green-700' : 'text-red-600'}`}>
                    {l.status === 'paid' ? 'Pagado' : 'Default'}
                  </td>
                  <td className="p-2 text-right">${Math.round(l.principal).toLocaleString()}</td>
                  <td className="p-2 text-right">${Math.round(l.totalPaid).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
