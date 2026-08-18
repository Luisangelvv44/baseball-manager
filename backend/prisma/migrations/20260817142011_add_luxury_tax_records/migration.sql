-- CreateTable
CREATE TABLE "luxury_tax_records" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "payroll" DECIMAL(14,2) NOT NULL,
    "threshold" DECIMAL(14,2) NOT NULL,
    "league_median_cost_per_skill" DECIMAL(14,4) NOT NULL,
    "cost_per_skill" DECIMAL(14,4) NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL,
    "extra_points" DOUBLE PRECISION NOT NULL,
    "bracket_tax" DECIMAL(14,2) NOT NULL,
    "inefficiency_tax" DECIMAL(14,2) NOT NULL,
    "total_tax" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "luxury_tax_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "luxury_tax_records_season_id_team_id_idx" ON "luxury_tax_records"("season_id", "team_id");

-- CreateIndex
CREATE INDEX "luxury_tax_records_team_id_idx" ON "luxury_tax_records"("team_id");

-- AddForeignKey
ALTER TABLE "luxury_tax_records" ADD CONSTRAINT "luxury_tax_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "luxury_tax_records" ADD CONSTRAINT "luxury_tax_records_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
