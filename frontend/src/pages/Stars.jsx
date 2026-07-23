import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import Pagination from '../components/Pagination.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

function getTier(skill) {
  if (skill >= 100) return { label: 'Leyenda', bg: 'bg-yellow-400 text-yellow-900' };
  if (skill >= 90)  return { label: 'Super estrella', bg: 'bg-purple-600 text-white' };
  if (skill >= 80)  return { label: 'Estrella', bg: 'bg-blue-600 text-white' };
  if (skill >= 70)  return { label: 'Bueno', bg: 'bg-green-600 text-white' };
  return null;
}

const TIER_CHIPS = [
  { label: 'Todos',          minSkill: '70', maxSkill: '' },
  { label: 'Bueno',          minSkill: '70', maxSkill: '79' },
  { label: 'Estrella',       minSkill: '80', maxSkill: '89' },
  { label: 'Super estrella', minSkill: '90', maxSkill: '99' },
  { label: 'Leyenda',        minSkill: '100', maxSkill: '' },
];

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const PAGE_SIZE = 20;

const DEFAULT_FILTERS = { position: '', minSkill: '70', maxSkill: '' };

function StarAuctionCard({ auction, season, onBidPlaced, rosterFull }) {
  const [bidAmount, setBidAmount] = useState('');
  const [years, setYears] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const p = auction.player;
  const topBid = auction.top_bid;
  const currentDay = season?.current_day ?? 0;
  const deadlineDay = season?.auctionDeadlineDay ?? 30;
  const effectiveCloseDay = auction.closes_on_day != null
    ? Math.min(auction.closes_on_day, deadlineDay)
    : deadlineDay;
  const daysLeft = currentDay < deadlineDay ? Math.max(0, effectiveCloseDay - currentDay) : 0;

  const minBid = topBid
    ? Math.ceil(Number(topBid.amount) * 1.01)
    : Number(p.salary);

  const maxYears = Math.max(1, Math.min(9, 40 - p.age));

  const tier = getTier(p.current_skill);

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-base truncate">{p.first_name} {p.last_name}</p>
          <p className="text-sm text-gray-500">{p.position} · Edad {p.age}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {tier && (
            <span className={`text-xs rounded-full px-2 py-0.5 font-semibold ${tier.bg}`}>
              {tier.label}
            </span>
          )}
          <span className="text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-semibold">
            Coef. {auction.growth_coefficient.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-sm text-center">
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Destreza</p>
          <p className="font-bold text-lg">{p.current_skill}</p>
        </div>
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Potencial</p>
          <p className="font-semibold text-amber-700">{p.potential_coefficient}</p>
        </div>
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Edad uso</p>
          <p className="font-semibold">{p.growth_age}</p>
        </div>
        <div className="bg-gray-50 rounded p-1">
          <p className="text-gray-500 text-xs">Salario</p>
          <p className="font-semibold text-xs">${Number(p.salary).toLocaleString()}</p>
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
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ml-2 whitespace-nowrap ${
          daysLeft <= 1 ? 'bg-red-100 text-red-700' :
          daysLeft <= 3 ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
        }`}>
          {daysLeft === 0 ? 'Cierra hoy' : `${daysLeft}d restantes`}
        </span>
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

export default function Stars() {
  const { refreshTeam } = useTeam();
  const [auctions, setAuctions] = useState([]);
  const [userRosterCount, setUserRosterCount] = useState(0);
  const [season, setSeason] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeChip, setActiveChip] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalActive, setTotalActive] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  function applyChip(idx) {
    const chip = TIER_CHIPS[idx];
    setActiveChip(idx);
    setFilters(f => ({ ...f, minSkill: chip.minSkill, maxSkill: chip.maxSkill }));
  }

  function setFilter(key, value) {
    setFilters(f => ({ ...f, [key]: value }));
    setActiveChip(-1);
  }

  async function load() {
    const [aucData, se] = await Promise.all([
      api.getAuctions({ ...filters, page, pageSize: PAGE_SIZE }),
      api.getSeason(),
    ]);
    setAuctions(aucData.auctions);
    setUserRosterCount(aucData.userRosterCount);
    setTotal(aucData.total);
    setTotalActive(aucData.totalActive);
    setTotalPages(aucData.totalPages);
    setSeason(se);
  }

  useEffect(() => { load(); }, []);

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
      load();
    }, 350);
    return () => clearTimeout(t);
  }, [filters, page]);

  const rosterFull = userRosterCount >= 25;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Jugadores Sobresalientes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Agentes libres con destreza 70+. Usa los filtros para encontrar la estrella que necesitas.
        </p>
      </div>

      {rosterFull && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm font-medium">
          Roster lleno ({userRosterCount}/25). Libera jugadores para poder pujar.
        </div>
      )}

      {/* Tier legend */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="bg-green-600 text-white rounded-full px-3 py-1">Bueno 70–79</span>
        <span className="bg-blue-600 text-white rounded-full px-3 py-1">Estrella 80–89</span>
        <span className="bg-purple-600 text-white rounded-full px-3 py-1">Super estrella 90–99</span>
        <span className="bg-yellow-400 text-yellow-900 rounded-full px-3 py-1">Leyenda 100</span>
      </div>

      {/* Tier chips + position filter */}
      <div className="bg-white rounded-lg shadow p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {TIER_CHIPS.map((chip, idx) => (
            <button
              key={chip.label}
              onClick={() => applyChip(idx)}
              className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors ${
                activeChip === idx
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
              }`}
            >
              {chip.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-gray-500">Pos.</label>
            <select
              value={filters.position}
              onChange={e => setFilter('position', e.target.value)}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="">Todas</option>
              {POSITIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
            </select>
          </div>
        </div>
        <div className="text-xs text-gray-400">{total} jugadores encontrados</div>
      </div>

      {totalActive === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
          No hay subastas activas. Ejecuta <code className="bg-gray-100 px-1 rounded">npm run seed:stars</code> desde el backend para agregar jugadores sobresalientes.
        </div>
      ) : total === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500 text-sm">
          Ningún jugador sobresaliente disponible con estos filtros.
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {auctions.map(a => (
              <StarAuctionCard
                key={a.id}
                auction={a}
                season={season}
                onBidPlaced={() => Promise.all([load(), refreshTeam()])}
                rosterFull={rosterFull}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
