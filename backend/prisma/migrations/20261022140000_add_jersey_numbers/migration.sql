-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "jersey_number" INTEGER,
ADD COLUMN     "jersey_team_id" INTEGER;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "jersey_number" INTEGER;

-- CreateTable
CREATE TABLE "retired_numbers" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "season_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retired_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retired_numbers_team_id_number_key" ON "retired_numbers"("team_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "retired_numbers_team_id_player_id_key" ON "retired_numbers"("team_id", "player_id");

-- AddForeignKey
ALTER TABLE "retired_numbers" ADD CONSTRAINT "retired_numbers_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retired_numbers" ADD CONSTRAINT "retired_numbers_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
