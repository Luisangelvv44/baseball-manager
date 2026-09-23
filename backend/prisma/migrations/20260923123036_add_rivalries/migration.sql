-- CreateTable
CREATE TABLE "rivalries" (
    "id" SERIAL NOT NULL,
    "team_a_id" INTEGER NOT NULL,
    "team_b_id" INTEGER NOT NULL,
    "wins_a" INTEGER NOT NULL DEFAULT 0,
    "wins_b" INTEGER NOT NULL DEFAULT 0,
    "intensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_winner_id" INTEGER,
    "streak_len" INTEGER NOT NULL DEFAULT 0,
    "last_meeting_day" INTEGER,
    "last_meeting_season_id" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rivalries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rivalries_team_a_id_team_b_id_key" ON "rivalries"("team_a_id", "team_b_id");

-- AddForeignKey
ALTER TABLE "rivalries" ADD CONSTRAINT "rivalries_team_a_id_fkey" FOREIGN KEY ("team_a_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rivalries" ADD CONSTRAINT "rivalries_team_b_id_fkey" FOREIGN KEY ("team_b_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
