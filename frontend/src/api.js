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
  getTeamsOverview: () => request('/teams/overview'),

  // Jugadores
  getFreeAgents: () => request('/players/free-agents'),
  getScoutedPlayers: () => request('/players/scouted'),
  signPlayer: (id, years, salary) =>
    request(`/players/${id}/sign`, { method: 'POST', body: JSON.stringify({ years, salary }) }),
  renewContract: (id, salary, years) =>
    request(`/players/${id}/renew`, { method: 'POST', body: JSON.stringify({ salary, years }) }),
  getTeamStats: () => request('/players/team-stats'),
  getPlayerStats: (id) => request(`/players/${id}/stats`),

  // Estadio
  getStadium: () => request('/stadium'),
  setSectionPrice: (id, price) =>
    request(`/stadium/${id}/price`, { method: 'PUT', body: JSON.stringify({ price }) }),
  upgradeSection: (id) => request(`/stadium/${id}/upgrade`, { method: 'POST' }),
  buildSection: (id) => request(`/stadium/${id}/build`, { method: 'POST' }),
  expandStadiumFloor: () => request('/stadium/expand-floor', { method: 'POST' }),

  // Temporada
  getSeason: () => request('/season'),
  getSchedule: () => request('/season/schedule'),
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
  assignScout: (id, budget, targetPosition = null) =>
    request(`/scouts/${id}/assign`, { method: 'POST', body: JSON.stringify({ budget, ...(targetPosition ? { target_position: targetPosition } : {}) }) }),
  collectScout: (id) => request(`/scouts/${id}/collect`, { method: 'POST' }),

  // Lineup
  getLineup: () => request('/lineup'),
  saveLineup: (pitcherIds, batterIds) =>
    request('/lineup', { method: 'PUT', body: JSON.stringify({ pitcherIds, batterIds }) }),

  // Subastas
  getAuctions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const s = qs.toString();
    return request(s ? `/auctions?${s}` : '/auctions');
  },
  getAuction: (id) => request(`/auctions/${id}`),
  placeBid: (id, amount, years) =>
    request(`/auctions/${id}/bid`, { method: 'POST', body: JSON.stringify({ amount, years }) }),

  // Playoffs
  getPlayoffs: () => request('/playoffs'),
  simulatePlayoffGame: (seriesId) => request(`/playoffs/simulate-game/${seriesId}`, { method: 'POST' }),
  simulatePlayoffRound: () => request('/playoffs/simulate-round', { method: 'POST' }),
  advancePlayoffRound: () => request('/playoffs/advance-round', { method: 'POST' }),

  // Coaches
  getCoaches: () => request('/coaches'),
  hireCoach: () => request('/coaches/hire', { method: 'POST' }),
  assignCoach: (id, playerId) =>
    request(`/coaches/${id}/assign`, { method: 'POST', body: JSON.stringify({ playerId }) }),
  fireCoach: (id) => request(`/coaches/${id}/fire`, { method: 'DELETE' }),

  // Draft
  getDraft: () => request('/draft/current'),
  advanceDraftPick: () => request('/draft/advance', { method: 'POST' }),
  draftPick: (prospectId) => request('/draft/pick', { method: 'POST', body: JSON.stringify({ prospectId }) }),

  // Noticias
  getNews: (day, seasonId) => {
    const params = new URLSearchParams();
    if (day != null) params.set('day', day);
    if (seasonId != null) params.set('seasonId', seasonId);
    const qs = params.toString();
    return request(qs ? `/news?${qs}` : '/news');
  },

  // Históricos
  getChampionsHistory: () => request('/history/champions'),
  getSeasonHistory: () => request('/history/seasons'),

  // Transmisión
  getBroadcastOffers: () => request('/broadcast/offers'),
  acceptOffer: (id) => request(`/broadcast/offers/${id}/accept`, { method: 'POST' }),
  rejectOffer: (id) => request(`/broadcast/offers/${id}/reject`, { method: 'POST' }),
  getBroadcastContract: () => request('/broadcast/contract'),
  getBroadcastCompanies: () => request('/broadcast/companies'),
};
