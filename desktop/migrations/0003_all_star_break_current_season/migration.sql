-- Agrega la pausa del Juego de Estrellas a la temporada en curso de partidas creadas antes
-- de esa funcion (equivale a backend/scripts/addAllStarBreak.js). Solo cambia la temporada
-- activa que sigue en 105 dias, no ha pasado del dia 60 y no tiene partidos jugados de la
-- segunda vuelta. Si no se cumple, no hace nada (partidas nuevas, temporadas avanzadas).
-- Dia 61 = Home Run Derby, dia 62 = Juego de Estrellas, segunda vuelta 63-107.
-- Dias de playoffs (>= 1000) no se tocan.

-- Mueve la segunda vuelta 2 dias
UPDATE "schedule"
SET "day_number" = "day_number" + 2
WHERE "day_number" > 60 AND "day_number" < 1000
  AND "season_id" IN (
    SELECT s."id" FROM "Season" s
    WHERE s."status" = 'active' AND s."total_days" = 105 AND s."current_day" <= 60
      AND NOT EXISTS (
        SELECT 1 FROM "schedule" g
        WHERE g."season_id" = s."id" AND g."day_number" > 60 AND g."day_number" < 1000
          AND g."status" <> 'scheduled'
      )
  );

-- Alarga la temporada (mismas condiciones, los partidos movidos siguen sin jugarse)
UPDATE "Season"
SET "total_days" = 107
WHERE "status" = 'active' AND "total_days" = 105 AND "current_day" <= 60
  AND NOT EXISTS (
    SELECT 1 FROM "schedule" g
    WHERE g."season_id" = "Season"."id" AND g."day_number" > 60 AND g."day_number" < 1000
      AND g."status" <> 'scheduled'
  );
