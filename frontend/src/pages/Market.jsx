import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import Pagination from '../components/Pagination.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

function PlayerTable({ players, onSign, rosterFull }) {
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
        {players.map((p) => {
          const maxYears = Math.max(1, p.rookie_contract ? Math.min(3, 40 - p.age) : 40 - p.age);
          return (
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
                  max={maxYears}
                  value={Math.min(years[p.id] || 1, maxYears)}
                  onChange={(e) => setYears({ ...years, [p.id]: Math.min(Number(e.target.value), maxYears) })}
                  className="border rounded w-16 px-1 py-0.5"
                />
              </td>
              <td className="p-2">
                <button
                  onClick={() => onSign(p.id, Math.min(years[p.id] || 1, maxYears))}
                  disabled={rosterFull}
                  className="bg-green-600 text-white rounded px-3 py-1 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Fichar
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AuctionCard({ auction, season, onBidPlaced, rosterFull }) {
  const [bidAmount, setBidAmount] = useState('');
  const [years, setYears] = useState(1);
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

  const maxYears = Math.max(1, Math.min(9, 40 - p.age));

  async function handleBid() {
    const amount = Math.round(Number(bidAmount));
    if (!amount || amount < minBid) {
      setError(`Mínimo: $${minBid.toLocaleString()}`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.placeBid(auction.id, amount, Math.min(years, maxYears));
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
            <span className="text-gray-400 text-xs inline-flex items-center gap-1"> — {topBid.years} año(s) — <TeamBadge name={topBid.team?.name} /></span>
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

      {rosterFull ? (
        <p className="text-center text-sm text-red-600 font-medium py-1">Roster lleno (máx. 25)</p>
      ) : (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-0.5">Monto</label>
            <input
              type="number"
              min={minBid}
              step={10000}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              placeholder={`Mín $${minBid.toLocaleString()}`}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-0.5">Años</label>
            <input
              type="number"
              min={1}
              max={maxYears}
              value={years}
              onChange={(e) => setYears(Math.min(Math.max(1, Number(e.target.value)), maxYears))}
              title={`Años de contrato (máx. ${maxYears})`}
              className="border rounded w-16 px-1 py-1 text-sm"
            />
          </div>
          <button
            onClick={handleBid}
            disabled={loading}
            className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Pujar
          </button>
        </div>
      )}
      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const PAGE_SIZE = 20;

const EMPTY_FILTERS = {
  position: '',
  minPotential: '', maxPotential: '',
  minSkill: '', maxSkill: '',
  minSalary: '', maxSalary: '',
  minGrowth: '', maxGrowth: '',
};

export default function Market() {
  const { refreshTeam } = useTeam();
  const [auctions, setAuctions] = useState([]);
  const [userRosterCount, setUserRosterCount] = useState(0);
  const [scouted, setScouted] = useState([]);
  const [season, setSeason] = useState(null);
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
  }

  async function loadAuctions() {
    const aucData = await api.getAuctions({ ...filters, page, pageSize: PAGE_SIZE });
    setAuctions(aucData.auctions);
    setUserRosterCount(aucData.userRosterCount);
    setTotal(aucData.total);
    setTotalActive(aucData.totalActive);
    setTotalPages(aucData.totalPages);
  }

  async function load() {
    const [sc, se] = await Promise.all([
      api.getScoutedPlayers(),
      api.getSeason(),
    ]);
    setScouted(sc);
    setSeason(se);
    await loadAuctions();
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      loadAuctions();
    }, 350);
    return () => clearTimeout(t);
  }, [filters, page]);

  async function handleSign(id, years) {
    setMessage('');
    try {
      const res = await api.signPlayer(id, years);
      setMessage(`Fichado. Bono de firma: $${res.signingBonus.toLocaleString()}. Nuevo presupuesto: $${res.newBudget.toLocaleString()}`);
      await Promise.all([load(), refreshTeam()]);
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

      {userRosterCount >= 25 && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm font-medium">
          Roster lleno ({userRosterCount}/25). Libera o pierde jugadores para poder fichar o pujar.
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold mb-1">
          Prospectos de Scouts
          <span className="ml-2 text-xs font-normal text-gray-500">{userRosterCount}/25 jugadores</span>
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Fichaje directo — exclusivos de tu red de scouts. Alto potencial, destreza baja: riesgo/recompensa.
        </p>
        <PlayerTable players={scouted} onSign={handleSign} rosterFull={userRosterCount >= 25} />
      </div>

      <div>
        <h3 className="font-bold text-lg mb-1">Subastas de Agentes Libres</h3>
        <p className="text-xs text-gray-500 mb-3">
          Los equipos CPU también pujan cada día, ofreciendo entre 1 y 5 años de contrato. Tú puedes ofrecer
          hasta 9 años (menos si el jugador está cerca de retirarse a los 40). El temporizador se reinicia
          5 días tras la última puja.
        </p>

        {totalActive > 0 && (
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 font-medium whitespace-nowrap">Posición</label>
                <select
                  value={filters.position}
                  onChange={e => setFilter('position', e.target.value)}
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="">Todas</option>
                  {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
              </div>
              <button
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="ml-auto text-xs text-gray-500 hover:text-gray-800 underline"
              >
                Limpiar filtros
              </button>
              <span className="text-xs text-gray-400">{total} de {totalActive} subastas</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-1">Potencial</p>
                <div className="flex gap-1">
                  <input type="number" min="1" max="99" placeholder="Mín" value={filters.minPotential}
                    onChange={e => setFilter('minPotential', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                  <input type="number" min="1" max="99" placeholder="Máx" value={filters.maxPotential}
                    onChange={e => setFilter('maxPotential', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Destreza</p>
                <div className="flex gap-1">
                  <input type="number" min="1" max="99" placeholder="Mín" value={filters.minSkill}
                    onChange={e => setFilter('minSkill', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                  <input type="number" min="1" max="99" placeholder="Máx" value={filters.maxSkill}
                    onChange={e => setFilter('maxSkill', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Salario</p>
                <div className="flex gap-1">
                  <input type="number" min="0" step="10000" placeholder="Mín" value={filters.minSalary}
                    onChange={e => setFilter('minSalary', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                  <input type="number" min="0" step="10000" placeholder="Máx" value={filters.maxSalary}
                    onChange={e => setFilter('maxSalary', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Coef. Crecimiento</p>
                <div className="flex gap-1">
                  <input type="number" min="0" step="0.1" placeholder="Mín" value={filters.minGrowth}
                    onChange={e => setFilter('minGrowth', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                  <input type="number" min="0" step="0.1" placeholder="Máx" value={filters.maxGrowth}
                    onChange={e => setFilter('maxGrowth', e.target.value)}
                    className="border rounded px-2 py-1 text-xs w-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {totalActive === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
            No hay subastas activas. Inicia una temporada para abrir las subastas de agentes libres.
          </div>
        ) : total === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
            Ninguna subasta coincide con los filtros aplicados.
          </div>
        ) : (
          <>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {auctions.map((a) => (
                <AuctionCard
                  key={a.id}
                  auction={a}
                  season={season}
                  onBidPlaced={() => Promise.all([load(), refreshTeam()])}
                  rosterFull={userRosterCount >= 25}
                />
              ))}
            </div>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
