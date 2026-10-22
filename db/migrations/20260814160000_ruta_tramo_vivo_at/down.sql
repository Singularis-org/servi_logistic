-- DOWN (SL-10, R22): revierte exactamente migration.sql de esta carpeta.
-- La columna es NULLABLE, sin backfill, sin indices ni constraints: basta con DROP COLUMN.
-- ADVERTENCIA: este rollback PIERDE el instante del ultimo trayecto en vivo (`tramo_vivo_at`);
-- la guarda de coste lo trata como NULL («adelante») si se vuelve a aplicar el UP.
-- NO toca columnas preexistentes de `ruta_optimizada`.

ALTER TABLE "ruta_optimizada" DROP COLUMN "tramo_vivo_at";
