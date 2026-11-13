import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function NewGame() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  async function handleNewGame() {
    if (!confirm('Esto reiniciara TODA la liga (tu equipo, los 15 CPU, temporada y calendario). ¿Continuar?')) return;

    setLoading(true);
    setMessage('');
    try {
      await api.newGame();
      setMessage('¡Nueva partida creada! Empiezas con $10,000,000, sin jugadores, sin scouts, y un estadio basico (1 grada a cada lado del campo).');
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto bg-white rounded-lg shadow p-6 text-center space-y-4">
      <img src="/logo.svg" alt="Baseball Manager" className="h-28 w-28 mx-auto" />
      <h2 className="text-2xl font-bold">Nueva Partida</h2>
      <p className="text-gray-600">
        Se crearan 4 divisiones de 6 equipos cada una (24 equipos en total). Los otros 23 equipos
        tendran sus propios rosters y finanzas. Tu equipo arrancara desde cero: $10,000,000,
        sin jugadores ni scouts, y con un estadio inicial de 1 grada a cada lado del campo.
      </p>
      <button
        onClick={handleNewGame}
        disabled={loading}
        className="bg-red-600 text-white px-6 py-3 rounded font-semibold hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? 'Creando...' : 'Crear Nueva Partida'}
      </button>
      {message && <p className="text-sm text-blue-700">{message}</p>}
    </div>
  );
}
