-- SLT-68 (2 de 2) — las reglas de la base para el INCENTIVO MANUAL A UN MENSAJERO (design §3.2, R12).
--
-- 1) El CHECK tipo<->categoría, desde su definición vigente (la de la 293,
--    `20260827120000_premio_ranking_devengo/migration.sql`) con un valor más en cada rama. Falla
--    cerrado: sin este paso NINGÚN incentivo se podría escribir (23514).
-- 2) CHECK nuevo `pago_mensajero_movimiento_incentivo_origen_check`: el `incentivo` cuelga de un cierre
--    y el `reverso_incentivo` de un incentivo. Sin él, un incentivo escrito con otro origen no entraría
--    en lo pagable de su cierre (`sumarPremiosVivosPorCierre`): sería una deuda muda.
-- 3) `pago_mensajero_movimiento_origen_uq` con `'incentivo'` FUERA del predicado. Sin esto, el segundo
--    incentivo al mismo mensajero sobre el mismo cierre chocaría con el primero y volvería como «ya
--    registrado»: un fallo mudo sobre dinero (R9). El `reverso_incentivo` se queda DENTRO: su origen es
--    (incentivo_mensajero, id del incentivo), así que la base impone UNA anulación por incentivo (R15).
--    El feed del cierre (`pago_devengado`, `pago_efectivo`) sigue dentro, con su protección intacta.
--
-- ADITIVA: sin INSERT/UPDATE/DELETE ni backfill; hoy no existe ningún incentivo, así que ninguna fila
-- viola las reglas nuevas. Sin tabla nueva: no hay superficie RLS nueva.

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo'))
);

ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_incentivo_origen_check"
CHECK (
  ("categoria" <> 'incentivo'         OR ("origen_tipo" = 'cierre_dia'          AND "origen_id" IS NOT NULL))
  AND
  ("categoria" <> 'reverso_incentivo' OR ("origen_tipo" = 'incentivo_mensajero' AND "origen_id" IS NOT NULL))
);

DROP INDEX "pago_mensajero_movimiento_origen_uq";
CREATE UNIQUE INDEX "pago_mensajero_movimiento_origen_uq"
  ON "pago_mensajero_movimiento"("origen_tipo", "origen_id", "mensajero_id", "categoria")
  WHERE "origen_id" IS NOT NULL AND "categoria" NOT IN ('premio_ranking','ajuste_pago','incentivo');
