-- SL-20 (design §2.3, §2.4, §3; R2, R11, R12, R15, R16) — la geografía cuelga del país.
--
-- ORDEN (decisión F2.1, opción A): va DESPUÉS de 20261026130100_organizacion_pais, porque las
-- políticas `*_del_pais` leen `organizacion.pais_id`.
--
-- 1. `provincia.pais_id` con `DEFAULT 'CR'`: es el backfill de las 7 provincias (R2) y deja en Costa
--    Rica las provincias que crean los tests sin conocer el país. `GeoRepository` siempre lo pasa.
-- 2. `canton.pais_id` y `distrito.pais_id`, SIN default: se rellenan desde el padre y desde entonces
--    los pone el trigger `geografia_pais_del_padre`. Nadie que crea un cantón tiene que conocer su país.
-- 3. FK compuestas `(padre_id, pais_id) → padre(id, pais_id)` en lugar de las simples: un hijo en otro
--    país que su padre es imposible aunque alguien escriba `pais_id` a mano (R11).
--    `ON UPDATE RESTRICT` y no `CASCADE` (decisión F2.1): con CASCADE, cambiar el país de una
--    provincia arrastraría en silencio sus cantones, sus distritos y con ellos las órdenes de otra
--    empresa a otro país, sin pasar por el trigger de 20261026130300.
-- 4. Los únicos globales pasan a ser por país (R15, R16): dos países pueden repetir nombre de
--    provincia y código. Los `NULL` del código no compiten entre sí.
-- 5. La RLS de lectura pasa de «todo» a «lo del país de mi empresa» (R12). La subconsulta no está
--    correlacionada: Postgres la evalúa una vez por sentencia (InitPlan). Con `servi_app`,
--    `organizacion` ya está filtrada por `organizacion_propia`, así que solo ve la empresa propia.
--    Sin empresa en contexto la subconsulta da NULL y la política no deja ver nada.
--
-- Los `id` de los 585 nodos no cambian: solo se añaden columnas y se cambian constraints.

BEGIN;

-- ─── provincia ───────────────────────────────────────────────────────────────────────────────
ALTER TABLE "provincia" ADD COLUMN "pais_id" TEXT NOT NULL DEFAULT 'CR';
ALTER TABLE "provincia" ADD CONSTRAINT "provincia_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
DROP INDEX "provincia_nombre_key";
CREATE UNIQUE INDEX "provincia_pais_id_nombre_key" ON "provincia"("pais_id", "nombre");
DROP INDEX "provincia_codigo_dta_key";
CREATE UNIQUE INDEX "provincia_pais_id_codigo_dta_key" ON "provincia"("pais_id", "codigo_dta");
-- Destino de la FK compuesta de `canton`.
CREATE UNIQUE INDEX "provincia_id_pais_id_key" ON "provincia"("id", "pais_id");

-- ─── canton ──────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "canton" ADD COLUMN "pais_id" TEXT;
UPDATE "canton" c SET "pais_id" = p."pais_id" FROM "provincia" p WHERE p."id" = c."provincia_id";
ALTER TABLE "canton" ALTER COLUMN "pais_id" SET NOT NULL;
ALTER TABLE "canton" DROP CONSTRAINT "canton_provincia_id_fkey";
ALTER TABLE "canton" ADD CONSTRAINT "canton_provincia_id_pais_id_fkey" FOREIGN KEY ("provincia_id", "pais_id")
  REFERENCES "provincia"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
DROP INDEX "canton_codigo_dta_key";
CREATE UNIQUE INDEX "canton_pais_id_codigo_dta_key" ON "canton"("pais_id", "codigo_dta");
-- Destino de la FK compuesta de `distrito`.
CREATE UNIQUE INDEX "canton_id_pais_id_key" ON "canton"("id", "pais_id");
CREATE INDEX "canton_pais_id_idx" ON "canton"("pais_id");

-- ─── distrito ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "distrito" ADD COLUMN "pais_id" TEXT;
UPDATE "distrito" d SET "pais_id" = c."pais_id" FROM "canton" c WHERE c."id" = d."canton_id";
ALTER TABLE "distrito" ALTER COLUMN "pais_id" SET NOT NULL;
ALTER TABLE "distrito" DROP CONSTRAINT "distrito_canton_id_fkey";
ALTER TABLE "distrito" ADD CONSTRAINT "distrito_canton_id_pais_id_fkey" FOREIGN KEY ("canton_id", "pais_id")
  REFERENCES "canton"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
DROP INDEX "distrito_codigo_dta_key";
CREATE UNIQUE INDEX "distrito_pais_id_codigo_dta_key" ON "distrito"("pais_id", "codigo_dta");
CREATE INDEX "distrito_pais_id_idx" ON "distrito"("pais_id");

-- ─── el país del hijo sale del padre ─────────────────────────────────────────────────────────
-- Pisa lo que traiga `NEW.pais_id`: el país de un cantón o de un distrito no se elige, se hereda.
-- Con un padre inexistente no hay país que copiar; se lanza la violación de FK con el nombre de la
-- constraint compuesta, para que el llamador vea el mismo error que antes (P2003) y no un NOT NULL.
CREATE FUNCTION geografia_pais_del_padre() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_pais text;
BEGIN
  IF TG_TABLE_NAME = 'canton' THEN
    SELECT p.pais_id INTO v_pais FROM provincia p WHERE p.id = NEW.provincia_id;
    IF v_pais IS NULL THEN
      RAISE EXCEPTION 'la provincia % no existe', NEW.provincia_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'canton_provincia_id_pais_id_fkey';
    END IF;
  ELSE
    SELECT c.pais_id INTO v_pais FROM canton c WHERE c.id = NEW.canton_id;
    IF v_pais IS NULL THEN
      RAISE EXCEPTION 'el canton % no existe', NEW.canton_id
        USING ERRCODE = 'foreign_key_violation', CONSTRAINT = 'distrito_canton_id_pais_id_fkey';
    END IF;
  END IF;
  NEW.pais_id := v_pais;
  RETURN NEW;
END $$;

CREATE TRIGGER "canton_pais_del_padre" BEFORE INSERT OR UPDATE OF "provincia_id" ON "canton"
  FOR EACH ROW EXECUTE FUNCTION geografia_pais_del_padre();
CREATE TRIGGER "distrito_pais_del_padre" BEFORE INSERT OR UPDATE OF "canton_id" ON "distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_pais_del_padre();

-- ─── RLS: solo el país de la empresa (R12) ───────────────────────────────────────────────────
DROP POLICY "provincia_lectura" ON "provincia";
DROP POLICY "canton_lectura" ON "canton";
DROP POLICY "distrito_lectura" ON "distrito";

-- Cada tabla compara su propio `pais_id`, sin join al padre: una lectura de distritos no paga la
-- subida por el árbol.
CREATE POLICY "provincia_del_pais" ON "provincia" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
CREATE POLICY "canton_del_pais" ON "canton" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
CREATE POLICY "distrito_del_pais" ON "distrito" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));

COMMIT;
