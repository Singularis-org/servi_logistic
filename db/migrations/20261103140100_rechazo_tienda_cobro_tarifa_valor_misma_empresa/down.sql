-- DOWN (SL-17 M3) — revierte `migration.sql`: DROP TRIGGER de todos y despues DROP FUNCTION.
-- GENERADO con `tsx scripts/generar-misma-empresa.ts` --faltantes.

BEGIN;

DROP TRIGGER "sme_rechazo_tienda_cobro_tarifa_valor_id_61a03463" ON "rechazo_tienda_cobro";


COMMIT;
