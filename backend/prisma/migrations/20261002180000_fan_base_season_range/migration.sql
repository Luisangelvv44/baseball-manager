-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "max_fan_base_season" INTEGER,
ADD COLUMN     "min_fan_base_season" INTEGER;

-- Arranca el rango de la temporada en curso con la fanaticada actual
UPDATE "Team" SET "min_fan_base_season" = "fan_base", "max_fan_base_season" = "fan_base";
