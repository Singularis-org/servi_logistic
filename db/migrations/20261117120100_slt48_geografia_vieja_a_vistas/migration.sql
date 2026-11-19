-- SLT-48 (design §2.1; R1–R9, R13, R14, R20) — `provincia`, `canton` y `distrito` pasan a ser vistas de
-- solo lectura sobre `nodo_geografico`. Primer deploy del retiro del modelo viejo.
--
-- Qué hace, en este orden y en una transacción:
--   1. Precondición (R6): si alguna orden (también las borradas), `zona_distrito` o
--      `distrito_zona_especial` tiene el nodo en NULL, aborta sin cambiar nada y dice cuántas faltan.
--   2. Quita las 5 FK hacia las tablas viejas y el NOT NULL de `orden.provincia_id`/`canton_id` (R4).
--      Ninguna columna se borra y ningún valor cambia (R20).
--   3. Quita la sincronía en los dos sentidos (R5) y los triggers de país de las tablas viejas.
--   4. `orden_nodo_geografico` (R9): con nodo, se conserva; sin nodo, el lugar de sus FK.
--   5. `geografia_del_pais_de_la_empresa` (R7, R8): lee `nodo_geografico`, y sus triggers también
--      saltan al cambiar el nodo.
--   6. Tablas → vistas con `security_invoker` (R1, R3), un trigger `INSTEAD OF` que lo rechaza todo con
--      `SL048` (R2) y solo `SELECT` para `servi_app`.
--
-- Lo destructivo de este archivo está declarado uno por uno en
-- `tests/unit/db/slt48-migraciones-declaradas.test.ts` (R13). Borrar columnas, las vistas o tocar
-- `pais` es de SLT-196 (R14). Su `down.sql` deja la base como antes (R11, R12).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- ── 1. Precondición (R6) ─────────────────────────────────────────────────────────────────────────
-- En producción el backfill de SLT-43 ya corrió; si no, esta migración no entra. Sin el nodo, una
-- orden vieja perdería su lugar al pasar los lectores al árbol.
DO $$
DECLARE
  v_orden bigint;
  v_zona bigint;
  v_marca bigint;
BEGIN
  SELECT count(*) INTO v_orden FROM orden WHERE nodo_geografico_id IS NULL;
  SELECT count(*) INTO v_zona FROM zona_distrito WHERE nodo_geografico_id IS NULL;
  SELECT count(*) INTO v_marca FROM distrito_zona_especial WHERE nodo_geografico_id IS NULL;
  IF v_orden + v_zona + v_marca > 0 THEN
    RAISE EXCEPTION 'SLT-48: faltan nodos; corre antes pnpm geo:backfill (orden: %, zona_distrito: %, distrito_zona_especial: %)',
      v_orden, v_zona, v_marca;
  END IF;
END $$;

-- ── 2. FK y NOT NULL (R4) ────────────────────────────────────────────────────────────────────────
ALTER TABLE "orden" DROP CONSTRAINT "orden_provincia_id_fkey";
ALTER TABLE "orden" DROP CONSTRAINT "orden_canton_id_fkey";
ALTER TABLE "orden" DROP CONSTRAINT "orden_distrito_id_fkey";
ALTER TABLE "zona_distrito" DROP CONSTRAINT "zona_distrito_distrito_id_fkey";
ALTER TABLE "distrito_zona_especial" DROP CONSTRAINT "distrito_zona_especial_distrito_id_fkey";
ALTER TABLE "orden" ALTER COLUMN "provincia_id" DROP NOT NULL;
ALTER TABLE "orden" ALTER COLUMN "canton_id" DROP NOT NULL;

-- ── 3. Sincronía y triggers de las tablas viejas (R5) ────────────────────────────────────────────
-- Vieja → nodo (SLT-43, 20261104120300).
DROP TRIGGER "provincia_sincroniza_nodo_geografico" ON "provincia";
DROP TRIGGER "canton_sincroniza_nodo_geografico" ON "canton";
DROP TRIGGER "distrito_sincroniza_nodo_geografico" ON "distrito";
DROP FUNCTION geo_sincronizar_provincia();
DROP FUNCTION geo_sincronizar_canton();
DROP FUNCTION geo_sincronizar_distrito();
-- Nodo → vieja (SLT-46, 20261106120100).
DROP TRIGGER "nodo_geografico_copia_a_geografia_vieja" ON "nodo_geografico";
DROP FUNCTION geo_copiar_nodo_a_geografia_vieja();
-- El país del padre (SL-20): vive sobre las tablas viejas y muere con ellas; en el árbol lo garantiza
-- la FK compuesta `nodo_geografico_padre_id_pais_id_fkey`.
DROP TRIGGER "canton_pais_del_padre" ON "canton";
DROP TRIGGER "distrito_pais_del_padre" ON "distrito";
DROP FUNCTION geografia_pais_del_padre();

-- ── 4. El nodo de la orden (R9) ──────────────────────────────────────────────────────────────────
-- La app ya solo escribe el nodo. Las FK quedan para el SQL a mano y los fixtures: sin nodo, el nodo
-- es su lugar (el distrito, o el cantón si no hay distrito). Un UPDATE que solo cambia las FK mueve el
-- nodo con ellas, como hoy; uno que trae nodo nuevo lo conserva. Sale la búsqueda «subiendo» de SLT-89:
-- solo hacía falta mientras las FK eran la fuente. Sin consultas: cuenta para el tope de R10.
CREATE OR REPLACE FUNCTION orden_nodo_geografico() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_lugar text := COALESCE(NEW.distrito_id, NEW.canton_id);
BEGIN
  IF NEW.nodo_geografico_id IS NULL
     OR (TG_OP = 'UPDATE'
         AND v_lugar IS NOT NULL
         AND NEW.nodo_geografico_id IS NOT DISTINCT FROM OLD.nodo_geografico_id
         AND v_lugar IS DISTINCT FROM COALESCE(OLD.distrito_id, OLD.canton_id)) THEN
    NEW.nodo_geografico_id := v_lugar;
  END IF;
  RETURN NEW;
END $$;

-- ── 5. Geografía del país de la empresa (R7, R8) ─────────────────────────────────────────────────
-- Lee `nodo_geografico`. Se miran también los ids de las FK que traiga la fila: este trigger corre
-- ANTES que el que pone el nodo (los BEFORE del mismo momento van por orden de nombre), así que en una
-- orden con FK y sin nodo, o en una fila de zona que cambia `distrito_id`, el nodo todavía no está
-- puesto. Los ids de las FK son ids de nodo. Mismo SQLSTATE de siempre.
CREATE OR REPLACE FUNCTION geografia_del_pais_de_la_empresa() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pais_empresa text;
  v_columna text;
BEGIN
  SELECT o.pais_id INTO v_pais_empresa FROM organizacion o WHERE o.id = NEW.organizacion_id;
  -- Sin empresa no hay país con que comparar; la fila la rechaza su NOT NULL o su FK.
  IF v_pais_empresa IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'orden' THEN
    SELECT CASE n.id
             WHEN NEW.nodo_geografico_id THEN 'nodo_geografico_id'
             WHEN NEW.provincia_id THEN 'provincia_id'
             WHEN NEW.canton_id THEN 'canton_id'
             ELSE 'distrito_id'
           END
      INTO v_columna
      FROM nodo_geografico n
     WHERE n.id IN (NEW.nodo_geografico_id, NEW.provincia_id, NEW.canton_id, NEW.distrito_id)
       AND n.pais_id <> v_pais_empresa
     LIMIT 1;
  ELSE
    SELECT CASE n.id WHEN NEW.nodo_geografico_id THEN 'nodo_geografico_id' ELSE 'distrito_id' END
      INTO v_columna
      FROM nodo_geografico n
     WHERE n.id IN (NEW.nodo_geografico_id, NEW.distrito_id)
       AND n.pais_id <> v_pais_empresa
     LIMIT 1;
  END IF;

  IF v_columna IS NOT NULL THEN
    RAISE EXCEPTION 'geografía de otro país: %.% no es del país % de la empresa', TG_TABLE_NAME, v_columna, v_pais_empresa
      USING ERRCODE = 'SL021';
  END IF;
  RETURN NEW;
END $$;

-- Los tres triggers saltan también al cambiar el nodo (R7: «o se cambia su nodo»).
DROP TRIGGER "orden_geografia_del_pais_de_la_empresa" ON "orden";
CREATE TRIGGER "orden_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id, nodo_geografico_id ON "orden"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
DROP TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa" ON "zona_distrito";
CREATE TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF distrito_id, nodo_geografico_id ON "zona_distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
DROP TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa" ON "distrito_zona_especial";
CREATE TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF distrito_id, nodo_geografico_id ON "distrito_zona_especial"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();

-- ── 6. Tablas → vistas (R1–R3) ───────────────────────────────────────────────────────────────────
-- Sin CASCADE: si algo que esta migración no conoce depende de ellas, que falle aquí.
DROP TABLE "distrito";
DROP TABLE "canton";
DROP TABLE "provincia";

-- `security_invoker`: la RLS `nodo_geografico_del_pais` se aplica a quien consulta (R3). Sin ella la
-- vista correría con los permisos del dueño y se saltaría la RLS. Exige Postgres ≥ 15.
CREATE VIEW "provincia" WITH (security_invoker = true) AS
  SELECT n.id, n.nombre, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
    FROM nodo_geografico n WHERE n.profundidad = 1;
CREATE VIEW "canton" WITH (security_invoker = true) AS
  SELECT n.id, n.nombre, n.padre_id AS provincia_id, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
    FROM nodo_geografico n WHERE n.profundidad = 2;
CREATE VIEW "distrito" WITH (security_invoker = true) AS
  SELECT n.id, n.nombre, n.padre_id AS canton_id, n.activo, n.codigo_oficial AS codigo_dta, n.pais_id
    FROM nodo_geografico n WHERE n.profundidad = 3;

-- Solo lectura (R2). Una vista de una tabla con WHERE es actualizable sola: sin esto, un INSERT
-- llegaría a `nodo_geografico`. El trigger cubre también al dueño, que un REVOKE no cubriría.
CREATE FUNCTION geografia_vieja_solo_lectura() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'geografía vieja de solo lectura: % sobre %; escribe nodo_geografico', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'SL048';
END $$;

CREATE TRIGGER "provincia_solo_lectura"
  INSTEAD OF INSERT OR UPDATE OR DELETE ON "provincia"
  FOR EACH ROW EXECUTE FUNCTION geografia_vieja_solo_lectura();
CREATE TRIGGER "canton_solo_lectura"
  INSTEAD OF INSERT OR UPDATE OR DELETE ON "canton"
  FOR EACH ROW EXECUTE FUNCTION geografia_vieja_solo_lectura();
CREATE TRIGGER "distrito_solo_lectura"
  INSTEAD OF INSERT OR UPDATE OR DELETE ON "distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_vieja_solo_lectura();

-- Los privilegios por defecto del esquema le darían a `servi_app` escritura sobre las vistas.
REVOKE ALL ON "provincia", "canton", "distrito" FROM servi_app;
GRANT SELECT ON "provincia", "canton", "distrito" TO servi_app;

COMMIT;
