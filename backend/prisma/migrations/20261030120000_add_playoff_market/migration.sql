-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "on_loan_from_team_id" INTEGER;

-- CreateTable
CREATE TABLE "playoff_markets" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "opened_day" INTEGER NOT NULL,
    "closes_on_day" INTEGER NOT NULL,
    "qualified_team_ids" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playoff_markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playoff_loans" (
    "id" SERIAL NOT NULL,
    "market_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "from_team_id" INTEGER NOT NULL,
    "to_team_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "pct" DECIMAL(4,2),
    "amount" DECIMAL(14,2),
    "signed_day" INTEGER,
    "original_jersey_number" INTEGER,
    "original_jersey_team_id" INTEGER,
    "returned_at" TIMESTAMP(3),

    CONSTRAINT "playoff_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playoff_loan_bids" (
    "id" SERIAL NOT NULL,
    "loan_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "pct" DECIMAL(4,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "season_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playoff_loan_bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "playoff_markets_season_id_key" ON "playoff_markets"("season_id");

-- CreateIndex
CREATE INDEX "playoff_loans_market_id_status_idx" ON "playoff_loans"("market_id", "status");

-- CreateIndex
CREATE INDEX "playoff_loans_player_id_idx" ON "playoff_loans"("player_id");

-- CreateIndex
CREATE INDEX "playoff_loan_bids_loan_id_idx" ON "playoff_loan_bids"("loan_id");

-- AddForeignKey
ALTER TABLE "playoff_markets" ADD CONSTRAINT "playoff_markets_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loans" ADD CONSTRAINT "playoff_loans_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "playoff_markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loans" ADD CONSTRAINT "playoff_loans_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loans" ADD CONSTRAINT "playoff_loans_from_team_id_fkey" FOREIGN KEY ("from_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loans" ADD CONSTRAINT "playoff_loans_to_team_id_fkey" FOREIGN KEY ("to_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loan_bids" ADD CONSTRAINT "playoff_loan_bids_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "playoff_loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playoff_loan_bids" ADD CONSTRAINT "playoff_loan_bids_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

