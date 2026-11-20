-- DOWN de SLT-121 (design §8.2) — revierte `migration.sql`, en orden inverso:
--   1. los triggers `<tabla>_bloqueo_por_mora`, recorriendo `pg_trigger` por la función que ejecutan;
--   2. las cinco funciones;
--   3. el índice, el CHECK y las tres columnas de `organizacion`.
--
-- Si hay empresas congeladas, quedan operativas: el estado de la mora se pierde con las columnas. Está aceptado,
-- porque es una reversión. Las filas de historial y los trabajos de la mora no se tocan aquí: los vigila el down de
-- 20261126120000_mora_enums, que va DESPUÉS de este y aborta si alguna los usa.
--
-- Idempotente: con todo ya quitado, no hace nada.

BEGIN;

DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname::text AS nombre, c.relname::text AS tabla
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_namespace pn ON pn.oid = p.pronamespace
     WHERE n.nspname = 'public' AND pn.nspname = 'public' AND p.proname = 'bloqueo_por_mora'
       AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.%I', r.nombre, r.tabla);
  END LOOP;
END
$do$;

DROP FUNCTION IF EXISTS bloqueo_por_mora();
DROP FUNCTION IF EXISTS organizacion_mora_descongelar_a_mano(text, date, timestamp);
DROP FUNCTION IF EXISTS organizacion_mora_descongelar_si_pagada(text, timestamp, integer);
DROP FUNCTION IF EXISTS organizacion_mora_congelar(text, timestamp, integer);
DROP FUNCTION IF EXISTS factura_plataforma_mora(text, timestamp, integer);

DROP INDEX IF EXISTS "organizacion_congelada_idx";
ALTER TABLE "organizacion" DROP CONSTRAINT IF EXISTS "organizacion_factura_dias_gracia_rango";
ALTER TABLE "organizacion"
  DROP COLUMN IF EXISTS "descongelada_hasta",
  DROP COLUMN IF EXISTS "congelada_at",
  DROP COLUMN IF EXISTS "factura_dias_gracia";

COMMIT;
