-- AlterTable
ALTER TABLE "news_items" ADD COLUMN     "season_id" INTEGER;

-- CreateIndex
CREATE INDEX "news_items_season_id_idx" ON "news_items"("season_id");
