-- CreateTable
CREATE TABLE "hall_of_fame_candidates" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "role" VARCHAR(10) NOT NULL,
    "legacy_score" DOUBLE PRECISION NOT NULL,
    "seasons_played" INTEGER NOT NULL,
    "career_totals" JSONB NOT NULL,
    "primary_team_id" INTEGER,
    "evaluated_season_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'candidate',
    "years_on_ballot" INTEGER NOT NULL DEFAULT 0,
    "last_vote_pct" DOUBLE PRECISION,
    "vote_history" JSONB,
    "inducted_season_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hall_of_fame_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hall_of_fame_candidates_player_id_key" ON "hall_of_fame_candidates"("player_id");

-- CreateIndex
CREATE INDEX "hall_of_fame_candidates_status_idx" ON "hall_of_fame_candidates"("status");

-- CreateIndex
CREATE INDEX "hall_of_fame_candidates_role_idx" ON "hall_of_fame_candidates"("role");

-- AddForeignKey
ALTER TABLE "hall_of_fame_candidates" ADD CONSTRAINT "hall_of_fame_candidates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hall_of_fame_candidates" ADD CONSTRAINT "hall_of_fame_candidates_primary_team_id_fkey" FOREIGN KEY ("primary_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
