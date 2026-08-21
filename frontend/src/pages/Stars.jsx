import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import Pagination from '../components/Pagination.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import SkillTierBadge from '../components/SkillTierBadge.jsx';
import FavoriteButton from '../components/FavoriteButton.jsx';
import { useFavorites } from '../utils/favorites.js';
import { SKILL_TIERS, SKILL_TIER_COLORS } from '../utils/skillTier.js';

const TIER_CHIPS = [
  { label: 'Todos',                  minSkill: '80', maxSkill: '' },
  { label: SKILL_TIERS.BUENO,                minSkill: '80', maxSkill: '94' },
  { label: SKILL_TIERS.ESTRELLA_EN_POTENCIA, minSkill: '95', maxSkill: '99' },
  { label: SKILL_TIERS.SUPERESTRELLA,        minSkill: '100', maxSkill: '120' },
  { label: SKILL_TIERS.LEYENDA,              minSkill: '121', maxSkill: '' },
];

const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const PAGE_SIZE = 20;

const DEFAULT_FILTERS = { position: '', minSkill: '80', maxSkill: '' };

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
          <div className="flex items-center gap-1">
            <FavoriteButton playerId={p.id} />
            <SkillTierBadge skill={p.current_skill} />
          </div>
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
            <span className="text-gray-400 text-xs"> — {topBid.years} año(s)</span>
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

      {topBid && (
        <div className="bg-green-50 border border-green-200 rounded p-2 flex items-center gap-2">
          <span className="text-xs text-green-800 font-medium shrink-0">Equipo líder:</span>
          <TeamBadge name={topBid.team?.name} size="md" className="text-green-900 font-semibold" />
        </div>
      )}

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
  const { favoriteIds } = useFavorites();
  const [auctions, setAuctions] = useState([]);
  const [favoriteAuctions, setFavoriteAuctions] = useState([]);
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

  async function loadFavorites() {
    if (favoriteIds.size === 0) {
      setFavoriteAuctions([]);
      return;
    }
    const data = await api.getAuctions({
      playerIds: [...favoriteIds].join(','),
      pageSize: Math.max(favoriteIds.size, 1),
    });
    setFavoriteAuctions(data.auctions);
  }

  useEffect(() => { load(); loadFavorites(); }, []);

  useEffect(() => { loadFavorites(); }, [favoriteIds]);

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
          Agentes libres con destreza 80+. Usa los filtros para encontrar la estrella que necesitas.
        </p>
      </div>

      {rosterFull && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm font-medium">
          Roster lleno ({userRosterCount}/25). Libera jugadores para poder pujar.
        </div>
      )}

      {favoriteIds.size > 0 && (
        <div>
          <h3 className="font-bold text-lg mb-3">⭐ Favoritos</h3>
          {favoriteAuctions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-4 text-center text-gray-500 text-sm">
              Tus jugadores favoritos ya no están en subasta activa.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {favoriteAuctions.map(a => (
                <StarAuctionCard
                  key={a.id}
                  auction={a}
                  season={season}
                  onBidPlaced={() => Promise.all([load(), loadFavorites(), refreshTeam()])}
                  rosterFull={rosterFull}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tier legend — derivado de TIER_CHIPS/SKILL_TIER_COLORS para no desincronizarse */}
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        {TIER_CHIPS.filter(chip => chip.label !== 'Todos').map(chip => (
          <span key={chip.label} className={`rounded-full px-3 py-1 ${SKILL_TIER_COLORS[chip.label]}`}>
            {chip.label} {chip.minSkill}{chip.maxSkill ? `–${chip.maxSkill}` : '+'}
          </span>
        ))}
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
                onBidPlaced={() => Promise.all([load(), loadFavorites(), refreshTeam()])}
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
