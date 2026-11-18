-- CreateTable
CREATE TABLE "all_star_games" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "home_conference" VARCHAR(20) NOT NULL,
    "away_conference" VARCHAR(20) NOT NULL,
    "home_score" INTEGER NOT NULL,
    "away_score" INTEGER NOT NULL,
    "final_inning" INTEGER NOT NULL,
    "mvp_player_id" INTEGER,
    "rosters" JSONB NOT NULL,
    "events" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "all_star_games_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "all_star_games_season_id_key" ON "all_star_games"("season_id");

-- AddForeignKey
ALTER TABLE "all_star_games" ADD CONSTRAINT "all_star_games_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

