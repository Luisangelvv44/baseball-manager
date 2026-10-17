-- AlterTable
ALTER TABLE "broadcast_companies" ADD COLUMN     "money" DECIMAL(16,2) NOT NULL DEFAULT 0,
ADD COLUMN     "season_earnings" DECIMAL(16,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "broadcast_contracts" ADD COLUMN     "annual_payment" DECIMAL(16,2),
ADD COLUMN     "total_value" DECIMAL(16,2);

-- AlterTable
ALTER TABLE "broadcast_offers" ADD COLUMN     "annual_payment" DECIMAL(16,2),
ADD COLUMN     "last_raised_day" INTEGER,
ADD COLUMN     "total_value" DECIMAL(16,2);

-- Dinero inicial de las transmisoras: TV $1 000M, radio $500M
UPDATE "broadcast_companies" SET "money" = 1000000000 WHERE "type" = 'TV';
UPDATE "broadcast_companies" SET "money" = 500000000 WHERE "type" = 'RADIO';

-- Las ofertas abiertas del sistema anterior no tienen total ni pago anual: se expiran
UPDATE "broadcast_offers" SET "status" = 'EXPIRED' WHERE "status" IN ('PENDING', 'ACCEPTED');
