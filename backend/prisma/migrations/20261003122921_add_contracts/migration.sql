-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "team_id" INTEGER,
    "start_season_id" INTEGER,
    "end_season_id" INTEGER,
    "is_rookie" BOOLEAN NOT NULL DEFAULT false,
    "annual_salary" DECIMAL(12,2) NOT NULL,
    "total_years" INTEGER NOT NULL,
    "years_remaining" INTEGER NOT NULL,
    "total_value" DECIMAL(14,2) NOT NULL,
    "achievement_bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus_paid_season" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus_paid_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "is_reconstructed" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_player_id_status_idx" ON "contracts"("player_id", "status");

-- CreateIndex
CREATE INDEX "contracts_team_id_status_idx" ON "contracts"("team_id", "status");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_start_season_id_fkey" FOREIGN KEY ("start_season_id") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_end_season_id_fkey" FOREIGN KEY ("end_season_id") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

