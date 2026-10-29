-- SLT-43 (design §2.1; R1, R2, R3, R12) — el catálogo de tipos de nivel geográfico, por país.
--
-- De PLATAFORMA, como `pais`: sin `organizacion_id`, la empresa lee solo los tipos de su país (RLS) y
-- no escribe ninguno. La tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de
-- 20261022130000_organizacion_y_rol_app), así que hace falta el REVOKE, igual que `pais`.
--
-- El tipo no lleva profundidad (decisión 2 de la épica): una región es un nodo más. La migración y la
-- sincronía usan las claves `nivel_1`, `nivel_2` y `nivel_3`, una por columna `pais.nivel_N_*`.
--
-- `codigo_hereda_prefijo` es la regla R17 de SL-20 («con dígitos, el código empieza por el del
-- padre») puesta como dato: nunca en el nivel 1, y en los niveles 2 y 3 solo si el país fija dígitos.
--
-- Los ids no tienen DEFAULT en la base: Prisma los genera (`@default(uuid())`) y el SQL de aquí los
-- pone con `gen_random_uuid()::text`, como el resto del esquema.
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

CREATE TABLE "tipo_nivel_geografico" (
    "id" TEXT NOT NULL,
    "pais_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre_singular" TEXT NOT NULL,
    "nombre_plural" TEXT NOT NULL,
    "digitos_codigo" INTEGER,
    "codigo_hereda_prefijo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_nivel_geografico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tipo_nivel_geografico_clave_check" CHECK ("clave" ~ '^[a-z0-9_]{1,40}$')
);

-- R1: la clave es única dentro de su país.
CREATE UNIQUE INDEX "tipo_nivel_geografico_pais_id_clave_key" ON "tipo_nivel_geografico"("pais_id", "clave");
-- Destino de la FK compuesta `(tipo_id, pais_id)` de `nodo_geografico` (R6): un nodo no puede usar un
-- tipo de otro país.
CREATE UNIQUE INDEX "tipo_nivel_geografico_id_pais_id_key" ON "tipo_nivel_geografico"("id", "pais_id");
CREATE INDEX "tipo_nivel_geografico_pais_id_idx" ON "tipo_nivel_geografico"("pais_id");

ALTER TABLE "tipo_nivel_geografico" ADD CONSTRAINT "tipo_nivel_geografico_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- R12: la empresa lee solo los tipos del país de su empresa y no escribe ninguno. Mismo patrón que
-- `provincia_del_pais` (20261026130200).
ALTER TABLE "tipo_nivel_geografico" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipo_nivel_geografico_del_pais" ON "tipo_nivel_geografico" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
REVOKE INSERT, UPDATE, DELETE ON "tipo_nivel_geografico" FROM servi_app;

-- R2: los tres tipos de TODOS los países que existan al migrar, no solo Costa Rica.
INSERT INTO "tipo_nivel_geografico"
  ("id", "pais_id", "clave", "nombre_singular", "nombre_plural", "digitos_codigo", "codigo_hereda_prefijo")
SELECT gen_random_uuid()::text,
       p."id",
       'nivel_' || n.nivel,
       CASE n.nivel WHEN 1 THEN p."nivel_1_singular" WHEN 2 THEN p."nivel_2_singular" ELSE p."nivel_3_singular" END,
       CASE n.nivel WHEN 1 THEN p."nivel_1_plural" WHEN 2 THEN p."nivel_2_plural" ELSE p."nivel_3_plural" END,
       CASE n.nivel WHEN 1 THEN p."digitos_codigo_nivel_1" WHEN 2 THEN p."digitos_codigo_nivel_2" ELSE p."digitos_codigo_nivel_3" END,
       CASE n.nivel WHEN 1 THEN false WHEN 2 THEN p."digitos_codigo_nivel_2" IS NOT NULL ELSE p."digitos_codigo_nivel_3" IS NOT NULL END
  FROM "pais" p
 CROSS JOIN (VALUES (1), (2), (3)) AS n(nivel);

-- R3: un país nuevo nace con sus tres tipos, y un cambio de nombres o dígitos los alcanza, en la
-- misma transacción. Así el alta de país de SL-20 (`PaisRepository.crear`) no cambia.
-- SECURITY DEFINER con `search_path` fijo (precedente 20261026130300): `servi_app` no escribe aquí,
-- y el trigger tiene que poder hacerlo sea quien sea el que escribe `pais`.
CREATE FUNCTION pais_tipos_de_nivel() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO tipo_nivel_geografico
    (id, pais_id, clave, nombre_singular, nombre_plural, digitos_codigo, codigo_hereda_prefijo)
  VALUES
    (gen_random_uuid()::text, NEW.id, 'nivel_1', NEW.nivel_1_singular, NEW.nivel_1_plural,
     NEW.digitos_codigo_nivel_1, false),
    (gen_random_uuid()::text, NEW.id, 'nivel_2', NEW.nivel_2_singular, NEW.nivel_2_plural,
     NEW.digitos_codigo_nivel_2, NEW.digitos_codigo_nivel_2 IS NOT NULL),
    (gen_random_uuid()::text, NEW.id, 'nivel_3', NEW.nivel_3_singular, NEW.nivel_3_plural,
     NEW.digitos_codigo_nivel_3, NEW.digitos_codigo_nivel_3 IS NOT NULL)
  ON CONFLICT (pais_id, clave) DO UPDATE
    SET nombre_singular = EXCLUDED.nombre_singular,
        nombre_plural = EXCLUDED.nombre_plural,
        digitos_codigo = EXCLUDED.digitos_codigo,
        codigo_hereda_prefijo = EXCLUDED.codigo_hereda_prefijo;
  RETURN NULL;
END $$;

CREATE TRIGGER "pais_tipos_de_nivel"
  AFTER INSERT OR UPDATE OF
    "nivel_1_singular", "nivel_1_plural", "nivel_2_singular", "nivel_2_plural",
    "nivel_3_singular", "nivel_3_plural",
    "digitos_codigo_nivel_1", "digitos_codigo_nivel_2", "digitos_codigo_nivel_3"
  ON "pais"
  FOR EACH ROW EXECUTE FUNCTION pais_tipos_de_nivel();

COMMIT;
