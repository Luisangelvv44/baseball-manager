-- CreateTable
CREATE TABLE "bank" (
    "id" SERIAL NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "initial_capital" DECIMAL(14,2) NOT NULL,
    "base_interest_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "total_loaned" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_interest_collected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_tax_funded" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_defaulted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "day_issued" INTEGER NOT NULL,
    "principal" DECIMAL(14,2) NOT NULL,
    "interest_rate" DOUBLE PRECISION NOT NULL,
    "balance_remaining" DECIMAL(14,2) NOT NULL,
    "total_paid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "missed_payments" INTEGER NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "defaulted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loans_team_id_idx" ON "loans"("team_id");

-- CreateIndex
CREATE INDEX "loans_status_idx" ON "loans"("status");

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
