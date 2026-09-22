import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

export default function Scouts() {
  const { refreshTeam } = useTeam();
  const [scouts, setScouts] = useState([]);
  const [season, setSeason] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [selectedTier, setSelectedTier] = useState('basico');
  const [budgets, setBudgets] = useState({});
  const [positions, setPositions] = useState({});
  const [message, setMessage] = useState('');

  const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

  async function load() {
    const [sc, se, ti] = await Promise.all([api.getScouts(), api.getSeason(), api.getScoutTiers()]);
    setScouts(sc);
    setSeason(se);
    setTiers(ti);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleHire() {
    setMessage('');
    try {
      const res = await api.hireScout(selectedTier);
      setMessage(`Scout contratado: ${res.scout.name} (skill ${res.scout.skill_level}).`);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleAssign(id) {
    const budget = Number(budgets[id]);
    if (!budget || budget <= 0) {
      setMessage('Ingresa un presupuesto valido para la mision.');
      return;
    }
    const targetPosition = positions[id] || null;
    setMessage('');
    try {
      const res = await api.assignScout(id, budget, targetPosition);
      const posLabel = targetPosition ? ` buscando ${targetPosition}` : '';
      setMessage(`Mision asignada${posLabel}. Termina en el dia ${res.missionEndDay}.`);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleFire(id, name) {
    setMessage('');
    try {
      await api.fireScout(id);
      setMessage(`${name} ha sido despedido.`);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleCollect(id) {
    setMessage('');
    try {
      const res = await api.collectScout(id);
      const names = res.prospects.map((p) => `${p.first_name} ${p.last_name} (pot. ${p.potential_coefficient})`).join(', ');
      const skippedNote = res.skipped > 0
        ? ` ${res.skipped} prospecto(s) se perdieron por falta de espacio en Minors o presupuesto.`
        : '';
      setMessage(
        res.prospects.length > 0
          ? `Fichados automaticamente en Ligas Menores: ${names}.${skippedNote} Revisalos en la pestaña Rookie.`
          : `No se pudo fichar ningun prospecto (roster de Minors lleno o presupuesto insuficiente).${skippedNote}`
      );
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Scouts</h2>

      {tiers.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 space-y-3">
          <h3 className="font-semibold text-sm text-gray-700">Nivel del scout a contratar</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {tiers.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTier(t.id)}
                className={`text-left border rounded p-3 hover:border-blue-400 ${
                  selectedTier === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-xs text-gray-500">Skill {t.skillMin}-{t.skillMax}</div>
                <div className="text-sm font-medium mt-1">${t.cost.toLocaleString()}</div>
              </button>
            ))}
          </div>
          <button onClick={handleHire} className="bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700">
            Contratar Scout
          </button>
        </div>
      )}

      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      {scouts.length === 0 ? (
        <p className="text-gray-500 text-sm">No tienes scouts todavia.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {scouts.map((s) => (
            <div key={s.id} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-start justify-between">
                <h3 className="font-bold">{s.name}</h3>
                {!s.active_mission && (
                  <button
                    onClick={() => handleFire(s.id, s.name)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Despedir
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-2">Nivel de scout: {s.skill_level}</p>

              {!s.active_mission ? (
                <div className="space-y-2">
                  <select
                    value={positions[s.id] || ''}
                    onChange={(e) => setPositions({ ...positions, [s.id]: e.target.value })}
                    className="border rounded px-2 py-1 w-full"
                  >
                    <option value="">Cualquier posicion</option>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Presupuesto mision"
                      value={budgets[s.id] || ''}
                      onChange={(e) => setBudgets({ ...budgets, [s.id]: e.target.value })}
                      className="border rounded px-2 py-1 flex-1"
                    />
                    <button onClick={() => handleAssign(s.id)} className="bg-blue-600 text-white rounded px-3 py-1 hover:bg-blue-700">
                      Enviar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  <p className="mb-2">
                    En mision{s.target_position ? ` (buscando ${s.target_position})` : ''} (presupuesto ${Number(s.budget_assigned).toLocaleString()}). Termina el dia {s.mission_end_day}
                    {season ? ` (hoy es dia ${season.current_day})` : ''}.
                  </p>
                  <button
                    onClick={() => handleCollect(s.id)}
                    disabled={season && season.current_day < s.mission_end_day}
                    className="bg-amber-600 text-white rounded px-3 py-1 hover:bg-amber-700 disabled:opacity-50"
                  >
                    Recolectar prospectos
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
