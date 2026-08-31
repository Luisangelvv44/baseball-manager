import { useEffect, useState } from 'react';
import { api } from '../api.js';
import TeamBadge from '../components/TeamBadge.jsx';

const USER_TEAM_ID = 1;

const money = (n) => `$${Number(n || 0).toLocaleString()}`;

export default function Toddlers() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');

  async function load() {
    try {
      const d = await api.getToddlers();
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleContribute(e) {
    e.preventDefault();
    const value = Math.round(Number(amount));
    if (!Number.isFinite(value) || value <= 0) {
      setMessage('Ingresa un monto valido.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await api.contributeToddlers(value);
      setMessage(`Aportaste ${money(value)}. Total de tu equipo: ${money(res.userTotal)}.`);
      setAmount('');
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdvance() {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.advanceToddlerPick();
      if (res.complete) setMessage('La ronda de eleccion ha terminado.');
      else if (res.isUserTurn) setMessage('Es el turno de tu equipo — elige 2 toddlers.');
      else if (res.picked) setMessage(`La CPU eligio a ${res.picked.name}.`);
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePick(playerId) {
    setBusy(true);
    setMessage('');
    try {
      const res = await api.toddlerPick(playerId);
      setMessage(`Elegiste a ${res.player.name}.${res.complete ? ' La ronda ha terminado.' : ''}`);
      await load();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-gray-500">Cargando...</p>;

  if (!data || (!data.active && !data.selecting)) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Programa de Toddlers</h2>
        <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
          El Programa de Toddlers se inicia al comenzar una nueva partida.
        </div>
      </div>
    );
  }

  const { active, selecting } = data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Programa de Toddlers</h2>
        {selecting ? (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-700">
            Eleccion en curso
          </span>
        ) : (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
            Ciclo #{active?.cycle_number} · Año {active?.seasons_elapsed}/{active?.seasons_total}
          </span>
        )}
      </div>

      {message && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">{message}</div>
      )}

      {/* ---------- Ronda de eleccion ---------- */}
      {selecting && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <SelectionCard selecting={selecting} busy={busy} onAdvance={handleAdvance} />
            <ToddlerTable
              toddlers={selecting.toddlers}
              selectable={selecting.is_user_turn}
              busy={busy}
              onPick={handlePick}
            />
          </div>
          <PickOrderPanel selecting={selecting} />
        </div>
      )}

      {/* ---------- Ciclo activo ---------- */}
      {!selecting && active && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white rounded-lg shadow p-4 grid sm:grid-cols-3 gap-4 text-sm">
              <Stat label="Fondo del programa" value={money(active.budget)} />
              <Stat label="Temporadas restantes" value={`${active.years_remaining}`} />
              <Stat
                label="Prob. de mejora (este año)"
                value={`${Math.round(active.next_improve_prob * 100)}%`}
              />
            </div>

            <form onSubmit={handleContribute} className="bg-white rounded-lg shadow p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800">Aportar al programa</h3>
                <span className="text-xs text-gray-500">
                  Tu aporte acumulado: <span className="font-semibold">{money(active.user_total)}</span>
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Presupuesto de tu equipo: {money(active.user_budget)}. Aporta lo que quieras — define
                tu lugar en el orden de eleccion.
              </p>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Monto"
                  className="border rounded px-2 py-1 text-sm flex-1"
                />
                <button
                  type="submit"
                  disabled={busy || !amount}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded font-semibold hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {busy ? '...' : 'Aportar'}
                </button>
              </div>
            </form>

            <ToddlerTable toddlers={active.toddlers} selectable={false} busy={busy} onPick={handlePick} />
          </div>

          <ContributionsPanel contributions={active.contributions} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-gray-500">{label}</p>
      <p className="font-semibold text-gray-900 text-base">{value}</p>
    </div>
  );
}

function SelectionCard({ selecting, busy, onAdvance }) {
  const done = selecting.current_pick > selecting.total_picks;
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">
          Pick {Math.min(selecting.current_pick, selecting.total_picks)} de {selecting.total_picks}
          {' · '}Ciclo #{selecting.cycle_number}
        </p>
        {!done && selecting.current_team && (
          <p className="font-semibold flex items-center gap-1.5">
            <span>Turno de:</span>
            <TeamBadge
              name={selecting.current_team.team_name}
              className={selecting.current_team.is_user_team ? 'text-blue-600 font-bold' : ''}
            />
            {selecting.current_team.is_user_team && <span className="text-blue-600">(Tu equipo)</span>}
          </p>
        )}
        {done && <p className="font-semibold text-gray-600">Ronda completada</p>}
      </div>
      {!done && !selecting.is_user_turn && (
        <button
          onClick={onAdvance}
          disabled={busy}
          className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? 'Avanzando...' : 'Avanzar seleccion CPU'}
        </button>
      )}
      {!done && selecting.is_user_turn && (
        <div className="text-sm text-blue-700 font-medium bg-blue-50 px-3 py-2 rounded">
          Es tu turno — elige un toddler abajo
        </div>
      )}
    </div>
  );
}

function ToddlerTable({ toddlers, selectable, busy, onPick }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th className="p-2">Nombre</th>
            <th className="p-2">Pos</th>
            <th className="p-2">Edad</th>
            <th className="p-2">Destreza</th>
            <th className="p-2">Potencial</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {toddlers.map((t) => {
            const owned = t.owner_team_id != null;
            return (
              <tr key={t.id} className="border-t hover:bg-gray-50">
                <td className="p-2 font-medium">
                  {t.first_name} {t.last_name}
                </td>
                <td className="p-2">
                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">{t.position}</span>
                </td>
                <td className="p-2">{t.age}</td>
                <td className="p-2 font-semibold">
                  <span className={t.current_skill < 0 ? 'text-red-600' : 'text-gray-800'}>
                    {t.current_skill}
                  </span>
                </td>
                <td className="p-2">
                  <span
                    className={`font-semibold ${
                      t.potential_coefficient >= 80
                        ? 'text-purple-600'
                        : t.potential_coefficient >= 65
                        ? 'text-blue-600'
                        : 'text-gray-600'
                    }`}
                  >
                    {t.potential_coefficient}
                  </span>
                </td>
                <td className="p-2 text-right">
                  {owned ? (
                    <span className="text-xs text-gray-500">
                      <TeamBadge name={t.owner_team_name} />
                    </span>
                  ) : selectable ? (
                    <button
                      onClick={() => onPick(t.id)}
                      disabled={busy}
                      className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Elegir
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContributionsPanel({ contributions }) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold text-gray-800">Orden de eleccion (proyectado)</h3>
      <p className="text-xs text-gray-500">Por total aportado a lo largo del ciclo.</p>
      <div className="bg-white rounded-lg shadow divide-y max-h-[32rem] overflow-y-auto">
        {contributions.map((c, i) => (
          <div
            key={c.team_id}
            className={`px-3 py-2 text-sm flex items-center justify-between ${c.is_user_team ? 'bg-blue-50' : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-400 w-5 text-right shrink-0">#{i + 1}</span>
              <TeamBadge
                name={c.team_name}
                className={c.is_user_team ? 'font-bold text-blue-700' : 'text-gray-800'}
              />
            </div>
            <span className="text-gray-600 tabular-nums shrink-0">{money(c.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickOrderPanel({ selecting }) {
  return (
    <div className="space-y-3">
      <h3 className="font-bold text-gray-800">Orden de eleccion</h3>
      <div className="bg-white rounded-lg shadow divide-y max-h-[32rem] overflow-y-auto">
        {selecting.pick_order.map((p) => {
          const isCurrent = p.pick === selecting.current_pick;
          const isPast = p.pick < selecting.current_pick;
          return (
            <div
              key={p.pick}
              className={`px-3 py-2 text-sm flex items-center justify-between ${isCurrent ? 'bg-blue-50' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 w-6 text-right shrink-0">#{p.pick}</span>
                <TeamBadge
                  name={p.team_name}
                  className={p.is_user_team ? 'font-bold text-blue-700' : 'text-gray-800'}
                />
              </div>
              {isCurrent && <span className="text-xs text-blue-600 font-medium">Ahora</span>}
              {isPast && <span className="text-xs text-gray-300">✓</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
