-- SLT-43 (design §2.2, §3; R4–R14) — el nodo geográfico.
--
-- En este orden: `geo_normalizar_nombre` (T2.1), las comprobaciones previas de R14, la tabla, sus
-- únicos e índices, las FK compuestas, el trigger de invariantes, la RLS y la copia de la geografía. Todo en una transacción: si R14 aborta, no queda nada, tampoco la función.
--
-- De PLATAFORMA, como `provincia`: sin `organizacion_id`; la empresa lee solo los nodos de su país y
-- no escribe ninguno. En SLT-43 la app tampoco escribe aquí como dueño: la llena esta migración y la
-- mantiene la sincronía desde la geografía vieja (20261029120300).
--
-- Solo aditiva (R19). A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

BEGIN;

-- R10. Mismos pasos y en el mismo orden que `normalizeName`: NFD → quitar marcas combinantes →
-- minúsculas → espacios colapsados y recortados.
--   · Sin `unaccent`: no está instalada y es STABLE (lo explica 20260731160000_orden_busqueda_trgm);
--     `normalize()` sí es IMMUTABLE (Postgres 13+, base UTF-8), y la función tiene que serlo porque la
--     usa el trigger de invariantes para un único.
--   · Las marcas son el bloque U+0300–U+036F, no todo `\p{Mn}` como en JS: el regex de Postgres no
--     tiene clases Unicode. Cubre todos los nombres de la geografía (lo comprueba
--     `geo-normalizar-nombre.test.ts` sobre la base entera).
--   · Los espacios son la lista exacta de `\s` de JS y no `[[:space:]]`, que en Postgres depende de la
--     configuración regional del servidor: así un espacio duro (U+00A0) colapsa igual en los dos.
CREATE FUNCTION geo_normalizar_nombre(p_nombre text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(
           regexp_replace(
             lower(regexp_replace(normalize(p_nombre, NFD), '[̀-ͯ]', '', 'g')),
             '[\t\n\u000b\f\r    -     　﻿]+',
             ' ',
             'g'),
           ' ')
$$;

-- ─── R14: comprobaciones previas ─────────────────────────────────────────────────────────────
-- Los únicos viejos comparan el nombre tal cual («San José» y «San Jose» conviven); los nuevos, el
-- normalizado. Si hoy hay choques, la copia fallaría a medias con un 23505 sin decir cuántos: se
-- cuentan antes y se aborta con las cifras, para que una persona los resuelva en la geografía vieja.
-- El código no se comprueba: el único viejo por país y nivel es el mismo que el nuevo por país y tipo.
DO $$
DECLARE
  v_provincias int;
  v_cantones int;
  v_distritos int;
BEGIN
  SELECT count(*) INTO v_provincias FROM (
    SELECT 1 FROM provincia GROUP BY pais_id, geo_normalizar_nombre(nombre) HAVING count(*) > 1) x;
  SELECT count(*) INTO v_cantones FROM (
    SELECT 1 FROM canton GROUP BY provincia_id, geo_normalizar_nombre(nombre) HAVING count(*) > 1) x;
  SELECT count(*) INTO v_distritos FROM (
    SELECT 1 FROM distrito GROUP BY canton_id, geo_normalizar_nombre(nombre) HAVING count(*) > 1) x;
  IF v_provincias + v_cantones + v_distritos > 0 THEN
    RAISE EXCEPTION 'SLT-43: nombres que chocan al normalizar: % grupos de provincias del mismo pais, % de cantones de la misma provincia, % de distritos del mismo canton',
      v_provincias, v_cantones, v_distritos
      USING ERRCODE = 'SLT43';
  END IF;
END $$;

-- ─── tabla ───────────────────────────────────────────────────────────────────────────────────
-- El árbol es solo `padre_id` y `profundidad`: los descendientes de un nodo se leen con una CTE
-- recursiva sobre `padre_id` o con el catálogo del país en memoria (decisión 2026-10-29).
-- `nombre_normalizado` no tiene DEFAULT: lo pone siempre el trigger de invariantes, y el NOT NULL se
-- comprueba después de él.
CREATE TABLE "nodo_geografico" (
    "id" TEXT NOT NULL,
    "pais_id" TEXT NOT NULL,
    "tipo_id" TEXT NOT NULL,
    "padre_id" TEXT,
    "profundidad" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombre_normalizado" TEXT NOT NULL,
    "codigo_oficial" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodo_geografico_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "nodo_geografico_profundidad_check" CHECK ("profundidad" >= 1),
    -- R7: ningún nodo cuelga de sí mismo. El trigger de invariantes no lo ve: en un UPDATE lee la
    -- versión vieja de la propia fila como padre, y en un INSERT la FK autorreferente se cumple con
    -- la propia fila. Prisma no expresa CHECK: vive solo aquí.
    CONSTRAINT "nodo_geografico_padre_id_check" CHECK ("padre_id" IS DISTINCT FROM "id")
);

-- Destino de la FK compuesta de los hijos (R5).
CREATE UNIQUE INDEX "nodo_geografico_id_pais_id_key" ON "nodo_geografico"("id", "pais_id");
-- R9: sin hermanos con el mismo nombre normalizado.
CREATE UNIQUE INDEX "nodo_geografico_padre_id_nombre_normalizado_key" ON "nodo_geografico"("padre_id", "nombre_normalizado");
-- R9: las raíces no tienen padre y el único de arriba no las compara (NULL no compite); este parcial
-- sí. Prisma no lo expresa: vive solo aquí, como el único parcial de `orden` (294).
CREATE UNIQUE INDEX "nodo_geografico_raiz_pais_id_nombre_normalizado_key" ON "nodo_geografico"("pais_id", "nombre_normalizado")
  WHERE "padre_id" IS NULL;
-- R9: el código es único por país y tipo (decisión 2026-10-29), como el único por país y nivel de
-- SL-20: una provincia «1» y un cantón «1» de un país con código libre siguen conviviendo.
CREATE UNIQUE INDEX "nodo_geografico_pais_id_tipo_id_codigo_oficial_key" ON "nodo_geografico"("pais_id", "tipo_id", "codigo_oficial");
CREATE INDEX "nodo_geografico_padre_id_idx" ON "nodo_geografico"("padre_id");
CREATE INDEX "nodo_geografico_tipo_id_idx" ON "nodo_geografico"("tipo_id");
-- Lo usa la política RLS.
CREATE INDEX "nodo_geografico_pais_id_idx" ON "nodo_geografico"("pais_id");

-- R5 y R6: el país del padre y el del tipo los garantizan FK compuestas, no el trigger: son
-- declarativas y no tienen carrera entre transacciones (design §8.3). Con `padre_id` NULL la del padre
-- no se comprueba (MATCH SIMPLE). Todo RESTRICT: un país, un tipo o un padre con nodos no se borran.
ALTER TABLE "nodo_geografico" ADD CONSTRAINT "nodo_geografico_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "nodo_geografico" ADD CONSTRAINT "nodo_geografico_tipo_id_pais_id_fkey"
  FOREIGN KEY ("tipo_id", "pais_id") REFERENCES "tipo_nivel_geografico"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "nodo_geografico" ADD CONSTRAINT "nodo_geografico_padre_id_pais_id_fkey"
  FOREIGN KEY ("padre_id", "pais_id") REFERENCES "nodo_geografico"("id", "pais_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── R7, R10: invariantes de cada fila ───────────────────────────────────────────────────────
-- Pisa `nombre_normalizado` con lo que traiga la fila: se deriva, no se elige.
-- Sin ciclos (R7): el invariante es «todo nodo tiene la profundidad de su padre más 1». El paso 2 lo
-- comprueba en la fila que se escribe, y para eso el padre tiene que existir YA: un padre que no se
-- encuentra se rechaza aquí (SLT43) y no se deja a la FK. La FK se comprueba al final de la sentencia,
-- así que un INSERT de varias filas con el hijo antes que su padre (o dos filas que se cuelgan una de
-- otra) la pasaría sin que nadie comparara profundidades. Ningún camino de la app escribe así: la copia
-- de abajo va por niveles y la sincronía, fila a fila tras una escritura vieja cuyo padre ya tiene nodo.
-- Colgarse de sí mismo lo para el CHECK `nodo_geografico_padre_id_check` (en un INSERT llega antes
-- este paso: el padre, que es la propia fila, aún no existe).
-- El paso 3 lo comprueba en sus hijos: un nodo con hijos no cambia de
-- profundidad, así que ningún hijo se queda con una que ya no es la de su padre más 1. Con el
-- invariante en todas las filas la profundidad crece estrictamente al bajar por `padre_id`, y un ciclo
-- exigiría un nodo más profundo que sí mismo. Sin el paso 3, `SET padre_id = <un nieto>, profundidad =
-- <la del nieto + 1>` pasaría el paso 2 y dejaría un ciclo. Mover un nodo con hijos a otro padre del
-- mismo nivel sí entra (es lo único que hace la sincronía).
-- El `FOR SHARE` del paso 2 cierra la carrera entre «crear un hijo» y «cambiar la profundidad de su
-- padre» en dos transacciones: la segunda espera a la primera y su EXISTS (snapshot nuevo en READ
-- COMMITTED) ya ve al hijo.
-- SECURITY DEFINER con `search_path` fijo (precedente `verificar_misma_empresa`, 20261022130300): el
-- paso 2 y el paso 3 leen la tabla entera, no lo que la RLS deje ver a quien escribe. Así un padre
-- que existe nunca pasa por «no encontrado» (ni un hijo por inexistente) aunque mañana escriba aquí un
-- rol sujeto a la RLS del país; hoy escriben el dueño y la sincronía, que ya la saltan.
CREATE FUNCTION nodo_geografico_invariantes() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profundidad int;
BEGIN
  -- 1. R10.
  NEW.nombre_normalizado := geo_normalizar_nombre(NEW.nombre);

  -- 2. La profundidad de la fila respecto de su padre.
  IF NEW.padre_id IS NULL THEN
    IF NEW.profundidad <> 1 THEN
      RAISE EXCEPTION 'nodo_geografico %: una raiz tiene profundidad 1, no %', NEW.id, NEW.profundidad
        USING ERRCODE = 'SLT43';
    END IF;
  ELSE
    SELECT n.profundidad INTO v_profundidad
      FROM nodo_geografico n WHERE n.id = NEW.padre_id
       FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'nodo_geografico %: su padre % no existe (todavia)', NEW.id, NEW.padre_id
        USING ERRCODE = 'SLT43';
    END IF;
    IF NEW.profundidad <> v_profundidad + 1 THEN
      RAISE EXCEPTION 'nodo_geografico %: con un padre de profundidad % le toca %, no %',
        NEW.id, v_profundidad, v_profundidad + 1, NEW.profundidad
        USING ERRCODE = 'SLT43';
    END IF;
  END IF;

  -- 3. Un nodo con hijos no cambia de profundidad.
  IF TG_OP = 'UPDATE' AND NEW.profundidad IS DISTINCT FROM OLD.profundidad
     AND EXISTS (SELECT 1 FROM nodo_geografico h WHERE h.padre_id = NEW.id) THEN
    RAISE EXCEPTION 'nodo_geografico %: tiene hijos y no puede pasar de profundidad % a %',
      NEW.id, OLD.profundidad, NEW.profundidad
      USING ERRCODE = 'SLT43';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER "nodo_geografico_invariantes"
  BEFORE INSERT OR UPDATE OF "padre_id", "profundidad", "nombre", "pais_id" ON "nodo_geografico"
  FOR EACH ROW EXECUTE FUNCTION nodo_geografico_invariantes();

-- ─── R12: RLS ────────────────────────────────────────────────────────────────────────────────
-- La empresa lee solo los nodos de su país y no escribe ninguno. Mismo patrón que
-- `provincia_del_pais` (20261026130200). La tabla nace con CRUD para `servi_app` (ALTER DEFAULT
-- PRIVILEGES de 20261022130000_organizacion_y_rol_app): de ahí el REVOKE.
ALTER TABLE "nodo_geografico" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "nodo_geografico_del_pais" ON "nodo_geografico" FOR SELECT TO servi_app
  USING ("pais_id" = (SELECT o."pais_id" FROM "organizacion" o
                      WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')));
REVOKE INSERT, UPDATE, DELETE ON "nodo_geografico" FROM servi_app;

-- ─── R13: la copia de la geografía ───────────────────────────────────────────────────────────
-- Mismos ids, de arriba abajo para que cada padre exista antes que sus hijos. Pasa por el trigger de
-- invariantes, que pone el nombre normalizado. El tipo es el `nivel_N` del país de la fila
-- (los creó 20261029120100 para todos los países). Las tablas viejas no tienen fecha: `created_at` es
-- la de esta migración.
INSERT INTO "nodo_geografico" ("id", "pais_id", "tipo_id", "padre_id", "profundidad", "nombre", "codigo_oficial", "activo")
SELECT p."id", p."pais_id", t."id", NULL, 1, p."nombre", p."codigo_dta", p."activo"
  FROM "provincia" p
  JOIN "tipo_nivel_geografico" t ON t."pais_id" = p."pais_id" AND t."clave" = 'nivel_1';

INSERT INTO "nodo_geografico" ("id", "pais_id", "tipo_id", "padre_id", "profundidad", "nombre", "codigo_oficial", "activo")
SELECT c."id", c."pais_id", t."id", c."provincia_id", 2, c."nombre", c."codigo_dta", c."activo"
  FROM "canton" c
  JOIN "tipo_nivel_geografico" t ON t."pais_id" = c."pais_id" AND t."clave" = 'nivel_2';

INSERT INTO "nodo_geografico" ("id", "pais_id", "tipo_id", "padre_id", "profundidad", "nombre", "codigo_oficial", "activo")
SELECT d."id", d."pais_id", t."id", d."canton_id", 3, d."nombre", d."codigo_dta", d."activo"
  FROM "distrito" d
  JOIN "tipo_nivel_geografico" t ON t."pais_id" = d."pais_id" AND t."clave" = 'nivel_3';

COMMIT;
