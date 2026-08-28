-- CreateTable
CREATE TABLE "player_season_records" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "player_season_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_season_records_player_id_idx" ON "player_season_records"("player_id");

-- CreateIndex
CREATE INDEX "player_season_records_season_id_idx" ON "player_season_records"("season_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_season_records_season_id_team_id_player_id_key" ON "player_season_records"("season_id", "team_id", "player_id");

-- AddForeignKey
ALTER TABLE "player_season_records" ADD CONSTRAINT "player_season_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_records" ADD CONSTRAINT "player_season_records_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_season_records" ADD CONSTRAINT "player_season_records_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
