import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTeam } from '../context/TeamContext.jsx';

const SPECIALTY_LABELS = {
  BATTING: { label: 'Bateo', color: 'bg-amber-100 text-amber-800', desc: '+2-3 skill/año al asignado' },
  PITCHING: { label: 'Pitcheo', color: 'bg-blue-100 text-blue-800', desc: '+2-3 skill/año al asignado' },
  CONDITIONING: { label: 'Acondicionamiento', color: 'bg-green-100 text-green-800', desc: 'Reduce decline en 40%' },
};

const MAX_COACHES = 3;

export default function Coaches() {
  const { refreshTeam } = useTeam();
  const [coaches, setCoaches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [team, setTeam] = useState(null);
  const [message, setMessage] = useState('');
  const [assigningCoach, setAssigningCoach] = useState(null);

  async function load() {
    const [coachData, teamData] = await Promise.all([api.getCoaches(), api.getMyTeam()]);
    setCoaches(coachData);
    setTeam(teamData.team);
    setPlayers(teamData.players.filter((p) => p.status === 'active'));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleHire() {
    setMessage('');
    try {
      const res = await api.hireCoach();
      setMessage(
        `Coach contratado: ${res.coach.name} — ${SPECIALTY_LABELS[res.coach.specialty]?.label} (nivel ${res.coach.skill_level}). Honorario de contratación: $${res.hiringFee.toLocaleString()}.`
      );
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleFire(id, name) {
    setMessage('');
    try {
      await api.fireCoach(id);
      setMessage(`${name} ha sido despedido.`);
      await Promise.all([load(), refreshTeam()]);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleAssign(coachId, playerId) {
    setMessage('');
    try {
      await api.assignCoach(coachId, playerId || null);
      setMessage(playerId ? 'Jugador asignado al coach.' : 'Asignación removida.');
      setAssigningCoach(null);
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }

  const assignedPlayerIds = new Set(coaches.map((c) => c.assigned_player_id).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Cuerpo Técnico</h2>
        {team && (
          <span className="text-sm text-gray-500">
            Presupuesto: <span className="font-semibold text-gray-800">${Number(team.budget).toLocaleString()}</span>
          </span>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
        Los coaches aplican su bono al final de cada temporada. Los salarios se cobran al inicio de cada temporada.
        Máximo {MAX_COACHES} coaches.
      </div>

      {coaches.length < MAX_COACHES && (
        <button
          onClick={handleHire}
          className="bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700"
        >
          Contratar Coach (especialidad aleatoria)
        </button>
      )}

      {message && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded p-3 text-sm">{message}</div>
      )}

      {coaches.length === 0 ? (
        <p className="text-gray-500 text-sm">No tienes coaches todavia. Contrata uno para potenciar tus jugadores.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {coaches.map((c) => {
            const spec = SPECIALTY_LABELS[c.specialty] ?? { label: c.specialty, color: 'bg-gray-100 text-gray-700', desc: '' };
            return (
              <div key={c.id} className="bg-white rounded-lg shadow p-4 space-y-3">
                <div>
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-gray-900">{c.name}</h3>
                    <button
                      onClick={() => handleFire(c.id, c.name)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Despedir
                    </button>
                  </div>
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-1 ${spec.color}`}>
                    {spec.label}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">{spec.desc}</p>
                </div>

                <div className="text-sm text-gray-700 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Nivel</span>
                    <span className="font-medium">{c.skill_level}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Salario anual</span>
                    <span className="font-medium">${c.salary.toLocaleString()}</span>
                  </div>
                </div>

                <div className="border-t pt-3">
                  {c.assigned_player ? (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-gray-500">Asignado:</span>{' '}
                        <span className="font-medium">
                          {c.assigned_player.first_name} {c.assigned_player.last_name}
                        </span>
                        <span className="text-gray-400 ml-1">({c.assigned_player.position})</span>
                      </div>
                      <button
                        onClick={() => setAssigningCoach(c)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Cambiar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAssigningCoach(c)}
                      className="w-full text-sm text-center border border-dashed border-gray-300 rounded py-1 text-gray-500 hover:border-blue-400 hover:text-blue-600"
                    >
                      + Asignar jugador
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign player modal */}
      {assigningCoach && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold">Asignar jugador a {assigningCoach.name}</h3>
            <p className="text-sm text-gray-500">
              Especialidad: <strong>{SPECIALTY_LABELS[assigningCoach.specialty]?.label}</strong>
            </p>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {assigningCoach.assigned_player_id && (
                <button
                  onClick={() => handleAssign(assigningCoach.id, null)}
                  className="w-full text-left px-3 py-2 text-sm rounded border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Quitar asignación actual
                </button>
              )}
              {players
                .filter((p) => !assignedPlayerIds.has(p.id) || p.id === assigningCoach.assigned_player_id)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAssign(assigningCoach.id, p.id)}
                    className={`w-full text-left px-3 py-2 text-sm rounded border hover:bg-blue-50 hover:border-blue-300 ${
                      p.id === assigningCoach.assigned_player_id
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <span className="font-medium">{p.first_name} {p.last_name}</span>
                    <span className="text-gray-500 ml-2">
                      {p.position} · Destreza {p.current_skill}
                    </span>
                  </button>
                ))}
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setAssigningCoach(null)}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
