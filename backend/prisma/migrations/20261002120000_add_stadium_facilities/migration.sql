-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "board_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "field_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lights_level" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "medical_level" INTEGER NOT NULL DEFAULT 1;

-- Tope de nivel 15 para las gradas: recorta cualquier seccion que ya lo haya superado
UPDATE "stadium_sections"
SET "upgrade_level" = 15, "capacity" = 1638400
WHERE "section_type" = 'grandstand' AND "upgrade_level" > 15;
