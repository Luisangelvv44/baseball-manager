-- CreateTable
CREATE TABLE "team_lineup" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "batting_order" INTEGER,
    "is_pitcher" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_lineup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_lineup_team_id_idx" ON "team_lineup"("team_id");

-- AddForeignKey
ALTER TABLE "team_lineup" ADD CONSTRAINT "team_lineup_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_lineup" ADD CONSTRAINT "team_lineup_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
