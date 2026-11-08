-- DOWN (SLT-94, 2 de 4; R35) — suelta la marca «se recoge en tienda» SIN perder lo que se cambió en ella.
--
-- Antes del DROP, devuelve a la columna vieja la marca vigente: fulfillment = NOT se_recoge_en_tienda.
-- Solo toca las filas donde las dos no casan ya (un cambio hecho a la nueva después de migrar); el resto
-- queda intacto. La columna `fulfillment` no se borra (D4). En una transacción: si algo falla, nada queda
-- a medias.

BEGIN;

UPDATE "usuario" SET "fulfillment" = NOT "se_recoge_en_tienda"
 WHERE "fulfillment" IS DISTINCT FROM (NOT "se_recoge_en_tienda");

ALTER TABLE "usuario" DROP COLUMN "se_recoge_en_tienda";

COMMIT;
