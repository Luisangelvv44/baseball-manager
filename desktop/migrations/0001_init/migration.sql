-- CreateTable
CREATE TABLE "Division" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "division_id" INTEGER,
    "is_user_team" BOOLEAN NOT NULL DEFAULT false,
    "budget" DECIMAL NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "runs_scored" INTEGER NOT NULL DEFAULT 0,
    "runs_allowed" INTEGER NOT NULL DEFAULT 0,
    "bid_aggressiveness" REAL NOT NULL DEFAULT 0.10,
    "player_investment_rate" REAL NOT NULL DEFAULT 0.1,
    "desperation_index" REAL NOT NULL DEFAULT 0,
    "min_growth_threshold" REAL NOT NULL DEFAULT 1.5,
    "fan_base" INTEGER NOT NULL DEFAULT 0,
    "min_fan_base_season" INTEGER,
    "max_fan_base_season" INTEGER,
    "stadium_floors" INTEGER NOT NULL DEFAULT 1,
    "field_level" INTEGER NOT NULL DEFAULT 1,
    "lights_level" INTEGER NOT NULL DEFAULT 1,
    "board_level" INTEGER NOT NULL DEFAULT 1,
    "medical_level" INTEGER NOT NULL DEFAULT 1,
    "facade_entrance_level" INTEGER NOT NULL DEFAULT 1,
    "facade_sign_level" INTEGER NOT NULL DEFAULT 1,
    "facade_plaza_level" INTEGER NOT NULL DEFAULT 1,
    "facade_shop_level" INTEGER NOT NULL DEFAULT 1,
    "alerts_seen_at" DATETIME,
    "press_audience" INTEGER NOT NULL DEFAULT 50,
    CONSTRAINT "Team_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "Division" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rivalries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_a_id" INTEGER NOT NULL,
    "team_b_id" INTEGER NOT NULL,
    "wins_a" INTEGER NOT NULL DEFAULT 0,
    "wins_b" INTEGER NOT NULL DEFAULT 0,
    "intensity" REAL NOT NULL DEFAULT 0,
    "last_winner_id" INTEGER,
    "streak_len" INTEGER NOT NULL DEFAULT 0,
    "last_meeting_day" INTEGER,
    "last_meeting_season_id" INTEGER,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "rivalries_team_a_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "rivalries_team_b_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "potential_coefficient" INTEGER NOT NULL,
    "growth_age" INTEGER NOT NULL,
    "current_skill" INTEGER NOT NULL,
    "salary" DECIMAL NOT NULL,
    "demand_factor" DECIMAL NOT NULL DEFAULT 1.5,
    "contract_years_remaining" INTEGER NOT NULL DEFAULT 1,
    "rookie_contract" BOOLEAN NOT NULL DEFAULT false,
    "rookie_seasons" INTEGER NOT NULL DEFAULT 0,
    "team_id" INTEGER,
    "last_team_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "injury_days_remaining" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT 'MAJOR',
    "toddler_program_id" INTEGER,
    "parent_id" INTEGER,
    "jersey_number" INTEGER,
    "jersey_team_id" INTEGER,
    "on_loan_from_team_id" INTEGER,
    "career_home_runs" INTEGER NOT NULL DEFAULT 0,
    "career_hits" INTEGER NOT NULL DEFAULT 0,
    "career_rbi" INTEGER NOT NULL DEFAULT 0,
    "career_wins" INTEGER NOT NULL DEFAULT 0,
    "career_strikeouts" INTEGER NOT NULL DEFAULT 0,
    "career_innings_pitched" DECIMAL NOT NULL DEFAULT 0,
    "career_earned_runs" INTEGER NOT NULL DEFAULT 0,
    "career_stats_updated_at" DATETIME,
    CONSTRAINT "Player_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Player_last_team_id_fkey" FOREIGN KEY ("last_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Player_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_appearances" (
    "player_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "head_number" INTEGER NOT NULL,
    "eye_type" INTEGER NOT NULL,
    "face_type" INTEGER NOT NULL,
    "skin_tone" INTEGER NOT NULL,
    CONSTRAINT "player_appearances_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Season" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "current_day" INTEGER NOT NULL DEFAULT 1,
    "total_days" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active'
);

-- CreateTable
CREATE TABLE "season_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "champion_name" TEXT,
    "standings" JSONB NOT NULL,
    CONSTRAINT "season_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER,
    "day_number" INTEGER NOT NULL,
    "home_team_id" INTEGER,
    "away_team_id" INTEGER,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "is_user_game" BOOLEAN NOT NULL DEFAULT false,
    "playoff_series_id" INTEGER,
    CONSTRAINT "schedule_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "schedule_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "schedule_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "schedule_playoff_series_id_fkey" FOREIGN KEY ("playoff_series_id") REFERENCES "playoff_series" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "playoff_series" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "series_order" INTEGER NOT NULL,
    "home_team_id" INTEGER NOT NULL,
    "away_team_id" INTEGER NOT NULL,
    "home_wins" INTEGER NOT NULL DEFAULT 0,
    "away_wins" INTEGER NOT NULL DEFAULT 0,
    "wins_needed" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'active',
    "winner_id" INTEGER,
    CONSTRAINT "playoff_series_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_series_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_series_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_series_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "stadium_sections" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER,
    "row_pos" INTEGER NOT NULL,
    "col_pos" INTEGER NOT NULL,
    "section_type" TEXT NOT NULL,
    "label" TEXT,
    "price_per_ticket" DECIMAL NOT NULL DEFAULT 0,
    "upgrade_level" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "stadium_sections_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "finances" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER,
    "season_day" INTEGER,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "finances_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "luxury_tax_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "payroll" DECIMAL NOT NULL,
    "threshold" DECIMAL NOT NULL,
    "league_median_cost_per_skill" DECIMAL NOT NULL,
    "cost_per_skill" DECIMAL NOT NULL,
    "ratio" REAL NOT NULL,
    "extra_points" REAL NOT NULL,
    "bracket_tax" DECIMAL NOT NULL,
    "inefficiency_tax" DECIMAL NOT NULL,
    "total_tax" DECIMAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "luxury_tax_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "luxury_tax_records_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scouts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER,
    "name" TEXT,
    "skill_level" INTEGER NOT NULL DEFAULT 50,
    "budget_assigned" DECIMAL NOT NULL DEFAULT 0,
    "active_mission" BOOLEAN NOT NULL DEFAULT false,
    "mission_end_day" INTEGER,
    "target_position" TEXT,
    CONSTRAINT "scouts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_lineups" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER,
    "team_id" INTEGER,
    "player_id" INTEGER,
    "batting_order" INTEGER,
    "position" TEXT,
    CONSTRAINT "game_lineups_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "schedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "game_lineups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "game_lineups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "game_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game_id" INTEGER,
    "inning" INTEGER,
    "half" TEXT,
    "batting_team_id" INTEGER,
    "player_id" INTEGER,
    "result" TEXT,
    "outs_after" INTEGER,
    "runs_scored" INTEGER NOT NULL DEFAULT 0,
    "event_order" INTEGER,
    CONSTRAINT "game_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "schedule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "game_events_batting_team_id_fkey" FOREIGN KEY ("batting_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "game_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_lineup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "batting_order" INTEGER,
    "is_pitcher" BOOLEAN NOT NULL DEFAULT false,
    "rotation_slot" INTEGER,
    CONSTRAINT "team_lineup_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "team_lineup_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "free_agent_auctions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "start_day" INTEGER NOT NULL,
    "last_bid_day" INTEGER,
    "closes_on_day" INTEGER,
    "winning_team_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "free_agent_auctions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "free_agent_auctions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "free_agent_auctions_winning_team_id_fkey" FOREIGN KEY ("winning_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "auction_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "years" INTEGER NOT NULL DEFAULT 1,
    "season_day" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "free_agent_auctions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "auction_bids_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "broadcast_companies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "price_per_fan" DECIMAL NOT NULL,
    "money" DECIMAL NOT NULL DEFAULT 0,
    "season_earnings" DECIMAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "broadcast_offers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "seasons" INTEGER NOT NULL,
    "price_per_fan" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "expires_day" INTEGER NOT NULL,
    "total_value" DECIMAL,
    "annual_payment" DECIMAL,
    "last_raised_day" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broadcast_offers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "broadcast_offers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "broadcast_offers_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "broadcast_contracts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "seasons_total" INTEGER NOT NULL,
    "seasons_remaining" INTEGER NOT NULL,
    "price_per_fan" DECIMAL NOT NULL,
    "signed_season_id" INTEGER NOT NULL,
    "total_value" DECIMAL,
    "annual_payment" DECIMAL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "broadcast_contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "broadcast_contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "broadcast_contracts_signed_season_id_fkey" FOREIGN KEY ("signed_season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "broadcast_relations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "satisfaction" INTEGER NOT NULL DEFAULT 50,
    CONSTRAINT "broadcast_relations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "broadcast_relations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "press_conferences" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "opponent_team_id" INTEGER,
    "host_company_id" INTEGER,
    "reporter_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "effects" JSONB,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "coaches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "skill_level" INTEGER NOT NULL,
    "salary" INTEGER NOT NULL,
    "assigned_player_id" INTEGER,
    CONSTRAINT "coaches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "coaches_assigned_player_id_fkey" FOREIGN KEY ("assigned_player_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_pick" INTEGER NOT NULL DEFAULT 1,
    "pick_order" JSONB NOT NULL,
    CONSTRAINT "drafts_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "draft_prospects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "draft_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "current_skill" INTEGER NOT NULL,
    "potential_coefficient" INTEGER NOT NULL,
    "growth_age" INTEGER NOT NULL,
    "picked_by_team_id" INTEGER,
    "pick_number" INTEGER,
    "source_player_id" INTEGER,
    CONSTRAINT "draft_prospects_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "drafts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "draft_prospects_source_player_id_fkey" FOREIGN KEY ("source_player_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trades" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "proposer_team_id" INTEGER NOT NULL,
    "recipient_team_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "cash_offered" DECIMAL NOT NULL DEFAULT 0,
    "cash_requested" DECIMAL NOT NULL DEFAULT 0,
    "created_day" INTEGER NOT NULL,
    "expires_day" INTEGER,
    "resolved_day" INTEGER,
    "gm_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "trades_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "trades_proposer_team_id_fkey" FOREIGN KEY ("proposer_team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "trades_recipient_team_id_fkey" FOREIGN KEY ("recipient_team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "trade_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trade_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "from_team_id" INTEGER NOT NULL,
    CONSTRAINT "trade_items_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "trade_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "season_day" INTEGER NOT NULL DEFAULT 0,
    "season_id" INTEGER,
    "team_id" INTEGER,
    "alert" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "home_run_derby_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "winner_entry_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "home_run_derby_events_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "derby_entries" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "reward_amount" DECIMAL NOT NULL,
    "home_runs" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "derby_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "home_run_derby_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "derby_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "derby_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "derby_swings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_id" INTEGER NOT NULL,
    "entry_id" INTEGER NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "is_home_run" BOOLEAN NOT NULL,
    CONSTRAINT "derby_swings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "home_run_derby_events" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "derby_swings_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "derby_entries" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "season_awards" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "player_id" INTEGER,
    "team_id" INTEGER,
    "value" REAL NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "season_awards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "season_awards_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "season_awards_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "player_season_records" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "team_id" INTEGER,
    "player_id" INTEGER NOT NULL,
    "first_day" INTEGER NOT NULL,
    "games" INTEGER NOT NULL DEFAULT 0,
    "at_bats" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "home_runs" INTEGER NOT NULL DEFAULT 0,
    "walks" INTEGER NOT NULL DEFAULT 0,
    "strikeouts" INTEGER NOT NULL DEFAULT 0,
    "rbi" INTEGER NOT NULL DEFAULT 0,
    "pitching_games" INTEGER NOT NULL DEFAULT 0,
    "pitching_outs" INTEGER NOT NULL DEFAULT 0,
    "earned_runs" INTEGER NOT NULL DEFAULT 0,
    "pitching_strikeouts" INTEGER NOT NULL DEFAULT 0,
    "pitching_walks" INTEGER NOT NULL DEFAULT 0,
    "hits_allowed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "player_season_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "player_season_records_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "player_season_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "toddler_programs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cycle_number" INTEGER NOT NULL DEFAULT 1,
    "seasons_elapsed" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "pick_order" JSONB,
    "current_pick" INTEGER NOT NULL DEFAULT 1,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "toddler_contributions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "program_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "toddler_contributions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "toddler_programs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "toddler_contributions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bank" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "initial_capital" DECIMAL NOT NULL,
    "base_interest_rate" REAL NOT NULL DEFAULT 0.08,
    "total_loaned" DECIMAL NOT NULL DEFAULT 0,
    "total_interest_collected" DECIMAL NOT NULL DEFAULT 0,
    "total_tax_funded" DECIMAL NOT NULL DEFAULT 0,
    "total_defaulted" DECIMAL NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "loans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "day_issued" INTEGER NOT NULL,
    "principal" DECIMAL NOT NULL,
    "interest_rate" REAL NOT NULL,
    "balance_remaining" DECIMAL NOT NULL,
    "total_paid" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "missed_payments" INTEGER NOT NULL DEFAULT 0,
    "paid_at" DATETIME,
    "defaulted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "loans_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER,
    "start_season_id" INTEGER,
    "end_season_id" INTEGER,
    "is_rookie" BOOLEAN NOT NULL DEFAULT false,
    "annual_salary" DECIMAL NOT NULL,
    "total_years" INTEGER NOT NULL,
    "years_remaining" INTEGER NOT NULL,
    "total_value" DECIMAL NOT NULL,
    "achievement_bonus" DECIMAL NOT NULL DEFAULT 0,
    "bonus_paid_season" DECIMAL NOT NULL DEFAULT 0,
    "bonus_paid_total" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "is_reconstructed" BOOLEAN NOT NULL DEFAULT false,
    "jersey_number" INTEGER,
    "signed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contracts_start_season_id_fkey" FOREIGN KEY ("start_season_id") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "contracts_end_season_id_fkey" FOREIGN KEY ("end_season_id") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "hall_of_fame_candidates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "legacy_score" REAL NOT NULL,
    "seasons_played" INTEGER NOT NULL,
    "career_totals" JSONB NOT NULL,
    "primary_team_id" INTEGER,
    "evaluated_season_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "years_on_ballot" INTEGER NOT NULL DEFAULT 0,
    "last_vote_pct" REAL,
    "vote_history" JSONB,
    "inducted_season_id" INTEGER,
    "bio" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hall_of_fame_candidates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "hall_of_fame_candidates_primary_team_id_fkey" FOREIGN KEY ("primary_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "retired_numbers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "season_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "retired_numbers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "retired_numbers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "playoff_markets" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "opened_day" INTEGER NOT NULL,
    "closes_on_day" INTEGER NOT NULL,
    "qualified_team_ids" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playoff_markets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "playoff_loans" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "market_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "from_team_id" INTEGER NOT NULL,
    "to_team_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "pct" DECIMAL,
    "amount" DECIMAL,
    "signed_day" INTEGER,
    "original_jersey_number" INTEGER,
    "original_jersey_team_id" INTEGER,
    "returned_at" DATETIME,
    CONSTRAINT "playoff_loans_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "playoff_markets" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_loans_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_loans_from_team_id_fkey" FOREIGN KEY ("from_team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_loans_to_team_id_fkey" FOREIGN KEY ("to_team_id") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "playoff_loan_bids" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "loan_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "pct" DECIMAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "season_day" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "playoff_loan_bids_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "playoff_loans" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "playoff_loan_bids_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "rivalries_team_a_id_team_b_id_key" ON "rivalries"("team_a_id", "team_b_id");

-- CreateIndex
CREATE INDEX "Player_team_id_idx" ON "Player"("team_id");

-- CreateIndex
CREATE INDEX "Player_last_team_id_idx" ON "Player"("last_team_id");

-- CreateIndex
CREATE INDEX "Player_status_idx" ON "Player"("status");

-- CreateIndex
CREATE INDEX "Player_team_id_level_idx" ON "Player"("team_id", "level");

-- CreateIndex
CREATE INDEX "Player_toddler_program_id_idx" ON "Player"("toddler_program_id");

-- CreateIndex
CREATE INDEX "Player_parent_id_idx" ON "Player"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "season_records_season_id_key" ON "season_records"("season_id");

-- CreateIndex
CREATE INDEX "schedule_season_id_day_number_idx" ON "schedule"("season_id", "day_number");

-- CreateIndex
CREATE INDEX "stadium_sections_team_id_idx" ON "stadium_sections"("team_id");

-- CreateIndex
CREATE INDEX "finances_team_id_idx" ON "finances"("team_id");

-- CreateIndex
CREATE INDEX "luxury_tax_records_season_id_team_id_idx" ON "luxury_tax_records"("season_id", "team_id");

-- CreateIndex
CREATE INDEX "luxury_tax_records_team_id_idx" ON "luxury_tax_records"("team_id");

-- CreateIndex
CREATE INDEX "game_lineups_player_id_idx" ON "game_lineups"("player_id");

-- CreateIndex
CREATE INDEX "game_events_game_id_idx" ON "game_events"("game_id");

-- CreateIndex
CREATE INDEX "game_events_player_id_idx" ON "game_events"("player_id");

-- CreateIndex
CREATE INDEX "team_lineup_team_id_idx" ON "team_lineup"("team_id");

-- CreateIndex
CREATE INDEX "free_agent_auctions_status_idx" ON "free_agent_auctions"("status");

-- CreateIndex
CREATE INDEX "free_agent_auctions_closes_on_day_idx" ON "free_agent_auctions"("closes_on_day");

-- CreateIndex
CREATE INDEX "auction_bids_auction_id_idx" ON "auction_bids"("auction_id");

-- CreateIndex
CREATE INDEX "broadcast_offers_team_id_idx" ON "broadcast_offers"("team_id");

-- CreateIndex
CREATE INDEX "broadcast_offers_status_idx" ON "broadcast_offers"("status");

-- CreateIndex
CREATE INDEX "broadcast_contracts_team_id_idx" ON "broadcast_contracts"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_relations_company_id_team_id_key" ON "broadcast_relations"("company_id", "team_id");

-- CreateIndex
CREATE INDEX "press_conferences_season_id_status_idx" ON "press_conferences"("season_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "coaches_assigned_player_id_key" ON "coaches"("assigned_player_id");

-- CreateIndex
CREATE INDEX "coaches_team_id_idx" ON "coaches"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "drafts_season_id_key" ON "drafts"("season_id");

-- CreateIndex
CREATE INDEX "draft_prospects_draft_id_idx" ON "draft_prospects"("draft_id");

-- CreateIndex
CREATE INDEX "draft_prospects_source_player_id_idx" ON "draft_prospects"("source_player_id");

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- CreateIndex
CREATE INDEX "trades_recipient_team_id_idx" ON "trades"("recipient_team_id");

-- CreateIndex
CREATE INDEX "trades_proposer_team_id_idx" ON "trades"("proposer_team_id");

-- CreateIndex
CREATE INDEX "trade_items_trade_id_idx" ON "trade_items"("trade_id");

-- CreateIndex
CREATE INDEX "trade_items_player_id_idx" ON "trade_items"("player_id");

-- CreateIndex
CREATE INDEX "news_items_season_day_idx" ON "news_items"("season_day");

-- CreateIndex
CREATE INDEX "news_items_season_id_idx" ON "news_items"("season_id");

-- CreateIndex
CREATE INDEX "news_items_team_id_idx" ON "news_items"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "home_run_derby_events_winner_entry_id_key" ON "home_run_derby_events"("winner_entry_id");

-- CreateIndex
CREATE INDEX "home_run_derby_events_season_id_idx" ON "home_run_derby_events"("season_id");

-- CreateIndex
CREATE INDEX "derby_entries_event_id_idx" ON "derby_entries"("event_id");

-- CreateIndex
CREATE INDEX "derby_swings_entry_id_idx" ON "derby_swings"("entry_id");

-- CreateIndex
CREATE INDEX "season_awards_season_id_idx" ON "season_awards"("season_id");

-- CreateIndex
CREATE INDEX "player_season_records_player_id_idx" ON "player_season_records"("player_id");

-- CreateIndex
CREATE INDEX "player_season_records_season_id_idx" ON "player_season_records"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_records_season_id_team_id_player_id_key" ON "player_season_records"("season_id", "team_id", "player_id");

-- CreateIndex
CREATE INDEX "toddler_contributions_program_id_idx" ON "toddler_contributions"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "toddler_contributions_program_id_team_id_key" ON "toddler_contributions"("program_id", "team_id");

-- CreateIndex
CREATE INDEX "loans_team_id_idx" ON "loans"("team_id");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- CreateIndex
CREATE INDEX "contracts_player_id_status_idx" ON "contracts"("player_id", "status");

-- CreateIndex
CREATE INDEX "contracts_team_id_status_idx" ON "contracts"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "hall_of_fame_candidates_player_id_key" ON "hall_of_fame_candidates"("player_id");

-- CreateIndex
CREATE INDEX "hall_of_fame_candidates_status_idx" ON "hall_of_fame_candidates"("status");

-- CreateIndex
CREATE INDEX "hall_of_fame_candidates_role_idx" ON "hall_of_fame_candidates"("role");

-- CreateIndex
CREATE UNIQUE INDEX "retired_numbers_team_id_number_key" ON "retired_numbers"("team_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "retired_numbers_team_id_player_id_key" ON "retired_numbers"("team_id", "player_id");

-- CreateIndex
CREATE UNIQUE INDEX "playoff_markets_season_id_key" ON "playoff_markets"("season_id");

-- CreateIndex
CREATE INDEX "playoff_loans_market_id_status_idx" ON "playoff_loans"("market_id", "status");

-- CreateIndex
CREATE INDEX "playoff_loans_player_id_idx" ON "playoff_loans"("player_id");

-- CreateIndex
CREATE INDEX "playoff_loan_bids_loan_id_idx" ON "playoff_loan_bids"("loan_id");

