-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "parent_id" INTEGER;

-- CreateIndex
CREATE INDEX "Player_parent_id_idx" ON "Player"("parent_id");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
