-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "career_hits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "career_home_runs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "career_rbi" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "career_stats_updated_at" TIMESTAMP(3);
