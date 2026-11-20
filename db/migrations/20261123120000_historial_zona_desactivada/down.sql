-- DOWN (SLT-225) — quita los dos valores que añadió `migration.sql`:
--   historial_accion_tipo − zona_desactivada, zona_reactivada
--
-- BORRA LAS FILAS QUE LOS USAN, como el down de `20261107130000_historial_tope_intentos` (design §1.4):
-- ese rastro solo describe acciones que, tras la bajada, el codigo ya no conoce (su cliente Prisma no
-- sabria leer el valor). Las filas de otra accion no se tocan.
--
-- NO RECREA EL TIPO CON UNA LISTA FIJA: lee la lista VIGENTE de `pg_enum` y quita SOLO estos valores.
-- La función es la de `20261119120000_historial_accion_ordenes_retiradas_a_central/down.sql`, copiada
-- y renombrada `_slt225`, con el prefijo de sus mensajes cambiado a «rollback SLT-225».
--
-- ORDEN: va DESPUES del down de 20261123120100 (los downs van en orden inverso).

BEGIN;

DELETE FROM "historial_accion"
 WHERE "accion"::text IN ('zona_desactivada', 'zona_reactivada');
-- ─── LA FUNCION DE REVERSION, DINAMICA (P12 de la ficha 459) ────────────────────────────────
-- Quita de un enum SOLO los valores que se le pasan, leyendo la lista vigente de `pg_enum`: el
-- catalogo es distinto en `prod` y en `dev` (SF-001), y una lista fija escrita en una rama borraria
-- en silencio los valores de la otra (memoria «el down.sql borra los valores posteriores»).
--   1. PRECONDICION RUIDOSA: si alguna fila de cualquier columna de ese tipo usa un valor a quitar,
--      RAISE y no se toca nada. Esto es dinero: el reverso no es un borrado silencioso.
--   2. Guarda y suelta lo que NOMBRA el tipo por texto —los CHECK y los indices con literales
--      `'x'::tipo`— y los DEFAULT de las columnas. Los indices que solo usan la columna los
--      reconstruye solo el `ALTER COLUMN … TYPE`.
--   3. `RENAME` → `CREATE TYPE` con la lista vigente menos los valores → `ALTER COLUMN … USING` en
--      TODAS las columnas del tipo → `DROP` del viejo.
--   4. Restaura DEFAULT, indices y CHECK con su definicion exacta.
-- Si ninguno de los valores esta ya en el tipo, no hace nada (idempotente).
CREATE OR REPLACE FUNCTION pg_temp.quitar_valores_de_enum_slt225(p_esquema text, p_tipo text, p_quitar text[])
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_tipo_oid oid;
  v_actuales text[];
  v_quedan text[];
  v_lista text;
  v_n bigint;
  v_patron text;
  v_tablas text[] := '{}';
  v_columnas text[] := '{}';
  v_checks text[] := '{}';
  v_indices text[] := '{}';
  v_defaults text[] := '{}';
  v_triggers text[] := '{}';
  v_sql text;
  r record;
  i int;
BEGIN
  SELECT t.oid INTO v_tipo_oid
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE t.typname = p_tipo AND n.nspname = p_esquema;
  IF v_tipo_oid IS NULL THEN
    RAISE EXCEPTION 'rollback SLT-225: no existe el tipo %.%', p_esquema, p_tipo;
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_actuales
    FROM pg_enum e WHERE e.enumtypid = v_tipo_oid;
  IF NOT (v_actuales && p_quitar) THEN
    RAISE NOTICE 'rollback SLT-225: %.% no tiene ninguno de %; nada que hacer', p_esquema, p_tipo, p_quitar;
    RETURN;
  END IF;
  SELECT array_agg(x ORDER BY o) INTO v_quedan
    FROM unnest(v_actuales) WITH ORDINALITY AS u(x, o)
   WHERE NOT (x = ANY (p_quitar));

  -- Las columnas que usan el tipo, recogidas ANTES de tocar nada.
  FOR r IN
    SELECT c.relname::text AS tabla, a.attname::text AS col
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = p_esquema AND c.relkind = 'r' AND a.attnum > 0
       AND NOT a.attisdropped AND a.atttypid = v_tipo_oid
     ORDER BY 1, 2
  LOOP
    v_tablas := v_tablas || r.tabla;
    v_columnas := v_columnas || r.col;
  END LOOP;

  -- 1) Precondicion ruidosa.
  FOR i IN 1 .. coalesce(array_length(v_tablas, 1), 0) LOOP
    EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I::text = ANY ($1)', p_esquema, v_tablas[i], v_columnas[i])
      INTO v_n USING p_quitar;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'rollback SLT-225: % filas de %.% usan %; se aborta sin borrar nada',
        v_n, v_tablas[i], v_columnas[i], p_quitar;
    END IF;
  END LOOP;

  -- 2) Lo que nombra el tipo por texto: `::tipo`, con o sin esquema delante.
  v_patron := '::("?[A-Za-z0-9_]+"?\.)?"?' || p_tipo || '"?([^A-Za-z0-9_]|$)';
  FOR r IN
    SELECT con.conname::text AS nombre, c.relname::text AS tabla, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = p_esquema AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ~ v_patron
  LOOP
    v_checks := v_checks || format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s', p_esquema, r.tabla, r.nombre, r.def);
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', p_esquema, r.tabla, r.nombre);
  END LOOP;
  FOR r IN
    SELECT ix.indexname::text AS nombre, ix.indexdef AS def
      FROM pg_indexes ix
     WHERE ix.schemaname = p_esquema AND ix.indexdef ~ v_patron
  LOOP
    v_indices := v_indices || r.def;
    EXECUTE format('DROP INDEX %I.%I', p_esquema, r.nombre);
  END LOOP;
  -- 2b) SLT-73: los TRIGGERS que dependen de una columna del tipo (un `WHEN (NEW.col = 'x')` o un
  --     `UPDATE OF col`). Postgres no deja cambiar el tipo de esa columna con ellos vivos (0A000).
  --     Desde SL-45 hay uno: `wallet_movimiento_tope_pago_plataforma`, con `WHEN (NEW.categoria = …)`.
  --     Se guardan con su definicion exacta (`pg_get_triggerdef`) y se recrean al final.
  FOR r IN
    SELECT DISTINCT t.tgname::text AS nombre, c.relname::text AS tabla, pg_get_triggerdef(t.oid) AS def
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_depend d ON d.classid = 'pg_trigger'::regclass AND d.objid = t.oid
                      AND d.refclassid = 'pg_class'::regclass AND d.refobjid = t.tgrelid AND d.refobjsubid > 0
      JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = d.refobjsubid
     WHERE n.nspname = p_esquema AND NOT t.tgisinternal AND a.atttypid = v_tipo_oid
  LOOP
    v_triggers := v_triggers || r.def;
    EXECUTE format('DROP TRIGGER %I ON %I.%I', r.nombre, p_esquema, r.tabla);
  END LOOP;
  FOR i IN 1 .. coalesce(array_length(v_tablas, 1), 0) LOOP
    SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_sql
      FROM pg_attrdef d
      JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
      JOIN pg_class c ON c.oid = d.adrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = p_esquema AND c.relname = v_tablas[i] AND a.attname = v_columnas[i];
    IF v_sql IS NOT NULL THEN
      v_defaults := v_defaults || format('ALTER TABLE %I.%I ALTER COLUMN %I SET DEFAULT %s', p_esquema, v_tablas[i], v_columnas[i], v_sql);
      EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP DEFAULT', p_esquema, v_tablas[i], v_columnas[i]);
    END IF;
  END LOOP;

  -- 3) El tipo, recreado con la lista VIGENTE menos los valores de esta ficha.
  SELECT string_agg(quote_literal(x), ', ' ORDER BY o) INTO v_lista
    FROM unnest(v_quedan) WITH ORDINALITY AS u(x, o);
  EXECUTE format('ALTER TYPE %I.%I RENAME TO %I', p_esquema, p_tipo, p_tipo || '_old_slt225');
  EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', p_esquema, p_tipo, v_lista);
  FOR i IN 1 .. coalesce(array_length(v_tablas, 1), 0) LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING (%I::text::%I.%I)',
      p_esquema, v_tablas[i], v_columnas[i], p_esquema, p_tipo, v_columnas[i], p_esquema, p_tipo);
  END LOOP;
  EXECUTE format('DROP TYPE %I.%I', p_esquema, p_tipo || '_old_slt225');

  -- 4) Todo vuelve, con su definicion exacta.
  FOREACH v_sql IN ARRAY v_defaults LOOP EXECUTE v_sql; END LOOP;
  FOREACH v_sql IN ARRAY v_indices LOOP EXECUTE v_sql; END LOOP;
  FOREACH v_sql IN ARRAY v_checks LOOP EXECUTE v_sql; END LOOP;
  FOREACH v_sql IN ARRAY v_triggers LOOP EXECUTE v_sql; END LOOP;
END
$fn$;


SELECT pg_temp.quitar_valores_de_enum_slt225('public', 'historial_accion_tipo', ARRAY[
  'zona_desactivada',
  'zona_reactivada'
]);

COMMIT;
