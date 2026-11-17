-- DOWN de SLT-48 20261117120100 (design §2.1; R11, R12) — devuelve las tablas viejas.
--
--   1. Precondición (P5, R12): una orden cuyo nodo no se puede expresar con las 3 FK (profundidad 1, o
--      4 o más) aborta la vuelta sin cambiar nada y dice cuántas son. Antes hay que decidir qué hacer
--      con ellas.
--   2. Quita las vistas y recrea las tablas con el DDL de antes (columnas, PK, únicos, FK compuestas,
--      índices, RLS `*_del_pais` y solo `SELECT` para `servi_app`), llenas desde los nodos de
--      profundidad 1–3.
--   3. Rellena las 3 FK de las órdenes que no las tienen desde la ruta de su nodo (profundidad 3 →
--      abuelo, padre, nodo; profundidad 2 → padre, nodo, NULL).
--   4. Repone el NOT NULL, las 5 FK, la sincronía en los dos sentidos, el país del padre y las
--      funciones de `orden` y de país con su cuerpo de antes (copiado del catálogo de una base con
--      20261110130100 aplicada).
-- Ida → vuelta → ida deja el esquema y los datos iguales (`migracion-slt48-ida-y-vuelta.test.ts`).

BEGIN;

-- ── 1. Precondición (R12) ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ordenes bigint;
BEGIN
  SELECT count(*) INTO v_ordenes
    FROM orden o JOIN nodo_geografico n ON n.id = o.nodo_geografico_id
   WHERE n.profundidad NOT IN (2, 3);
  IF v_ordenes > 0 THEN
    RAISE EXCEPTION 'SLT-48 down: % ordenes estan en un nodo que la geografia vieja no sabe guardar (profundidad 1, o 4 o mas); decide antes que hacer con ellas',
      v_ordenes;
  END IF;
END $$;

-- ── 2. Vistas → tablas ───────────────────────────────────────────────────────────────────────────
DROP VIEW "distrito";
DROP VIEW "canton";
DROP VIEW "provincia";
DROP FUNCTION geografia_vieja_solo_lectura();

CREATE TABLE "provincia" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "codigo_dta" TEXT,
  "pais_id" TEXT NOT NULL DEFAULT 'CR',
  CONSTRAINT "provincia_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "canton" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "provincia_id" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "codigo_dta" TEXT,
  "pais_id" TEXT NOT NULL,
  CONSTRAINT "canton_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "distrito" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "canton_id" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "codigo_dta" TEXT,
  "pais_id" TEXT NOT NULL,
  CONSTRAINT "distrito_pkey" PRIMARY KEY ("id")
);

INSERT INTO "provincia" ("id", "nombre", "activo", "codigo_dta", "pais_id")
  SELECT n.id, n.nombre, n.activo, n.codigo_oficial, n.pais_id FROM nodo_geografico n WHERE n.profundidad = 1;
INSERT INTO "canton" ("id", "nombre", "provincia_id", "activo", "codigo_dta", "pais_id")
  SELECT n.id, n.nombre, n.padre_id, n.activo, n.codigo_oficial, n.pais_id FROM nodo_geografico n WHERE n.profundidad = 2;
INSERT INTO "distrito" ("id", "nombre", "canton_id", "activo", "codigo_dta", "pais_id")
  SELECT n.id, n.nombre, n.padre_id, n.activo, n.codigo_oficial, n.pais_id FROM nodo_geografico n WHERE n.profundidad = 3;

CREATE UNIQUE INDEX "provincia_id_pais_id_key" ON "provincia"("id", "pais_id");
CREATE UNIQUE INDEX "provincia_pais_id_codigo_dta_key" ON "provincia"("pais_id", "codigo_dta");
CREATE UNIQUE INDEX "provincia_pais_id_nombre_key" ON "provincia"("pais_id", "nombre");
CREATE UNIQUE INDEX "canton_id_pais_id_key" ON "canton"("id", "pais_id");
CREATE UNIQUE INDEX "canton_pais_id_codigo_dta_key" ON "canton"("pais_id", "codigo_dta");
CREATE INDEX "canton_pais_id_idx" ON "canton"("pais_id");
CREATE INDEX "canton_provincia_id_idx" ON "canton"("provincia_id");
CREATE UNIQUE INDEX "canton_provincia_id_nombre_key" ON "canton"("provincia_id", "nombre");
CREATE INDEX "distrito_canton_id_idx" ON "distrito"("canton_id");
CREATE UNIQUE INDEX "distrito_canton_id_nombre_key" ON "distrito"("canton_id", "nombre");
CREATE UNIQUE INDEX "distrito_pais_id_codigo_dta_key" ON "distrito"("pais_id", "codigo_dta");
CREATE INDEX "distrito_pais_id_idx" ON "distrito"("pais_id");

ALTER TABLE "provincia" ADD CONSTRAINT "provincia_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "canton" ADD CONSTRAINT "canton_provincia_id_pais_id_fkey"
  FOREIGN KEY ("provincia_id", "pais_id") REFERENCES "provincia"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "distrito" ADD CONSTRAINT "distrito_canton_id_pais_id_fkey"
  FOREIGN KEY ("canton_id", "pais_id") REFERENCES "canton"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "provincia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "canton" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "distrito" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "provincia_del_pais" ON "provincia" FOR SELECT TO servi_app
  USING (pais_id = (SELECT o.pais_id FROM organizacion o WHERE o.id = NULLIF(current_setting('app.organizacion_id', true), '')));
CREATE POLICY "canton_del_pais" ON "canton" FOR SELECT TO servi_app
  USING (pais_id = (SELECT o.pais_id FROM organizacion o WHERE o.id = NULLIF(current_setting('app.organizacion_id', true), '')));
CREATE POLICY "distrito_del_pais" ON "distrito" FOR SELECT TO servi_app
  USING (pais_id = (SELECT o.pais_id FROM organizacion o WHERE o.id = NULLIF(current_setting('app.organizacion_id', true), '')));
REVOKE ALL ON "provincia", "canton", "distrito" FROM servi_app;
GRANT SELECT ON "provincia", "canton", "distrito" TO servi_app;

-- ── 3. Las 3 FK de las órdenes nuevas, desde la ruta del nodo ────────────────────────────────────
-- Corre con los triggers de SLT-48 aún puestos: el de país mira los mismos nodos y el del nodo lo
-- deja como está (su lugar es el mismo nodo).
UPDATE "orden" o
   SET provincia_id = CASE n.profundidad WHEN 3 THEN p.padre_id ELSE n.padre_id END,
       canton_id = CASE n.profundidad WHEN 3 THEN n.padre_id ELSE n.id END,
       distrito_id = CASE n.profundidad WHEN 3 THEN n.id END
  FROM nodo_geografico n
  LEFT JOIN nodo_geografico p ON p.id = n.padre_id
 WHERE n.id = o.nodo_geografico_id
   AND o.provincia_id IS NULL
   AND o.canton_id IS NULL
   AND o.distrito_id IS NULL;

-- ── 4. NOT NULL, FK, funciones y triggers de antes ───────────────────────────────────────────────
ALTER TABLE "orden" ALTER COLUMN "provincia_id" SET NOT NULL;
ALTER TABLE "orden" ALTER COLUMN "canton_id" SET NOT NULL;
ALTER TABLE "orden" ADD CONSTRAINT "orden_provincia_id_fkey"
  FOREIGN KEY ("provincia_id") REFERENCES "provincia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orden" ADD CONSTRAINT "orden_canton_id_fkey"
  FOREIGN KEY ("canton_id") REFERENCES "canton"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orden" ADD CONSTRAINT "orden_distrito_id_fkey"
  FOREIGN KEY ("distrito_id") REFERENCES "distrito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "zona_distrito" ADD CONSTRAINT "zona_distrito_distrito_id_fkey"
  FOREIGN KEY ("distrito_id") REFERENCES "distrito"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "distrito_zona_especial" ADD CONSTRAINT "distrito_zona_especial_distrito_id_fkey"
  FOREIGN KEY ("distrito_id") REFERENCES "distrito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Funciones de antes, tal cual las dejaba 20261110130100.
CREATE OR REPLACE FUNCTION orden_nodo_geografico()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lugar text := COALESCE(NEW.distrito_id, NEW.canton_id);
  v_actual text := NEW.nodo_geografico_id;
BEGIN
  IF v_actual IS NULL OR v_actual = v_lugar
     OR (TG_OP = 'UPDATE'
         AND NEW.nodo_geografico_id IS NOT DISTINCT FROM OLD.nodo_geografico_id
         AND v_lugar IS DISTINCT FROM COALESCE(OLD.distrito_id, OLD.canton_id)) THEN
    NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
    RETURN NEW;
  END IF;
  FOR i IN 1 .. 10 LOOP
    SELECT n.padre_id INTO v_actual FROM nodo_geografico n WHERE n.id = v_actual;
    EXIT WHEN v_actual IS NULL;
    IF v_actual = v_lugar THEN
      RETURN NEW;
    END IF;
  END LOOP;
  NEW.nodo_geografico_id := COALESCE(NEW.distrito_id, NEW.canton_id);
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION geografia_del_pais_de_la_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF NEW.provincia_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM provincia p WHERE p.id = NEW.provincia_id AND p.pais_id <> v_pais_empresa) THEN
      v_columna := 'provincia_id';
    ELSIF NEW.canton_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM canton c WHERE c.id = NEW.canton_id AND c.pais_id <> v_pais_empresa) THEN
      v_columna := 'canton_id';
    ELSIF NEW.distrito_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM distrito d WHERE d.id = NEW.distrito_id AND d.pais_id <> v_pais_empresa) THEN
      v_columna := 'distrito_id';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM distrito d WHERE d.id = NEW.distrito_id AND d.pais_id <> v_pais_empresa) THEN
    v_columna := 'distrito_id';
  END IF;

  IF v_columna IS NOT NULL THEN
    RAISE EXCEPTION 'geografía de otro país: %.% no es del país % de la empresa', TG_TABLE_NAME, v_columna, v_pais_empresa
      USING ERRCODE = 'SL021';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION geografia_pais_del_padre()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
END $function$
;

CREATE OR REPLACE FUNCTION geo_sincronizar_provincia()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_1'),
          NULL, 1, NEW.nombre, '', NEW.codigo_dta, NEW.activo)
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION geo_sincronizar_canton()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_2'),
          NEW.provincia_id, 2, NEW.nombre, '', NEW.codigo_dta, NEW.activo)
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION geo_sincronizar_distrito()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM nodo_geografico WHERE id = OLD.id;
    RETURN NULL;
  END IF;

  INSERT INTO nodo_geografico AS n
      (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo)
  VALUES (NEW.id, NEW.pais_id,
          (SELECT t.id FROM tipo_nivel_geografico t WHERE t.pais_id = NEW.pais_id AND t.clave = 'nivel_3'),
          NEW.canton_id, 3, NEW.nombre, '', NEW.codigo_dta, NEW.activo)
  ON CONFLICT (id) DO UPDATE
    SET pais_id = EXCLUDED.pais_id, tipo_id = EXCLUDED.tipo_id, padre_id = EXCLUDED.padre_id,
        profundidad = EXCLUDED.profundidad, nombre = EXCLUDED.nombre,
        codigo_oficial = EXCLUDED.codigo_oficial, activo = EXCLUDED.activo
    WHERE (n.pais_id, n.tipo_id, n.padre_id, n.profundidad, n.nombre, n.codigo_oficial, n.activo)
          IS DISTINCT FROM
          (EXCLUDED.pais_id, EXCLUDED.tipo_id, EXCLUDED.padre_id, EXCLUDED.profundidad, EXCLUDED.nombre,
           EXCLUDED.codigo_oficial, EXCLUDED.activo);
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION geo_copiar_nodo_a_geografia_vieja()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.profundidad = 1 THEN
      DELETE FROM provincia WHERE id = OLD.id;
    ELSIF OLD.profundidad = 2 THEN
      DELETE FROM canton WHERE id = OLD.id;
    ELSIF OLD.profundidad = 3 THEN
      DELETE FROM distrito WHERE id = OLD.id;
    END IF;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.profundidad <> OLD.profundidad
     AND least(NEW.profundidad, OLD.profundidad) <= 3 THEN
    RAISE EXCEPTION 'nodo_geografico %: no puede pasar de profundidad % a %: cambiaria de tabla en la geografia vieja',
      NEW.id, OLD.profundidad, NEW.profundidad
      USING ERRCODE = 'SLT46';
  END IF;

  IF NEW.profundidad = 1 THEN
    INSERT INTO provincia AS v (id, nombre, codigo_dta, activo, pais_id)
    VALUES (NEW.id, NEW.nombre, NEW.codigo_oficial, NEW.activo, NEW.pais_id)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.codigo_dta, EXCLUDED.activo);
  ELSIF NEW.profundidad = 2 THEN
    INSERT INTO canton AS v (id, nombre, provincia_id, codigo_dta, activo)
    VALUES (NEW.id, NEW.nombre, NEW.padre_id, NEW.codigo_oficial, NEW.activo)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, provincia_id = EXCLUDED.provincia_id,
          codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.provincia_id, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.provincia_id, EXCLUDED.codigo_dta, EXCLUDED.activo);
  ELSIF NEW.profundidad = 3 THEN
    INSERT INTO distrito AS v (id, nombre, canton_id, codigo_dta, activo)
    VALUES (NEW.id, NEW.nombre, NEW.padre_id, NEW.codigo_oficial, NEW.activo)
    ON CONFLICT (id) DO UPDATE
      SET nombre = EXCLUDED.nombre, canton_id = EXCLUDED.canton_id,
          codigo_dta = EXCLUDED.codigo_dta, activo = EXCLUDED.activo
      WHERE (v.nombre, v.canton_id, v.codigo_dta, v.activo)
            IS DISTINCT FROM (EXCLUDED.nombre, EXCLUDED.canton_id, EXCLUDED.codigo_dta, EXCLUDED.activo);
  END IF;
  RETURN NULL;
END $function$
;

DROP TRIGGER "orden_geografia_del_pais_de_la_empresa" ON "orden";
CREATE TRIGGER "orden_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF provincia_id, canton_id, distrito_id ON "orden"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
DROP TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa" ON "zona_distrito";
CREATE TRIGGER "zona_distrito_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF distrito_id ON "zona_distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();
DROP TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa" ON "distrito_zona_especial";
CREATE TRIGGER "distrito_zona_especial_geografia_del_pais_de_la_empresa"
  BEFORE INSERT OR UPDATE OF distrito_id ON "distrito_zona_especial"
  FOR EACH ROW EXECUTE FUNCTION geografia_del_pais_de_la_empresa();

CREATE TRIGGER "canton_pais_del_padre"
  BEFORE INSERT OR UPDATE OF provincia_id ON "canton"
  FOR EACH ROW EXECUTE FUNCTION geografia_pais_del_padre();
CREATE TRIGGER "distrito_pais_del_padre"
  BEFORE INSERT OR UPDATE OF canton_id ON "distrito"
  FOR EACH ROW EXECUTE FUNCTION geografia_pais_del_padre();

CREATE TRIGGER "provincia_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "provincia"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_provincia();
CREATE TRIGGER "canton_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "canton"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_canton();
CREATE TRIGGER "distrito_sincroniza_nodo_geografico"
  AFTER INSERT OR UPDATE OR DELETE ON "distrito"
  FOR EACH ROW EXECUTE FUNCTION geo_sincronizar_distrito();
CREATE TRIGGER "nodo_geografico_copia_a_geografia_vieja"
  AFTER INSERT OR UPDATE OF nombre, codigo_oficial, activo, padre_id, profundidad OR DELETE ON "nodo_geografico"
  FOR EACH ROW EXECUTE FUNCTION geo_copiar_nodo_a_geografia_vieja();

COMMIT;
