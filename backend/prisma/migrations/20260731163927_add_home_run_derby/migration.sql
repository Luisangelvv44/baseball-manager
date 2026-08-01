-- CreateTable
CREATE TABLE "home_run_derby_events" (
    "id" SERIAL NOT NULL,
    "season_id" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "winner_entry_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_run_derby_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derby_entries" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "team_id" INTEGER NOT NULL,
    "player_id" INTEGER NOT NULL,
    "reward_amount" DECIMAL(12,2) NOT NULL,
    "home_runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "derby_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "derby_swings" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "entry_id" INTEGER NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "is_home_run" BOOLEAN NOT NULL,

    CONSTRAINT "derby_swings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_run_derby_events_winner_entry_id_key" ON "home_run_derby_events"("winner_entry_id");

-- CreateIndex
CREATE INDEX "home_run_derby_events_season_id_idx" ON "home_run_derby_events"("season_id");

-- CreateIndex
CREATE INDEX "derby_entries_event_id_idx" ON "derby_entries"("event_id");

-- CreateIndex
CREATE INDEX "derby_swings_entry_id_idx" ON "derby_swings"("entry_id");

-- AddForeignKey
ALTER TABLE "home_run_derby_events" ADD CONSTRAINT "home_run_derby_events_season_id_fkey" FOREIGN KEY ("season_id") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derby_entries" ADD CONSTRAINT "derby_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "home_run_derby_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derby_entries" ADD CONSTRAINT "derby_entries_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derby_entries" ADD CONSTRAINT "derby_entries_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derby_swings" ADD CONSTRAINT "derby_swings_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "home_run_derby_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "derby_swings" ADD CONSTRAINT "derby_swings_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "derby_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
