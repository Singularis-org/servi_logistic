-- DOWN (SLT-42, design §2.4) — revierte 20261104140100_slt42_tipo_documento_por_pais.
--
-- ABORTA SI ALGÚN USUARIO USA DIMEX O NITE. Esas dos filas nacieron en la subida y el down las
-- borra; con un usuario apuntándolas no hay a qué tipo de antes devolverlo sin cambiar su documento,
-- y son personas. Se cuentan antes de tocar nada: si hay alguno, RAISE y no cambia nada.
--
-- Las filas «cedula», «ruc» y «pasaporte» se quedan: sus columnas de antes (`id`, `value`) nunca
-- cambiaron, así que al soltar las columnas nuevas vuelven a su forma exacta. En una base nueva la
-- subida pudo haber insertado «ruc» y «pasaporte»; tampoco se borran: el down no sabe si existían
-- antes (las sembraba `db:seed` hasta SLT-42) y borrarlas podría llevarse una fila previa (R8).
--
-- Va DESPUÉS del down de 20261104140200 y ANTES del de 20261104140000 (orden inverso).

BEGIN;

DO $slt42$
DECLARE
  v_usuarios bigint;
BEGIN
  SELECT count(*) INTO v_usuarios
    FROM "usuario" u
    JOIN "tipo_identificacion" t ON t."id" = u."tipo_identificacion_id"
   WHERE t."value" IN ('dimex', 'nite');
  IF v_usuarios > 0 THEN
    RAISE EXCEPTION 'SLT-42 down: % usuario(s) usan el tipo dimex o nite; no se puede volver al catálogo de antes', v_usuarios
      USING HINT = 'El down solo aplica si ningún usuario usa dimex ni nite. No se borró ni cambió nada.';
  END IF;
END $slt42$;

DROP POLICY "tipo_identificacion_del_pais" ON "tipo_identificacion";

DROP INDEX "tipo_identificacion_pais_idx";
DROP INDEX "tipo_identificacion_pais_clave_key";

ALTER TABLE "tipo_identificacion"
  DROP CONSTRAINT "tipo_identificacion_caracteres",
  DROP CONSTRAINT "tipo_identificacion_largos",
  DROP CONSTRAINT "tipo_identificacion_pais_id_fkey";

DELETE FROM "tipo_identificacion" WHERE "value" IN ('dimex', 'nite');

ALTER TABLE "tipo_identificacion"
  DROP COLUMN "pais_id",
  DROP COLUMN "clave",
  DROP COLUMN "nombre",
  DROP COLUMN "caracteres",
  DROP COLUMN "largo_min",
  DROP COLUMN "largo_max",
  DROP COLUMN "orden",
  DROP COLUMN "activo";

COMMIT;
