-- SLT-42 (design §2.2; R2, R3, R4, R5, R7, R8) — los tipos de documento pasan a ser catálogo por país.
--
-- POR QUÉ SE AMPLÍA LA TABLA Y NO SE CREA OTRA (P1). `usuario.tipo_identificacion_id` no cambia: el
-- usuario que apuntaba a la fila «cedula» sigue apuntando a ella, y esa fila ES desde aquí la cédula
-- física de Costa Rica. Cero UPDATE sobre `usuario` y cero sobre columnas que ya existían (R7, R8):
-- los UPDATE de abajo solo escriben columnas que nacen en esta migración.
--
-- `value` no se toca y sigue siendo único global: es lo que mandan hoy el alta de empresa, la
-- postulación y el arranque del superadmin. Un tipo de otro país lo da de alta SLT-81 con
-- `value = '<PAIS>_<clave>'`.
--
-- FILAS QUE PUEDEN FALTAR. Ninguna migración anterior inserta «ruc» ni «pasaporte»: en producción
-- existen porque los sembró `db:seed`, pero en una base nueva (CI, un entorno recién creado) a esta
-- altura solo existe «cedula». Por eso las tres se insertan si faltan (filas nuevas, completas) y
-- se rellenan si ya están. El resultado es el mismo en las dos bases: los cinco tipos de CR.
--
-- PRECONDICIÓN (aborta sin cambiar nada): existe el país CR y no hay ninguna fila fuera de «cedula»,
-- «ruc» y «pasaporte». Una fila creada a mano no tendría país ni regla, y no cabría en el NOT NULL.
--
-- SEGURIDAD (R4, R5). Se AÑADE una política RESTRICTIVA a la permisiva de hoy
-- (`tipo_identificacion_lectura`, USING true): juntas dan «solo los tipos del país de mi empresa».
-- Misma expresión que `provincia_del_pais` (SL-20): sin empresa en contexto la subconsulta da NULL y
-- no se ve nada. El dueño (plataforma) no tiene RLS. La escritura ya está revocada a `servi_app`
-- (20261022130000). El repositorio filtra además por país y `activo`: la política es la red.

BEGIN;

DO $slt42$
DECLARE
  v_ajenas text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "pais" WHERE "id" = 'CR') THEN
    RAISE EXCEPTION 'SLT-42: no existe el país CR; se aborta sin cambiar nada';
  END IF;
  SELECT string_agg(quote_literal("value"), ', ' ORDER BY "value") INTO v_ajenas
    FROM "tipo_identificacion"
   WHERE "value" NOT IN ('cedula', 'ruc', 'pasaporte');
  IF v_ajenas IS NOT NULL THEN
    RAISE EXCEPTION 'SLT-42: tipo_identificacion tiene filas que no son cedula, ruc ni pasaporte (%); se aborta sin cambiar nada', v_ajenas
      USING HINT = 'Una fila sin país no cabe en el NOT NULL de pais_id. Decide a qué país y regla pertenece antes de migrar.';
  END IF;
END $slt42$;

ALTER TABLE "tipo_identificacion"
  ADD COLUMN "pais_id"    TEXT     NULL,
  ADD COLUMN "clave"      TEXT     NULL,
  ADD COLUMN "nombre"     TEXT     NULL,
  ADD COLUMN "caracteres" TEXT     NULL,
  ADD COLUMN "largo_min"  SMALLINT NULL,
  ADD COLUMN "largo_max"  SMALLINT NULL,
  ADD COLUMN "orden"      SMALLINT NULL,
  ADD COLUMN "activo"     BOOLEAN  NOT NULL DEFAULT true;

ALTER TABLE "tipo_identificacion"
  ADD CONSTRAINT "tipo_identificacion_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Las que falten nacen ya completas; las que existen solo ganan sus columnas nuevas.
INSERT INTO "tipo_identificacion" ("id", "value", "pais_id", "clave", "nombre", "caracteres", "largo_min", "largo_max", "orden")
VALUES (gen_random_uuid()::text, 'cedula',    'CR', 'cedula_fisica',   'Cédula física',   'digitos',      9,  9,  1),
       (gen_random_uuid()::text, 'ruc',       'CR', 'cedula_juridica', 'Cédula jurídica', 'digitos',      10, 10, 2),
       (gen_random_uuid()::text, 'pasaporte', 'CR', 'pasaporte',       'Pasaporte',       'alfanumerico', 6,  20, 5)
ON CONFLICT ("value") DO NOTHING;

UPDATE "tipo_identificacion"
   SET "pais_id" = 'CR', "clave" = 'cedula_fisica', "nombre" = 'Cédula física',
       "caracteres" = 'digitos', "largo_min" = 9, "largo_max" = 9, "orden" = 1
 WHERE "value" = 'cedula' AND "pais_id" IS NULL;
UPDATE "tipo_identificacion"
   SET "pais_id" = 'CR', "clave" = 'cedula_juridica', "nombre" = 'Cédula jurídica',
       "caracteres" = 'digitos', "largo_min" = 10, "largo_max" = 10, "orden" = 2
 WHERE "value" = 'ruc' AND "pais_id" IS NULL;
-- P5: alfanumérico, sin espacios, de 6 a 20.
UPDATE "tipo_identificacion"
   SET "pais_id" = 'CR', "clave" = 'pasaporte', "nombre" = 'Pasaporte',
       "caracteres" = 'alfanumerico', "largo_min" = 6, "largo_max" = 20, "orden" = 5
 WHERE "value" = 'pasaporte' AND "pais_id" IS NULL;

INSERT INTO "tipo_identificacion" ("id", "value", "pais_id", "clave", "nombre", "caracteres", "largo_min", "largo_max", "orden")
VALUES (gen_random_uuid()::text, 'dimex', 'CR', 'dimex', 'DIMEX', 'digitos', 11, 12, 3),
       (gen_random_uuid()::text, 'nite',  'CR', 'nite',  'NITE',  'digitos', 10, 10, 4);

-- Con todas las filas rellenas, las columnas nuevas se cierran.
ALTER TABLE "tipo_identificacion"
  ALTER COLUMN "pais_id"    SET NOT NULL,
  ALTER COLUMN "clave"      SET NOT NULL,
  ALTER COLUMN "nombre"     SET NOT NULL,
  ALTER COLUMN "caracteres" SET NOT NULL,
  ALTER COLUMN "largo_min"  SET NOT NULL,
  ALTER COLUMN "largo_max"  SET NOT NULL,
  ALTER COLUMN "orden"      SET NOT NULL,
  ADD CONSTRAINT "tipo_identificacion_caracteres" CHECK ("caracteres" IN ('digitos', 'alfanumerico')),
  ADD CONSTRAINT "tipo_identificacion_largos"     CHECK ("largo_min" BETWEEN 1 AND "largo_max" AND "largo_max" <= 30);

CREATE UNIQUE INDEX "tipo_identificacion_pais_clave_key" ON "tipo_identificacion" ("pais_id", "clave");
CREATE INDEX "tipo_identificacion_pais_idx" ON "tipo_identificacion" ("pais_id");

CREATE POLICY "tipo_identificacion_del_pais" ON "tipo_identificacion" AS RESTRICTIVE
  FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));

COMMIT;
