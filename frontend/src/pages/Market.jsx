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

function AuctionCard({ auction, season, onBidPlaced }) {
  const [bidAmount, setBidAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const p = auction.player;
  const topBid = auction.top_bid;
  const currentDay = season?.current_day ?? 0;
  const daysLeft = auction.closes_on_day != null
    ? Math.max(0, auction.closes_on_day - currentDay)
    : null;

  const minBid = topBid
    ? Math.ceil(Number(topBid.amount) * 1.01)
    : Number(p.salary);

  async function handleBid() {
    const amount = Math.round(Number(bidAmount));
    if (!amount || amount < minBid) {
      setError(`Mínimo: $${minBid.toLocaleString()}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.placeBid(auction.id, amount);
      setBidAmount('');
      onBidPlaced();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-base">{p.first_name} {p.last_name}</p>
          <p className="text-sm text-gray-500">{p.position} · Edad {p.age} · Destreza {p.current_skill}</p>
        </div>
        <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-semibold whitespace-nowrap">
          Coef. {auction.growth_coefficient.toFixed(2)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm text-center">
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Potencial</p>
          <p className="font-semibold text-amber-700">{p.potential_coefficient}</p>
        </div>
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Edad uso</p>
          <p className="font-semibold">{p.growth_age}</p>
        </div>
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Salario base</p>
          <p className="font-semibold">${Number(p.salary).toLocaleString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        {topBid ? (
          <div className="truncate">
            <span className="text-gray-500">Mejor puja: </span>
            <span className="font-bold text-green-700">${Number(topBid.amount).toLocaleString()}</span>
            <span className="text-gray-400 text-xs"> — {topBid.team?.name}</span>
          </div>
        ) : (
          <span className="text-gray-400 italic text-xs">Sin pujas aún</span>
        )}
        {daysLeft != null ? (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 whitespace-nowrap ${
            daysLeft <= 1 ? 'bg-red-100 text-red-700' :
            daysLeft <= 3 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-blue-100 text-blue-700'
          }`}>
            {daysLeft === 0 ? 'Cierra hoy' : `${daysLeft}d restantes`}
          </span>
        ) : (
          <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full ml-2 whitespace-nowrap">
            Esperando puja
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="number"
          min={minBid}
          step={10000}
          value={bidAmount}
          onChange={(e) => setBidAmount(e.target.value)}
          placeholder={`Mín $${minBid.toLocaleString()}`}
          className="border rounded px-2 py-1 flex-1 text-sm"
        />
        <button
          onClick={handleBid}
          disabled={loading}
          className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          Pujar
        </button>
      </div>
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}

export default function Market() {
  const [auctions, setAuctions] = useState([]);
  const [scouted, setScouted] = useState([]);
  const [season, setSeason] = useState(null);
  const [message, setMessage] = useState('');

  async function load() {
    const [auc, sc, se] = await Promise.all([
      api.getAuctions(),
      api.getScoutedPlayers(),
      api.getSeason(),
    ]);
    setAuctions(auc);
    setScouted(sc);
    setSeason(se);
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
      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">
          {message}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-1">Prospectos de Scouts</h3>
        <p className="text-xs text-gray-500 mb-3">
          Fichaje directo — exclusivos de tu red de scouts. Alto potencial, destreza baja: riesgo/recompensa.
        </p>
        <PlayerTable players={scouted} onSign={handleSign} />
      </div>

      <div>
        <h3 className="font-bold text-lg mb-1">Subastas de Agentes Libres</h3>
        <p className="text-xs text-gray-500 mb-3">
          Los equipos CPU también pujan cada día. El temporizador se reinicia 5 días tras la última puja.
          El contrato es de 1 año al precio ganador.
        </p>
        {auctions.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
            No hay subastas activas. Inicia una temporada para abrir las subastas de agentes libres.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {auctions.map((a) => (
              <AuctionCard
                key={a.id}
                auction={a}
                season={season}
                onBidPlaced={load}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
