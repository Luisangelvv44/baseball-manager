-- CreateTable
CREATE TABLE "all_star_games" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "home_conference" TEXT NOT NULL,
    "away_conference" TEXT NOT NULL,
    "home_score" INTEGER NOT NULL,
    "away_score" INTEGER NOT NULL,
    "final_inning" INTEGER NOT NULL,
    "mvp_player_id" INTEGER,
    "rosters" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "all_star_games_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "all_star_games_season_id_key" ON "all_star_games"("season_id");

