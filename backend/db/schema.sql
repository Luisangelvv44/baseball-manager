-- ============================================
-- Baseball Manager - Schema
-- ============================================

DROP TABLE IF EXISTS game_events CASCADE;
DROP TABLE IF EXISTS game_lineups CASCADE;
DROP TABLE IF EXISTS schedule CASCADE;
DROP TABLE IF EXISTS scouts CASCADE;
DROP TABLE IF EXISTS finances CASCADE;
DROP TABLE IF EXISTS stadium_sections CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS seasons CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS divisions CASCADE;

CREATE TABLE divisions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  division_id INTEGER REFERENCES divisions(id),
  is_user_team BOOLEAN DEFAULT FALSE,
  budget NUMERIC(14,2) DEFAULT 0,
  reputation INTEGER DEFAULT 50,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  runs_scored INTEGER DEFAULT 0,
  runs_allowed INTEGER DEFAULT 0
);

CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  age INTEGER NOT NULL,
  position VARCHAR(10) NOT NULL,
  potential_coefficient INTEGER NOT NULL,
  growth_age INTEGER NOT NULL,
  current_skill INTEGER NOT NULL,
  salary NUMERIC(12,2) NOT NULL,
  contract_years_remaining INTEGER DEFAULT 1,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'active' -- active, free_agent, scouted, retired
);

CREATE TABLE seasons (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  current_day INTEGER DEFAULT 1,
  total_days INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' -- active, finished
);

CREATE TABLE schedule (
  id SERIAL PRIMARY KEY,
  season_id INTEGER REFERENCES seasons(id),
  day_number INTEGER NOT NULL,
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(20) DEFAULT 'scheduled', -- scheduled, finished
  is_user_game BOOLEAN DEFAULT FALSE
);

-- row/col start at 1. section_type: 'field', 'grandstand', 'empty'
CREATE TABLE stadium_sections (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  row_pos INTEGER NOT NULL,
  col_pos INTEGER NOT NULL,
  section_type VARCHAR(20) NOT NULL,
  label VARCHAR(50),
  price_per_ticket NUMERIC(8,2) DEFAULT 0,
  upgrade_level INTEGER DEFAULT 0,
  capacity INTEGER DEFAULT 0
);

CREATE TABLE finances (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  season_day INTEGER,
  type VARCHAR(30) NOT NULL, -- ticket_sales, merch_sales, salaries, stadium_upgrade, scouting, signing, operating_cost
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scouts (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name VARCHAR(100),
  skill_level INTEGER DEFAULT 50,
  budget_assigned NUMERIC(10,2) DEFAULT 0,
  active_mission BOOLEAN DEFAULT FALSE,
  mission_end_day INTEGER
);

CREATE TABLE game_lineups (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES schedule(id),
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  batting_order INTEGER,
  position VARCHAR(10)
);

CREATE TABLE game_events (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES schedule(id),
  inning INTEGER,
  half VARCHAR(4),
  batting_team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  result VARCHAR(10),
  outs_after INTEGER,
  runs_scored INTEGER DEFAULT 0,
  event_order INTEGER
);

CREATE INDEX idx_players_team ON players(team_id);
CREATE INDEX idx_players_status ON players(status);
CREATE INDEX idx_schedule_season_day ON schedule(season_id, day_number);
CREATE INDEX idx_game_events_game ON game_events(game_id);
CREATE INDEX idx_stadium_team ON stadium_sections(team_id);
CREATE INDEX idx_finances_team ON finances(team_id);
