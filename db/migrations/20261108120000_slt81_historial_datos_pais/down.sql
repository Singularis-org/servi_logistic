-- SLT-81 — revierte 20261108120000_slt81_historial_datos_pais: quita de `historial_plataforma_accion`
-- los cinco valores de los datos del país y de `historial_plataforma_entidad` el `tipo_documento`.
--
-- ⚠️ PRECONDICIÓN: ninguna fila de `historial_plataforma` con esos valores. Si queda alguna, ABORTA con
-- `RAISE` (P0001) antes de tocar nada: es el rastro de lo que hizo el superadmin y no se borra en
-- silencio. Primero se decide qué hacer con esas filas.
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: cada tipo se recrea. La lista sale de `pg_enum` (la
-- VIGENTE, acotada a `public`) menos estos valores, y no de una lista fija, para no borrar en
-- silencio un valor que otra rama añada después (patrón de 20261026130500). Las únicas columnas de
-- los tipos son `historial_plataforma.accion` y `.entidad_tipo`, sin `DEFAULT`, índice ni `CHECK`
-- que los nombren.

BEGIN;

DO $$
DECLARE
  v_acciones text[] := ARRAY['pais_datos_cambiados', 'tipo_documento_creado', 'tipo_documento_editado',
                             'tipo_documento_activado', 'tipo_documento_desactivado'];
  v_entidades text[] := ARRAY['tipo_documento'];
  v_n bigint;
  v_lista text;
BEGIN
  SELECT count(*) INTO v_n FROM "historial_plataforma"
   WHERE "accion"::text = ANY (v_acciones) OR "entidad_tipo"::text = ANY (v_entidades);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SLT-81: % filas de historial_plataforma usan % o %; se aborta sin borrar nada',
      v_n, v_acciones, v_entidades;
  END IF;

  SELECT string_agg(quote_literal(e.enumlabel::text), ', ' ORDER BY e.enumsortorder) INTO v_lista
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'historial_plataforma_accion'
     AND NOT (e.enumlabel::text = ANY (v_acciones));

  ALTER TYPE "historial_plataforma_accion" RENAME TO "historial_plataforma_accion_old_slt81";
  EXECUTE format('CREATE TYPE public.historial_plataforma_accion AS ENUM (%s)', v_lista);
  ALTER TABLE "historial_plataforma" ALTER COLUMN "accion" TYPE "historial_plataforma_accion"
    USING ("accion"::text::"historial_plataforma_accion");
  DROP TYPE "historial_plataforma_accion_old_slt81";

  SELECT string_agg(quote_literal(e.enumlabel::text), ', ' ORDER BY e.enumsortorder) INTO v_lista
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'historial_plataforma_entidad'
     AND NOT (e.enumlabel::text = ANY (v_entidades));

  ALTER TYPE "historial_plataforma_entidad" RENAME TO "historial_plataforma_entidad_old_slt81";
  EXECUTE format('CREATE TYPE public.historial_plataforma_entidad AS ENUM (%s)', v_lista);
  ALTER TABLE "historial_plataforma" ALTER COLUMN "entidad_tipo" TYPE "historial_plataforma_entidad"
    USING ("entidad_tipo"::text::"historial_plataforma_entidad");
  DROP TYPE "historial_plataforma_entidad_old_slt81";
END
$$;

COMMIT;
