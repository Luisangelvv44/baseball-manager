-- DropForeignKey
ALTER TABLE "season_awards" DROP CONSTRAINT "season_awards_player_id_fkey";

-- AlterTable
ALTER TABLE "season_awards" ALTER COLUMN "player_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "season_awards" ADD CONSTRAINT "season_awards_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
