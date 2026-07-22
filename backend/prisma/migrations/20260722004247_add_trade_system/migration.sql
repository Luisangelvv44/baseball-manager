-- CreateTable
CREATE TABLE "trades" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "proposer_team_id" INTEGER NOT NULL,
    "recipient_team_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "cash_offered" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cash_requested" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_day" INTEGER NOT NULL,
    "expires_day" INTEGER,
    "resolved_day" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_items" (
    "id" SERIAL NOT NULL,
    "trade_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "from_team_id" INTEGER NOT NULL,

    CONSTRAINT "trade_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trades_status_idx" ON "trades"("status");

-- CreateIndex
CREATE INDEX "trades_recipient_team_id_idx" ON "trades"("recipient_team_id");

-- CreateIndex
CREATE INDEX "trades_proposer_team_id_idx" ON "trades"("proposer_team_id");

-- CreateIndex
CREATE INDEX "trade_items_trade_id_idx" ON "trade_items"("trade_id");

-- CreateIndex
CREATE INDEX "trade_items_player_id_idx" ON "trade_items"("player_id");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_proposer_team_id_fkey" FOREIGN KEY ("proposer_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_recipient_team_id_fkey" FOREIGN KEY ("recipient_team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
