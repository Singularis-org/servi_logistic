-- SLT-139 (2 de 2) — los CHECK de `pago_satelite` (design §3.2, R330, R337).
--
-- 1) CHECK tipo<->categoría: su definición vigente (SLT-68, `20261030120100_incentivo_mensajero_checks`,
--    medida con `pg_get_constraintdef` en T0.1) + `pago_satelite` en la rama `pago`.
-- 2) `pago_satelite` solo cuelga de un cierre del día con `origen_id` no nulo.
--
-- `pago_mensajero_movimiento_origen_uq` NO cambia: `pago_satelite` cae dentro de su predicado, así que la
-- base admite uno por (cierre, mensajero) y conciliar dos veces no duplica (R318).
--
-- ADITIVA: ningún INSERT, UPDATE ni DELETE. `ADD CONSTRAINT … CHECK` valida las filas existentes (ninguna
-- es `pago_satelite`), no las reescribe.

ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check";
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'devengo' AND "categoria" IN ('pago_devengado','ajuste_devengo','premio_ranking','incentivo'))
  OR
  ("tipo" = 'pago' AND "categoria" IN ('pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo','pago_satelite'))
);

ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_pago_satelite_origen_check"
CHECK ("categoria" <> 'pago_satelite' OR ("origen_tipo" = 'cierre_dia' AND "origen_id" IS NOT NULL));
