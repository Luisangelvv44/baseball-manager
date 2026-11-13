-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "press_audience" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "broadcast_relations" (
    "id" SERIAL NOT NULL,
    "company_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "satisfaction" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "broadcast_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "press_conferences" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "trigger" VARCHAR(20) NOT NULL,
    "opponent_team_id" INTEGER,
    "host_company_id" INTEGER,
    "reporter_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "questions" JSONB NOT NULL,
    "answers" JSONB,
    "effects" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "press_conferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_relations_company_id_team_id_key" ON "broadcast_relations"("company_id", "team_id");

-- CreateIndex
CREATE INDEX "press_conferences_season_id_status_idx" ON "press_conferences"("season_id", "status");

-- AddForeignKey
ALTER TABLE "broadcast_relations" ADD CONSTRAINT "broadcast_relations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "broadcast_companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_relations" ADD CONSTRAINT "broadcast_relations_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

