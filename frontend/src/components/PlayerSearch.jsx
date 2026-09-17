import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import PlayerCareerModal from './PlayerCareerModal.jsx';

function statusLine(p) {
  if (p.team_name) return p.team_name;
  if (p.status === 'retired') return p.last_team_name ? `Retirado — ${p.last_team_name}` : 'Retirado';
  if (p.status === 'free_agent') return 'Agente libre';
  if (p.status === 'toddler_program') return 'Programa de Toddlers';
  return p.status;
}

export default function PlayerSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      api.searchPlayers(q)
        .then((res) => setResults(res.players))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next) {
      setQuery('');
      setResults([]);
    }
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        title="Buscar jugador"
        aria-label="Buscar jugador"
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
          open ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white text-gray-800 rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-gray-200">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar jugador por nombre..."
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && <div className="px-3 py-6 text-center text-sm text-gray-500">Buscando...</div>}

            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-gray-500">Sin resultados</div>
            )}

            {!loading && query.trim().length < 2 && (
              <div className="px-3 py-6 text-center text-sm text-gray-400">Escribe al menos 2 letras</div>
            )}

            {!loading && results.length > 0 && (
              <ul className="divide-y divide-gray-100">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{p.first_name} {p.last_name}</span>
                        <span className="text-xs text-gray-400 shrink-0">{p.position} · {p.age} años</span>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{statusLine(p)}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {selectedId && (
        <PlayerCareerModal playerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
