import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';
import TeamBadge from '../components/TeamBadge.jsx';

const STATUS_LABELS = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
};

const STATUS_STYLES = {
  pending: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  expired: 'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PlayerPickerTable({ players, selected, onToggle }) {
  if (players.length === 0) {
    return <p className="text-gray-500 text-sm py-3">No hay jugadores disponibles.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-gray-500 text-left">
        <tr>
          <th className="p-2"></th>
          <th className="p-2">Nombre</th>
          <th className="p-2">Pos</th>
          <th className="p-2">Edad</th>
          <th className="p-2">Destreza</th>
          <th className="p-2">Potencial</th>
          <th className="p-2">Salario</th>
          <th className="p-2">Años</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p) => (
          <tr
            key={p.id}
            className="border-t hover:bg-gray-50 cursor-pointer"
            onClick={() => onToggle(p.id)}
          >
            <td className="p-2">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} onClick={(e) => e.stopPropagation()} />
            </td>
            <td className="p-2 font-medium">{p.first_name} {p.last_name}</td>
            <td className="p-2">{p.position}</td>
            <td className="p-2">{p.age}</td>
            <td className="p-2">{p.current_skill}</td>
            <td className="p-2 font-semibold text-amber-700">{p.potential_coefficient}</td>
            <td className="p-2">${Number(p.salary).toLocaleString()}</td>
            <td className="p-2">{p.contract_years_remaining}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ProposeTradeSection({ myPlayers, cpuTeams, onProposed }) {
  const [recipientTeamId, setRecipientTeamId] = useState('');
  const [cpuRoster, setCpuRoster] = useState([]);
  const [offeredIds, setOfferedIds] = useState(new Set());
  const [requestedIds, setRequestedIds] = useState(new Set());
  const [cashAdjustment, setCashAdjustment] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setOfferedIds(new Set());
    setRequestedIds(new Set());
    setCashAdjustment('');
    setMessage('');
    if (!recipientTeamId) { setCpuRoster([]); return; }
    api.getTeam(recipientTeamId).then((data) => setCpuRoster(data.players));
  }, [recipientTeamId]);

  function toggleOffered(id) {
    setOfferedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleRequested(id) {
    setRequestedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handlePropose() {
    setMessage('');
    if (offeredIds.size === 0 || requestedIds.size === 0) {
      setMessage('Selecciona al menos un jugador de cada equipo.');
      return;
    }
    const adj = Math.round(Number(cashAdjustment) || 0);
    const cashOffered = adj > 0 ? adj : 0;
    const cashRequested = adj < 0 ? -adj : 0;

    setLoading(true);
    try {
      const res = await api.proposeTrade(
        Number(recipientTeamId),
        [...offeredIds],
        [...requestedIds],
        cashOffered,
        cashRequested
      );
      setMessage(res.accepted ? '¡El equipo rival aceptó tu propuesta!' : 'El equipo rival rechazó tu propuesta.');
      setOfferedIds(new Set());
      setRequestedIds(new Set());
      setCashAdjustment('');
      await onProposed();
      if (recipientTeamId) {
        const refreshed = await api.getTeam(recipientTeamId);
        setCpuRoster(refreshed.players);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      <h3 className="font-bold text-lg">Proponer Traspaso</h3>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Equipo rival</label>
        <select
          value={recipientTeamId}
          onChange={(e) => setRecipientTeamId(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-full max-w-xs"
        >
          <option value="">Selecciona un equipo</option>
          {cpuTeams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {recipientTeamId && (
        <>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold text-sm mb-1">Tu roster (ofreces)</h4>
              <div className="border rounded overflow-x-auto max-h-80 overflow-y-auto">
                <PlayerPickerTable players={myPlayers} selected={offeredIds} onToggle={toggleOffered} />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-1">Roster rival (pides)</h4>
              <div className="border rounded overflow-x-auto max-h-80 overflow-y-auto">
                <PlayerPickerTable players={cpuRoster} selected={requestedIds} onToggle={toggleRequested} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ajuste en efectivo (positivo = tú pagas, negativo = ellos pagan)
            </label>
            <input
              type="number"
              step={10000}
              value={cashAdjustment}
              onChange={(e) => setCashAdjustment(e.target.value)}
              placeholder="0"
              className="border rounded px-3 py-2 text-sm w-full max-w-xs"
            />
          </div>

          {message && <p className="text-sm">{message}</p>}

          <button
            onClick={handlePropose}
            disabled={loading}
            className="bg-blue-600 text-white rounded px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Proponer Traspaso
          </button>
        </>
      )}
    </div>
  );
}

function PlayerLine({ player, right }) {
  return (
    <li className="border-b border-gray-100 last:border-0 py-1">
      <div className={`flex items-center gap-2 ${right ? 'justify-end' : 'justify-between'}`}>
        {right && <span className="text-gray-400 text-xs">{player.position} · {player.age}a</span>}
        <span className="font-medium">{player.first_name} {player.last_name}</span>
        {!right && <span className="text-gray-400 text-xs">{player.position} · {player.age}a</span>}
      </div>
      <div className={`flex flex-wrap items-center gap-2 text-xs text-gray-500 mt-0.5 ${right ? 'justify-end' : ''}`}>
        <span>Destreza <span className="font-semibold text-gray-700">{player.current_skill}</span></span>
        <span>Potencial <span className="font-semibold text-amber-700">{player.potential_coefficient}</span></span>
        <span>${Number(player.salary).toLocaleString()}/año</span>
        <span>{player.contract_years_remaining} año(s)</span>
      </div>
    </li>
  );
}

function SideTotals({ items, align }) {
  if (items.length === 0) return null;
  const totalSkill = items.reduce((s, i) => s + i.player.current_skill, 0);
  const totalSalary = items.reduce((s, i) => s + Number(i.player.salary), 0);
  return (
    <p className={`text-xs text-gray-500 mt-1 pt-1 border-t border-gray-100 ${align === 'right' ? 'text-right' : ''}`}>
      Total destreza: <span className="font-semibold text-gray-700">{totalSkill}</span> · Total salario: <span className="font-semibold text-gray-700">${totalSalary.toLocaleString()}</span>/año
    </p>
  );
}

function TradeCard({ trade, myTeamId, onAccept, onReject, onCancel }) {
  const myItems = trade.items.filter((i) => i.from_team_id === myTeamId);
  const theirItems = trade.items.filter((i) => i.from_team_id !== myTeamId);
  const otherTeam = trade.proposer_team_id === myTeamId ? trade.recipient_team : trade.proposer_team;
  const isReceived = trade.recipient_team_id === myTeamId;
  const cashToMe = isReceived ? Number(trade.cash_offered) : Number(trade.cash_requested);
  const cashFromMe = isReceived ? Number(trade.cash_requested) : Number(trade.cash_offered);

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">vs</span>
          <TeamBadge name={otherTeam?.name} />
        </div>
        <StatusBadge status={trade.status} />
      </div>

      <div className="flex items-start gap-4 text-sm">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 mb-1">Tú entregas</p>
          {myItems.length === 0 ? <p className="text-gray-400 italic text-xs">Nada</p> : (
            <>
              <ul>
                {myItems.map((i) => <PlayerLine key={i.id} player={i.player} />)}
              </ul>
              <SideTotals items={myItems} />
            </>
          )}
          {cashFromMe > 0 && <p className="text-xs text-red-600 mt-1">Pagas: ${cashFromMe.toLocaleString()}</p>}
        </div>

        <div className="flex flex-col items-center justify-center self-stretch shrink-0 text-gray-300 px-2">
          <div className="border-l h-full border-gray-200" />
          <span className="text-lg -my-3 bg-white px-1">⇄</span>
          <div className="border-l h-full border-gray-200" />
        </div>

        <div className="flex-1 min-w-0 text-right">
          <p className="text-xs text-gray-500 mb-1">Recibes</p>
          {theirItems.length === 0 ? <p className="text-gray-400 italic text-xs">Nada</p> : (
            <>
              <ul>
                {theirItems.map((i) => <PlayerLine key={i.id} player={i.player} right />)}
              </ul>
              <SideTotals items={theirItems} align="right" />
            </>
          )}
          {cashToMe > 0 && <p className="text-xs text-green-700 mt-1">Recibes: ${cashToMe.toLocaleString()}</p>}
        </div>
      </div>

      {trade.status === 'pending' && (
        <div className="flex gap-2 justify-end pt-1">
          {isReceived ? (
            <>
              <button onClick={() => onReject(trade.id)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
                Rechazar
              </button>
              <button onClick={() => onAccept(trade.id)} className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700">
                Aceptar
              </button>
            </>
          ) : (
            <button onClick={() => onCancel(trade.id)} className="px-3 py-1 text-sm border rounded hover:bg-gray-50">
              Cancelar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Trades() {
  const { myTeam, refreshTeam } = useTeam();
  const [myPlayers, setMyPlayers] = useState([]);
  const [cpuTeams, setCpuTeams] = useState([]);
  const [received, setReceived] = useState([]);
  const [sent, setSent] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');

  async function load() {
    const [myTeamData, teams, receivedTrades, sentTrades, historyTrades] = await Promise.all([
      api.getMyTeam(),
      api.getTeams(),
      api.getReceivedTrades(),
      api.getSentTrades(),
      api.getTradeHistory(),
    ]);
    setMyPlayers(myTeamData.players.filter((p) => p.level !== 'MINOR'));
    setCpuTeams(teams.filter((t) => !t.is_user_team));
    setReceived(receivedTrades);
    setSent(sentTrades.filter((t) => t.status === 'pending'));
    setHistory(historyTrades);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAccept(id) {
    setMessage('');
    try {
      await api.acceptTrade(id);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleReject(id) {
    setMessage('');
    try {
      await api.rejectTrade(id);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleCancel(id) {
    setMessage('');
    try {
      await api.cancelTrade(id);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const myTeamId = myTeam?.id;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Traspasos</h2>
      {message && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
          {message}
        </div>
      )}

      <ProposeTradeSection myPlayers={myPlayers} cpuTeams={cpuTeams} onProposed={load} />

      <div>
        <h3 className="font-bold text-lg mb-2">Ofertas Recibidas {received.length > 0 && `(${received.length})`}</h3>
        {received.length === 0 ? (
          <p className="text-gray-500 text-sm">No tienes ofertas pendientes de otros equipos.</p>
        ) : (
          <div className="space-y-4">
            {received.map((t) => (
              <TradeCard key={t.id} trade={t} myTeamId={myTeamId} onAccept={handleAccept} onReject={handleReject} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-lg mb-2">Ofertas Enviadas {sent.length > 0 && `(${sent.length})`}</h3>
        {sent.length === 0 ? (
          <p className="text-gray-500 text-sm">No tienes ofertas pendientes enviadas.</p>
        ) : (
          <div className="space-y-4">
            {sent.map((t) => (
              <TradeCard key={t.id} trade={t} myTeamId={myTeamId} onAccept={handleAccept} onReject={handleReject} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-bold text-lg mb-2">Historial</h3>
        {history.length === 0 ? (
          <p className="text-gray-500 text-sm">Aún no hay traspasos resueltos.</p>
        ) : (
          <div className="space-y-4">
            {history.map((t) => (
              <TradeCard key={t.id} trade={t} myTeamId={myTeamId} onAccept={handleAccept} onReject={handleReject} onCancel={handleCancel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
