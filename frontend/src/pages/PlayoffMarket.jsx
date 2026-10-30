import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';
import SkillTierBadge from '../components/SkillTierBadge.jsx';
import PlayerCareerModal from '../components/PlayerCareerModal.jsx';
import { formatCompactMoney } from '../utils/formatMoney.js';

const USER_TEAM_ID = 1;

function ListingRow({ listing, market, onBid, onShowCV }) {
  const p = listing.player;
  const [pct, setPct] = useState(listing.min_next_pct);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPct(listing.min_next_pct); }, [listing.min_next_pct]);

  const top = listing.top_bid;
  const leading = top?.team.id === USER_TEAM_ID;
  const maxed = top && top.pct >= market.max_pct;
  const upgrade = listing.my_best_at_position == null ? null : p.current_skill - listing.my_best_at_position;
  const canBid = market.status === 'open' && market.user_qualified && !leading && !maxed;
  const amount = Math.round((Number(p.salary) * Number(pct)) / 100);

  async function handleBid() {
    setLoading(true);
    setError('');
    try {
      await onBid(listing.id, Number(pct));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <tr className={`border-t align-top ${leading ? 'bg-green-50' : ''}`}>
      <td className="px-2 py-2">
        <button onClick={() => onShowCV(p.id)} className="font-semibold hover:underline text-left">
          {p.first_name} {p.last_name}
        </button>
        <div className="text-xs text-gray-500">{p.age} años{p.injury_days_remaining > 0 ? ` · lesionado ${p.injury_days_remaining}d` : ''}</div>
      </td>
      <td className="px-2 py-2">{p.position}</td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <span className="font-semibold">{p.current_skill}</span>
          <SkillTierBadge skill={p.current_skill} age={p.age} growthAge={p.growth_age} />
        </div>
      </td>
      <td className="px-2 py-2 text-xs">
        {listing.my_best_at_position == null ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className={upgrade > 0 ? 'text-green-700 font-semibold' : 'text-gray-500'}>
            {listing.my_best_at_position} ({upgrade > 0 ? '+' : ''}{upgrade})
          </span>
        )}
      </td>
      <td className="px-2 py-2"><TeamBadge name={listing.from_team.name} /></td>
      <td className="px-2 py-2">{formatCompactMoney(Number(p.salary))}</td>
      <td className="px-2 py-2 text-xs">
        {top ? (
          <>
            <div className="font-semibold">{top.pct}% · {formatCompactMoney(top.amount)}</div>
            <div className={leading ? 'text-green-700 font-semibold' : 'text-gray-500'}>
              {leading ? 'Vas ganando' : top.team.name}
            </div>
          </>
        ) : (
          <span className="text-gray-400">Sin pujas</span>
        )}
      </td>
      <td className="px-2 py-2">
        {canBid ? (
          <div className="flex flex-col gap-1 min-w-[150px]">
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={listing.min_next_pct}
                max={market.max_pct}
                step={market.raise_pct}
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                className="border rounded px-1 py-0.5 w-16 text-sm"
              />
              <span className="text-xs text-gray-500">%</span>
              <button
                onClick={handleBid}
                disabled={loading}
                className="bg-blue-600 text-white text-xs px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Pujar
              </button>
            </div>
            <span className="text-xs text-gray-500">{formatCompactMoney(amount)}</span>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        ) : maxed && !leading ? (
          <span className="text-xs text-gray-400">Puja al máximo</span>
        ) : null}
      </td>
    </tr>
  );
}

export default function PlayoffMarket() {
  const { refreshTeam, refreshAlerts } = useTeam();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState('');
  const [onlyUpgrades, setOnlyUpgrades] = useState(true);
  const [sortBy, setSortBy] = useState('skill');
  const [cvPlayerId, setCvPlayerId] = useState(null);

  async function load() {
    try {
      setData(await api.getPlayoffMarket());
    } catch (err) {
      setMessage(err.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleBid(loanId, pct) {
    await api.placePlayoffLoanBid(loanId, pct);
    refreshTeam();
    await load();
  }

  async function handleAdvanceDay() {
    setLoading(true);
    setMessage('');
    try {
      const result = await api.advanceDay();
      refreshTeam();
      refreshAlerts();
      if (result.playoffMarket?.open) {
        setMessage(`Día ${result.day}. Quedan ${result.playoffMarket.daysLeft} día(s) para pujar.`);
        await load();
        return;
      }
      if (result.userGameId && !result.advanced) return navigate(`/game/${result.userGameId}`);
      navigate('/playoffs');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  const market = data?.market;
  const listings = data?.listings ?? [];
  const positions = useMemo(() => [...new Set(listings.map((l) => l.player.position))].sort(), [listings]);

  const visible = useMemo(() => {
    let rows = listings;
    if (position) rows = rows.filter((l) => l.player.position === position);
    if (onlyUpgrades) {
      rows = rows.filter((l) => l.my_best_at_position == null || l.player.current_skill > l.my_best_at_position);
    }
    const key = {
      skill: (l) => -l.player.current_skill,
      salary: (l) => Number(l.player.salary),
      upgrade: (l) => -(l.player.current_skill - (l.my_best_at_position ?? 0)),
    }[sortBy];
    return [...rows].sort((a, b) => key(a) - key(b));
  }, [listings, position, onlyUpgrades, sortBy]);

  if (data && !market) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        <p className="text-lg font-semibold mb-2">No hay mercado de playoffs</p>
        <p className="text-sm">
          Se abre al terminar la temporada regular: durante unos días, los equipos clasificados pujan por
          jugadores de los eliminados, cedidos solo para los playoffs.
        </p>
      </div>
    );
  }
  if (!market) return null;

  const isOpen = market.status === 'open';
  const incoming = data.myLoans.filter((l) => l.direction === 'in');
  const outgoing = data.myLoans.filter((l) => l.direction === 'out');

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Mercado de Playoffs</h2>
          <p className="text-sm text-gray-500">
            {isOpen
              ? `Abierto · ${market.days_left} día(s) restantes · pujas de ${market.min_pct}% a ${market.max_pct}% del salario`
              : 'Cerrado · los refuerzos vuelven a su equipo al terminar los playoffs'}
          </p>
        </div>
        {isOpen && (
          <button
            onClick={handleAdvanceDay}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Avanzar Día
          </button>
        )}
      </div>

      {message && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>
      )}

      {isOpen && !market.user_qualified && (
        <div className="bg-amber-50 border border-amber-300 text-amber-900 rounded p-3 text-sm">
          Tu equipo no clasificó a playoffs, así que no puede pujar. Tus jugadores pueden ser cedidos a los
          clasificados y volverán al terminar los playoffs.
        </div>
      )}

      {isOpen && market.user_qualified && (
        <div className="bg-white rounded-lg shadow p-3 text-sm flex gap-6 flex-wrap">
          <span>Pujas ganando: <b>{market.my_leading_count}/{market.max_signings}</b></span>
          <span>Comprometido: <b>{formatCompactMoney(market.my_committed)}</b></span>
          <span className="text-gray-500">
            Para superar una puja hay que subir al menos {market.raise_pct}%. Al cierre gana la mejor puja (a igual %, la primera).
          </span>
        </div>
      )}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <div className="bg-white rounded-lg shadow p-4 space-y-2 text-sm">
          {incoming.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Tus refuerzos</h3>
              {incoming.map((l) => (
                <div key={l.id} className="flex gap-2 items-center">
                  <span className="font-medium">{l.player.first_name} {l.player.last_name}</span>
                  <span className="text-gray-500">{l.player.position} · {l.player.current_skill}</span>
                  <span className="text-gray-500">de</span> <TeamBadge name={l.from_team.name} />
                  <span className="text-gray-500">· {l.pct}% ({formatCompactMoney(l.amount)})</span>
                  {l.status === 'returned' && <span className="text-xs text-gray-400">devuelto</span>}
                </div>
              ))}
              {!isOpen && <p className="text-xs text-gray-500 mt-1">Recuerda incluirlos en tu Lineup.</p>}
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Tus jugadores cedidos</h3>
              {outgoing.map((l) => (
                <div key={l.id} className="flex gap-2 items-center">
                  <span className="font-medium">{l.player.first_name} {l.player.last_name}</span>
                  <span className="text-gray-500">a</span> <TeamBadge name={l.to_team?.name ?? '—'} />
                  {l.status === 'returned' && <span className="text-xs text-gray-400">devuelto</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex gap-3 flex-wrap items-center mb-3 text-sm">
            <select value={position} onChange={(e) => setPosition(e.target.value)} className="border rounded px-2 py-1">
              <option value="">Todas las posiciones</option>
              {positions.map((pos) => <option key={pos} value={pos}>{pos}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="border rounded px-2 py-1">
              <option value="skill">Ordenar por skill</option>
              <option value="upgrade">Ordenar por mejora</option>
              <option value="salary">Ordenar por salario</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={onlyUpgrades} onChange={(e) => setOnlyUpgrades(e.target.checked)} />
              Solo mejores que mi titular
            </label>
            <span className="text-gray-500">{visible.length} jugador(es)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="px-2 py-1">Jugador</th>
                  <th className="px-2 py-1">Pos</th>
                  <th className="px-2 py-1">Skill</th>
                  <th className="px-2 py-1">Tu titular</th>
                  <th className="px-2 py-1">Equipo</th>
                  <th className="px-2 py-1">Salario</th>
                  <th className="px-2 py-1">Mejor puja</th>
                  <th className="px-2 py-1">Tu puja</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <ListingRow key={l.id} listing={l} market={market} onBid={handleBid} onShowCV={setCvPlayerId} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cvPlayerId && <PlayerCareerModal playerId={cvPlayerId} onClose={() => setCvPlayerId(null)} />}
    </div>
  );
}
