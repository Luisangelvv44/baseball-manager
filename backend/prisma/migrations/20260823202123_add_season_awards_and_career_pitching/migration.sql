-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "career_earned_runs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "career_innings_pitched" DECIMAL(8,1) NOT NULL DEFAULT 0,
ADD COLUMN     "career_strikeouts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "career_wins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "season_awards" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER,
    "value" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "season_awards_season_id_idx" ON "season_awards"("season_id");

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
