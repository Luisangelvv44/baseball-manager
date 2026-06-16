-- CreateTable
CREATE TABLE "coaches" (
    "id" SERIAL NOT NULL,
    "team_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "specialty" VARCHAR(20) NOT NULL,
    "skill_level" INTEGER NOT NULL,
    "salary" INTEGER NOT NULL,
    "assigned_player_id" INTEGER,

    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "current_pick" INTEGER NOT NULL DEFAULT 1,
    "pick_order" JSONB NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_prospects" (
    "id" SERIAL NOT NULL,
    "draft_id" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "position" VARCHAR(10) NOT NULL,
    "age" INTEGER NOT NULL,
    "current_skill" INTEGER NOT NULL,
    "potential_coefficient" INTEGER NOT NULL,
    "growth_age" INTEGER NOT NULL,
    "picked_by_team_id" INTEGER,
    "pick_number" INTEGER,

    CONSTRAINT "draft_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coaches_assigned_player_id_key" ON "coaches"("assigned_player_id");

-- CreateIndex
CREATE INDEX "coaches_team_id_idx" ON "coaches"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "drafts_season_id_key" ON "drafts"("season_id");

-- CreateIndex
CREATE INDEX "draft_prospects_draft_id_idx" ON "draft_prospects"("draft_id");

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_assigned_player_id_fkey" FOREIGN KEY ("assigned_player_id") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_prospects" ADD CONSTRAINT "draft_prospects_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
