-- SL-20 — revierte 20261026130500_pais_disponible: borra `pais.disponible` y quita
-- `pais_disponibilidad_activada`/`_desactivada` de `historial_plataforma_accion`.
--
-- ⚠️ PRECONDICIÓN: ninguna fila de `historial_plataforma` con esos valores. Si queda alguna, ABORTA con
-- `RAISE` (P0001) antes de tocar nada: es el rastro de lo que hizo el superadmin y no se borra en
-- silencio (design §3). Primero se decide qué hacer con esas filas.
--
-- Postgres no tiene `ALTER TYPE … DROP VALUE`: el tipo se recrea. La lista sale de `pg_enum` (la
-- VIGENTE, acotada a `public`) menos estos dos valores, y no de una lista fija, para no borrar en
-- silencio un valor que otra rama añada después (patrón de 20261025120100). La única columna del
-- tipo es `historial_plataforma.accion`, sin `DEFAULT`, índice ni `CHECK` que lo nombren.
--
-- ORDEN: va ANTES del down de 20261026130400_historial_plataforma.

BEGIN;

DO $$
DECLARE
  v_quitar text[] := ARRAY['pais_disponibilidad_activada', 'pais_disponibilidad_desactivada'];
  v_n bigint;
  v_lista text;
BEGIN
  SELECT count(*) INTO v_n FROM "historial_plataforma" WHERE "accion"::text = ANY (v_quitar);
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SL-20: % filas de historial_plataforma usan %; se aborta sin borrar nada',
      v_n, v_quitar;
  END IF;

  SELECT string_agg(quote_literal(e.enumlabel::text), ', ' ORDER BY e.enumsortorder) INTO v_lista
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
   WHERE n.nspname = 'public' AND t.typname = 'historial_plataforma_accion'
     AND NOT (e.enumlabel::text = ANY (v_quitar));

  ALTER TYPE "historial_plataforma_accion" RENAME TO "historial_plataforma_accion_old_sl20";
  EXECUTE format('CREATE TYPE public.historial_plataforma_accion AS ENUM (%s)', v_lista);
  ALTER TABLE "historial_plataforma" ALTER COLUMN "accion" TYPE "historial_plataforma_accion"
    USING ("accion"::text::"historial_plataforma_accion");
  DROP TYPE "historial_plataforma_accion_old_sl20";
END
$$;

ALTER TABLE "pais" DROP COLUMN "disponible";

COMMIT;
