-- DOWN (SLT-42, design §2.3) — vuelve el documento de `usuario` a único por empresa, con la forma y
-- el nombre de SL-18 (20261026090000_usuario_unico_por_empresa).
--
-- SOLO ES APLICABLE SI NINGÚN DOCUMENTO SE REPITE DENTRO DE UNA EMPRESA. Con la migración aplicada,
-- dos usuarios de la misma empresa pueden tener el mismo documento con tipos distintos; el índice de
-- antes no lo admite. No se borra ni se cambia ningún usuario para «hacer sitio»: son personas. Se
-- cuentan los repetidos de (organizacion_id, cedula) y, si hay alguno, RAISE y no cambia nada
-- (patrón de SL-18). GROUP BY agrupa los NULL juntos, igual que NULLS NOT DISTINCT.
--
-- Va PRIMERO entre los down de SLT-42 (orden inverso).

BEGIN;

DO $slt42$
DECLARE
  v_repetidos bigint;
BEGIN
  SELECT count(*) INTO v_repetidos FROM (
    SELECT 1 FROM "usuario" GROUP BY "organizacion_id", "cedula" HAVING count(*) > 1
  ) d;
  IF v_repetidos > 0 THEN
    RAISE EXCEPTION 'SLT-42 down: no se puede volver a usuario_cedula_key por (organizacion_id, cedula), hay % documento(s) repetido(s) dentro de una empresa', v_repetidos
      USING HINT = 'El down solo aplica si ningún documento se repite dentro de una empresa. No se borró ni cambió nada.';
  END IF;
END $slt42$;

DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key"
  ON "usuario" ("organizacion_id", "cedula") NULLS NOT DISTINCT;

COMMIT;
