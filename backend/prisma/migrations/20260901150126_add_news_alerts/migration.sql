-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "alerts_seen_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "news_items" ADD COLUMN     "alert" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "team_id" INTEGER;

-- CreateIndex
CREATE INDEX "news_items_team_id_idx" ON "news_items"("team_id");
