-- DOWN (SLT-68, 2 de 2) — revierte `migration.sql` de esta carpeta: suelta el CHECK de origen y deja el
-- CHECK tipo<->categoría y `pago_mensajero_movimiento_origen_uq` EXACTAMENTE como los dejó la 293
-- (`20260827120000_premio_ranking_devengo/migration.sql`, pasos 4 y 6).
--
-- PRECONDICIÓN (R21): sin filas `incentivo` ni `reverso_incentivo`. Con una, el CHECK de la 293 no la
-- admite y el `ADD CONSTRAINT` aborta con 23514 dentro de la transacción: no queda nada a medias.
-- Va ANTES que el down de la migración 1, que retira los valores del enum.

BEGIN;

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT IF EXISTS "pago_mensajero_movimiento_incentivo_origen_check";

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago'))
);

DROP INDEX "pago_mensajero_movimiento_origen_uq";
CREATE UNIQUE INDEX "pago_mensajero_movimiento_origen_uq"
  ON "pago_mensajero_movimiento"("origen_tipo", "origen_id", "mensajero_id", "categoria")
  WHERE "origen_id" IS NOT NULL AND "categoria" NOT IN ('premio_ranking','ajuste_pago');

COMMIT;
