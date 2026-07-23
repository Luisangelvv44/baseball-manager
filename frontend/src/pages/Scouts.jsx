import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

export default function Scouts() {
  const { refreshTeam } = useTeam();
  const [scouts, setScouts] = useState([]);
  const [season, setSeason] = useState(null);
  const [budgets, setBudgets] = useState({});
  const [positions, setPositions] = useState({});
  const [message, setMessage] = useState('');

  const POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

  async function load() {
    const [sc, se] = await Promise.all([api.getScouts(), api.getSeason()]);
    setScouts(sc);
    setSeason(se);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleHire() {
    setMessage('');
    try {
      const res = await api.hireScout();
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

      <button onClick={handleHire} className="bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700">
        Contratar Scout ($50,000)
      </button>

      {message && <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded p-3 text-sm">{message}</div>}

      {scouts.length === 0 ? (
        <p className="text-gray-500 text-sm">No tienes scouts todavia.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {scouts.map((s) => (
            <div key={s.id} className="bg-white rounded-lg shadow p-4">
              <h3 className="font-bold">{s.name}</h3>
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
