-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "bid_aggressiveness" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
ADD COLUMN     "min_growth_threshold" DOUBLE PRECISION NOT NULL DEFAULT 1.5;

-- CreateTable
CREATE TABLE "free_agent_auctions" (
    "id" SERIAL NOT NULL,
    "player_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "start_day" INTEGER NOT NULL,
    "last_bid_day" INTEGER,
    "closes_on_day" INTEGER,
    "winning_team_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "free_agent_auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" SERIAL NOT NULL,
    "auction_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "season_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "free_agent_auctions_player_id_key" ON "free_agent_auctions"("player_id");

-- CreateIndex
CREATE INDEX "free_agent_auctions_status_idx" ON "free_agent_auctions"("status");

-- CreateIndex
CREATE INDEX "free_agent_auctions_closes_on_day_idx" ON "free_agent_auctions"("closes_on_day");

-- CreateIndex
CREATE INDEX "auction_bids_auction_id_idx" ON "auction_bids"("auction_id");

-- AddForeignKey
ALTER TABLE "free_agent_auctions" ADD CONSTRAINT "free_agent_auctions_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_agent_auctions" ADD CONSTRAINT "free_agent_auctions_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "free_agent_auctions" ADD CONSTRAINT "free_agent_auctions_winning_team_id_fkey" FOREIGN KEY ("winning_team_id") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "free_agent_auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
