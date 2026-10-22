-- DOWN (SL-10, R22): revierte exactamente migration.sql de esta carpeta, en orden inverso.
-- Las cuatro columnas son NULLABLE, sin backfill, sin indices ni constraints: basta con DROP COLUMN.
-- ADVERTENCIA: este rollback PIERDE los datos del trazado guardado en esas columnas; se
-- rellenan en la siguiente sincronizacion si se vuelve a aplicar el UP.
-- NO toca columnas preexistentes de `ruta_optimizada`.

ALTER TABLE "ruta_optimizada" DROP COLUMN "trazado_fuente";
ALTER TABLE "ruta_optimizada" DROP COLUMN "trazado_duracion_s";
ALTER TABLE "ruta_optimizada" DROP COLUMN "trazado_distancia_m";
ALTER TABLE "ruta_optimizada" DROP COLUMN "trazado_polilinea";
