-- DOWN (SL-10, R22): revierte exactamente migration.sql de esta carpeta, en orden inverso.
-- Las tres columnas son NULLABLE, sin backfill, sin indices ni constraints: basta con DROP COLUMN.
-- ADVERTENCIA: este rollback PIERDE los datos de los tramos guardados en esas columnas; se
-- rellenan en la siguiente sincronizacion si se vuelve a aplicar el UP.
-- NO toca columnas preexistentes de `ruta_optimizada_parada`.

ALTER TABLE "ruta_optimizada_parada" DROP COLUMN "tramo_duracion_s";
ALTER TABLE "ruta_optimizada_parada" DROP COLUMN "tramo_distancia_m";
ALTER TABLE "ruta_optimizada_parada" DROP COLUMN "tramo_polilinea";
