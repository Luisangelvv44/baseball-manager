-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "toddler_program_id" INTEGER;

-- CreateTable
CREATE TABLE "toddler_programs" (
    "id" SERIAL NOT NULL,
    "cycle_number" INTEGER NOT NULL DEFAULT 1,
    "seasons_elapsed" INTEGER NOT NULL DEFAULT 0,
    "budget" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "pick_order" JSONB,
    "current_pick" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toddler_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "toddler_contributions" (
    "id" SERIAL NOT NULL,
    "program_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "toddler_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "toddler_contributions_program_id_idx" ON "toddler_contributions"("program_id");

-- CreateIndex
CREATE UNIQUE INDEX "toddler_contributions_program_id_team_id_key" ON "toddler_contributions"("program_id", "team_id");

-- CreateIndex
CREATE INDEX "Player_toddler_program_id_idx" ON "Player"("toddler_program_id");

-- AddForeignKey
ALTER TABLE "toddler_contributions" ADD CONSTRAINT "toddler_contributions_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "toddler_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "toddler_contributions" ADD CONSTRAINT "toddler_contributions_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
