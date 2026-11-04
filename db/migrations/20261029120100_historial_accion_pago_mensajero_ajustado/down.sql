-- DOWN de SLT-56 (design §1.3) — quita `cierre_dia_pago_mensajero_ajustado` que añadió `migration.sql`.
--
-- BORRA LAS FILAS QUE LO USAN, como los downs de SL-23 y SL-24. Ese rastro describe ajustes cuyo
-- detalle (anterior, nuevo, motivo) vive en `gestion_pago_mensajero_ajuste`, que el down de
-- 20261029120000 va a soltar justo después: sin la feature no queda a qué apunte. Las filas de
-- cualquier otra acción no se tocan.
--
-- Postgres no tiene `ALTER TYPE ... DROP VALUE`: hay que recrear el tipo. La función es la de
-- `20261028130100_historial_accion_planes/down.sql` TAL CUAL, renombrada `_slt56`: lee la lista
-- VIGENTE de `pg_enum` y quita SOLO este valor, así que no borra los que otra rama añada (los de
-- planes incluidos). Una lista fija los perdería en silencio.
--
-- ORDEN: va ANTES del down de 20261029120000.

BEGIN;

DELETE FROM "historial_accion"
 WHERE "accion"::text = 'cierre_dia_pago_mensajero_ajustado';

-- ─── LA FUNCION DE REVERSION, DINAMICA (copiada de SL-36, que la copió de la ficha 458-B) ─────────
--   1. PRECONDICION RUIDOSA: si alguna fila de cualquier columna de ese tipo usa un valor a quitar,
--      RAISE y no se toca nada.
--   2. Guarda y suelta lo que NOMBRA el tipo por texto —los CHECK y los indices con literales
--      `'x'::tipo`— y los DEFAULT de las columnas.
--   3. `RENAME` → `CREATE TYPE` con la lista vigente menos los valores → `ALTER COLUMN … USING` en
--      TODAS las columnas del tipo → `DROP` del viejo.
--   4. Restaura DEFAULT, indices y CHECK con su definicion exacta.
-- Si ninguno de los valores esta ya en el tipo, no hace nada (idempotente).
CREATE OR REPLACE FUNCTION pg_temp.quitar_valores_de_enum_slt56(p_esquema text, p_tipo text, p_quitar text[])
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
  v_sql text;
  r record;
  i int;
BEGIN
  SELECT t.oid INTO v_tipo_oid
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE t.typname = p_tipo AND n.nspname = p_esquema;
  IF v_tipo_oid IS NULL THEN
    RAISE EXCEPTION 'rollback SLT-56: no existe el tipo %.%', p_esquema, p_tipo;
  END IF;

  SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) INTO v_actuales
    FROM pg_enum e WHERE e.enumtypid = v_tipo_oid;
  IF NOT (v_actuales && p_quitar) THEN
    RAISE NOTICE 'rollback SLT-56: %.% no tiene ninguno de %; nada que hacer', p_esquema, p_tipo, p_quitar;
    RETURN;
  END IF;
  SELECT array_agg(x ORDER BY o) INTO v_quedan
    FROM unnest(v_actuales) WITH ORDINALITY AS u(x, o)
   WHERE NOT (x = ANY (p_quitar));

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
      RAISE EXCEPTION 'rollback SLT-56: % filas de %.% usan %; se aborta sin borrar nada',
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

  -- 3) El tipo, recreado con la lista VIGENTE menos los valores de SLT-56.
  SELECT string_agg(quote_literal(x), ', ' ORDER BY o) INTO v_lista
    FROM unnest(v_quedan) WITH ORDINALITY AS u(x, o);
  EXECUTE format('ALTER TYPE %I.%I RENAME TO %I', p_esquema, p_tipo, p_tipo || '_old_slt56');
  EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)', p_esquema, p_tipo, v_lista);
  FOR i IN 1 .. coalesce(array_length(v_tablas, 1), 0) LOOP
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING (%I::text::%I.%I)',
      p_esquema, v_tablas[i], v_columnas[i], p_esquema, p_tipo, v_columnas[i], p_esquema, p_tipo);
  END LOOP;
  EXECUTE format('DROP TYPE %I.%I', p_esquema, p_tipo || '_old_slt56');

  -- 4) Todo vuelve, con su definicion exacta.
  FOREACH v_sql IN ARRAY v_defaults LOOP EXECUTE v_sql; END LOOP;
  FOREACH v_sql IN ARRAY v_indices LOOP EXECUTE v_sql; END LOOP;
  FOREACH v_sql IN ARRAY v_checks LOOP EXECUTE v_sql; END LOOP;
END
$fn$;

SELECT pg_temp.quitar_valores_de_enum_slt56('public', 'historial_accion_tipo', ARRAY['cierre_dia_pago_mensajero_ajustado']);

COMMIT;
