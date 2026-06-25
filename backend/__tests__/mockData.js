const mockSeason = {
  id: 1,
  year: 2026,
  current_day: 5,
  total_days: 180,
  status: 'active',
};

const mockTeam = {
  id: 1,
  name: 'Test Team',
  budget: 5000000,
  wins: 3,
  losses: 2,
  reputation: 50,
  fan_base: 20000,
  is_user_team: true,
  division_id: 1,
  division: { id: 1, name: 'East' },
};

const mockCpuTeam = {
  id: 2,
  name: 'CPU Team',
  budget: 4000000,
  wins: 2,
  losses: 3,
  reputation: 45,
  is_user_team: false,
  division_id: 1,
};

const mockPlayer = {
  id: 10,
  name: 'John Doe',
  position: 'SP',
  age: 25,
  current_skill: 70,
  potential_coefficient: 0.8,
  salary: 100000,
  status: 'active',
  team_id: 1,
  contract_years_remaining: 2,
  rookie_contract: false,
  injury_status: null,
};

const mockFreeAgent = {
  id: 20,
  name: 'Free Agent',
  position: '1B',
  age: 28,
  current_skill: 65,
  potential_coefficient: 0.7,
  salary: 80000,
  status: 'free_agent',
  team_id: null,
  contract_years_remaining: 0,
  rookie_contract: false,
};

const mockGame = {
  id: 100,
  season_id: 1,
  day_number: 5,
  home_team_id: 1,
  away_team_id: 2,
  home_score: null,
  away_score: null,
  status: 'scheduled',
  is_user_game: true,
  home_team: { id: 1, name: 'Test Team' },
  away_team: { id: 2, name: 'CPU Team' },
};

const mockFinishedGame = {
  ...mockGame,
  home_score: 5,
  away_score: 3,
  status: 'finished',
};

const mockGameEvent = {
  id: 1,
  game_id: 100,
  event_order: 1,
  inning: 1,
  description: 'Strike out',
  event_type: 'strikeout',
};

const mockFinance = {
  id: 1,
  team_id: 1,
  season_day: 5,
  type: 'ticket_sales',
  amount: 50000,
  description: 'Home game revenue',
  created_at: new Date('2026-01-01'),
};

const mockAuction = {
  id: 1,
  season_id: 1,
  player_id: 20,
  status: 'active',
  closes_on_day: 10,
  player: { ...mockFreeAgent, salary: 80000 },
  bids: [],
};

const mockBid = {
  id: 1,
  auction_id: 1,
  team_id: 2,
  amount: 90000,
};

module.exports = {
  mockSeason,
  mockTeam,
  mockCpuTeam,
  mockPlayer,
  mockFreeAgent,
  mockGame,
  mockFinishedGame,
  mockGameEvent,
  mockFinance,
  mockAuction,
  mockBid,
};
