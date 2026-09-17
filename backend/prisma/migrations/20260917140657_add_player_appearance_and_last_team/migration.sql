-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "last_team_id" INTEGER;

-- CreateTable
CREATE TABLE "player_appearances" (
    "player_id" INTEGER NOT NULL,
    "head_number" INTEGER NOT NULL,
    "eye_type" INTEGER NOT NULL,
    "face_type" INTEGER NOT NULL,
    "skin_tone" INTEGER NOT NULL,

    CONSTRAINT "player_appearances_pkey" PRIMARY KEY ("player_id")
);

-- CreateIndex
CREATE INDEX "Player_last_team_id_idx" ON "Player"("last_team_id");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_last_team_id_fkey" FOREIGN KEY ("last_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_appearances" ADD CONSTRAINT "player_appearances_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
