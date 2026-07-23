-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "level" VARCHAR(10) NOT NULL DEFAULT 'MAJOR';

-- CreateIndex
CREATE INDEX "Player_team_id_level_idx" ON "Player"("team_id", "level");
