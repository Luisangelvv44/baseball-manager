-- AlterTable
ALTER TABLE "scouts" ADD COLUMN     "target_position" VARCHAR(10);

-- CreateTable
CREATE TABLE "season_records" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "champion_name" VARCHAR(100),
    "standings" JSONB NOT NULL,

    CONSTRAINT "season_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "season_records_season_id_key" ON "season_records"("season_id");

-- AddForeignKey
ALTER TABLE "season_records" ADD CONSTRAINT "season_records_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
