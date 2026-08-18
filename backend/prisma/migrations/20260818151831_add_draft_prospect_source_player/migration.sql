-- AlterTable
ALTER TABLE "draft_prospects" ADD COLUMN     "source_player_id" INTEGER;

-- CreateIndex
CREATE INDEX "draft_prospects_source_player_id_idx" ON "draft_prospects"("source_player_id");

-- AddForeignKey
ALTER TABLE "draft_prospects" ADD CONSTRAINT "draft_prospects_source_player_id_fkey" FOREIGN KEY ("source_player_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
