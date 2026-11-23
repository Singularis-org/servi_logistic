-- DOWN (SLT-139, 2 de 2) — revierte `migration.sql` de esta carpeta: suelta el CHECK de origen de
-- `pago_satelite` y deja el CHECK tipo<->categoría EXACTAMENTE como lo dejó SLT-68
-- (`20261030120100_incentivo_mensajero_checks/migration.sql`).
--
-- PRECONDICIÓN RUIDOSA (R337): con UNA fila `pago_satelite` aborta con RAISE y no toca nada. Es dinero:
-- bajar el CHECK con esas filas las dejaría huérfanas de su regla.
-- Va ANTES que el down de la migración 1 (`20261115120000_pago_satelite_enum`), que retira el valor.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "pago_mensajero_movimiento" WHERE "categoria"::text = 'pago_satelite') THEN
    RAISE EXCEPTION 'rollback SLT-139: hay filas pago_satelite en pago_mensajero_movimiento; se aborta sin tocar nada';
  END IF;
END
$$;

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_pago_satelite_origen_check";

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo'))
);

COMMIT;
