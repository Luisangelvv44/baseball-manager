-- CreateTable
CREATE TABLE "news_items" (
    "id" SERIAL NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "headline" VARCHAR(500) NOT NULL,
    "season_day" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_items_season_day_idx" ON "news_items"("season_day");
