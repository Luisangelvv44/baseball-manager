-- AlterTable
ALTER TABLE "schedule" ADD COLUMN     "playoff_series_id" INTEGER;

-- CreateTable
CREATE TABLE "playoff_series" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "playoff_series_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "schedule" ADD CONSTRAINT "schedule_playoff_series_id_fkey" FOREIGN KEY ("playoff_series_id") REFERENCES "playoff_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_series" ADD CONSTRAINT "playoff_series_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
