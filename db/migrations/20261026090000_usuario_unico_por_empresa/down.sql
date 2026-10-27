-- DOWN (SL-18 M1) — vuelve el email y la cedula de `usuario` a UNICOS GLOBALES, con su forma y su
-- nombre de antes, y borra `usuario_email_idx`.
--
-- SOLO ES APLICABLE SI NINGUN EMAIL NI NINGUNA CEDULA SE REPITE (R4). Con la migracion aplicada, la
-- misma persona puede tener una cuenta en cada empresa, y la de plataforma puede compartir email con
-- una de empresa; un unico global no lo admite. No se borra ni se renombra ninguna cuenta para «hacer
-- sitio»: son personas. Por eso, antes de tocar un indice, se cuentan los repetidos y, si hay
-- alguno, el down ABORTA con un mensaje que nombra el indice y no cambia nada (patron de SL-17 T3.9).

BEGIN;

DO $$
DECLARE
  emails bigint;
  cedulas bigint;
  culpables text := '';
BEGIN
  SELECT count(*) INTO emails FROM (SELECT 1 FROM "usuario" GROUP BY "email" HAVING count(*) > 1) d;
  SELECT count(*) INTO cedulas FROM (SELECT 1 FROM "usuario" GROUP BY "cedula" HAVING count(*) > 1) d;
  IF emails > 0 THEN
    culpables := culpables || format(' usuario_email_key (%s emails repetidos entre empresas);', emails);
  END IF;
  IF cedulas > 0 THEN
    culpables := culpables || format(' usuario_cedula_key (%s cedulas repetidas entre empresas);', cedulas);
  END IF;
  IF culpables <> '' THEN
    RAISE EXCEPTION 'SL-18 M1 down: no se puede volver a los unicos globales de usuario, hay repetidos:%', culpables
      USING HINT = 'El down solo aplica si ningun email ni ninguna cedula se repite. No se borro ni cambio nada.';
  END IF;
END $$;

DROP INDEX "usuario_email_idx";

DROP INDEX "usuario_email_key";
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario" ("email");

DROP INDEX "usuario_cedula_key";
CREATE UNIQUE INDEX "usuario_cedula_key" ON "usuario" ("cedula");

COMMIT;
