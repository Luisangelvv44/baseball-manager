const BASE_URL = 'http://localhost:4000/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Error en la peticion');
  }
  return data;
}

export const api = {
  // Nueva partida
  newGame: () => request('/newgame', { method: 'POST' }),

  // Equipos
  getTeams: () => request('/teams'),
  getMyTeam: () => request('/teams/user'),
  getTeam: (id) => request(`/teams/${id}`),

  // Jugadores
  getFreeAgents: () => request('/players/free-agents'),
  getScoutedPlayers: () => request('/players/scouted'),
  signPlayer: (id, years, salary) =>
    request(`/players/${id}/sign`, { method: 'POST', body: JSON.stringify({ years, salary }) }),

  // Estadio
  getStadium: () => request('/stadium'),
  setSectionPrice: (id, price) =>
    request(`/stadium/${id}/price`, { method: 'PUT', body: JSON.stringify({ price }) }),
  upgradeSection: (id) => request(`/stadium/${id}/upgrade`, { method: 'POST' }),
  buildSection: (id) => request(`/stadium/${id}/build`, { method: 'POST' }),

  // Temporada
  getSeason: () => request('/season'),
  startSeason: () => request('/season/start', { method: 'POST' }),
  advanceDay: () => request('/season/advance-day', { method: 'POST' }),

  // Partidos
  getGame: (id) => request(`/games/${id}`),
  simulateGame: (id) => request(`/games/${id}/simulate`, { method: 'POST' }),

  // Finanzas
  getFinances: () => request('/finances'),

  // Scouts
  getScouts: () => request('/scouts'),
  hireScout: () => request('/scouts', { method: 'POST' }),
  assignScout: (id, budget) =>
    request(`/scouts/${id}/assign`, { method: 'POST', body: JSON.stringify({ budget }) }),
  collectScout: (id) => request(`/scouts/${id}/collect`, { method: 'POST' }),
};
