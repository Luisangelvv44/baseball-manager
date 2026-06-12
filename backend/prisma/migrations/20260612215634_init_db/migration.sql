-- CreateTable
CREATE TABLE "Division" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "division_id" INTEGER,
    "is_user_team" BOOLEAN NOT NULL DEFAULT false,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "runs_scored" INTEGER NOT NULL DEFAULT 0,
    "runs_allowed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "age" INTEGER NOT NULL,
    "position" VARCHAR(10) NOT NULL,
    "potential_coefficient" INTEGER NOT NULL,
    "growth_age" INTEGER NOT NULL,
    "current_skill" INTEGER NOT NULL,
    "salary" DECIMAL(12,2) NOT NULL,
    "contract_years_remaining" INTEGER NOT NULL DEFAULT 1,
    "team_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" SERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "current_day" INTEGER NOT NULL DEFAULT 1,
    "total_days" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER,
    "day_number" INTEGER NOT NULL,
    "home_team_id" INTEGER,
    "away_team_id" INTEGER,
    "home_score" INTEGER,
    "away_score" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "is_user_game" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadium_sections" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER,
    "row_pos" INTEGER NOT NULL,
    "col_pos" INTEGER NOT NULL,
    "section_type" VARCHAR(20) NOT NULL,
    "label" VARCHAR(50),
    "price_per_ticket" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "upgrade_level" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stadium_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finances" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER,
    "season_day" INTEGER,
    "type" VARCHAR(30) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scouts" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER,
    "name" VARCHAR(100),
    "skill_level" INTEGER NOT NULL DEFAULT 50,
    "budget_assigned" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active_mission" BOOLEAN NOT NULL DEFAULT false,
    "mission_end_day" INTEGER,

    CONSTRAINT "scouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_lineups" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER,
    "team_id" INTEGER,
    "player_id" INTEGER,
    "batting_order" INTEGER,
    "position" VARCHAR(10),

    CONSTRAINT "game_lineups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_events" (
    "id" SERIAL NOT NULL,
    "game_id" INTEGER,
    "inning" INTEGER,
    "half" VARCHAR(4),
    "batting_team_id" INTEGER,
    "player_id" INTEGER,
    "result" VARCHAR(10),
    "outs_after" INTEGER,
    "runs_scored" INTEGER NOT NULL DEFAULT 0,
    "event_order" INTEGER,

    CONSTRAINT "game_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_team_id_idx" ON "Player"("team_id");

-- CreateIndex
CREATE INDEX "Player_status_idx" ON "Player"("status");

-- CreateIndex
CREATE INDEX "schedule_season_id_day_number_idx" ON "schedule"("season_id", "day_number");

-- CreateIndex
CREATE INDEX "stadium_sections_team_id_idx" ON "stadium_sections"("team_id");

-- CreateIndex
CREATE INDEX "finances_team_id_idx" ON "finances"("team_id");

-- CreateIndex
CREATE INDEX "game_events_game_id_idx" ON "game_events"("game_id");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "Division"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_sections" ADD CONSTRAINT "stadium_sections_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finances" ADD CONSTRAINT "finances_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scouts" ADD CONSTRAINT "scouts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_lineups" ADD CONSTRAINT "game_lineups_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_batting_team_id_fkey" FOREIGN KEY ("batting_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
