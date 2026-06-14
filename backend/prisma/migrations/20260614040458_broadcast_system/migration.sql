-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "fan_base" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "broadcast_companies" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" VARCHAR(5) NOT NULL,
    "price_per_fan" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "broadcast_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_offers" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "season_id" INTEGER NOT NULL,
    "seasons" INTEGER NOT NULL,
    "price_per_fan" DECIMAL(6,4) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "expires_day" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_contracts" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "seasons_total" INTEGER NOT NULL,
    "seasons_remaining" INTEGER NOT NULL,
    "price_per_fan" DECIMAL(6,4) NOT NULL,
    "signed_season_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "broadcast_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "broadcast_offers_team_id_idx" ON "broadcast_offers"("team_id");

-- CreateIndex
CREATE INDEX "broadcast_offers_status_idx" ON "broadcast_offers"("status");

-- CreateIndex
CREATE INDEX "broadcast_contracts_team_id_idx" ON "broadcast_contracts"("team_id");

-- AddForeignKey
ALTER TABLE "broadcast_offers" ADD CONSTRAINT "broadcast_offers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_offers" ADD CONSTRAINT "broadcast_offers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_offers" ADD CONSTRAINT "broadcast_offers_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_contracts" ADD CONSTRAINT "broadcast_contracts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_contracts" ADD CONSTRAINT "broadcast_contracts_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_contracts" ADD CONSTRAINT "broadcast_contracts_signed_season_id_fkey" FOREIGN KEY ("signed_season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
