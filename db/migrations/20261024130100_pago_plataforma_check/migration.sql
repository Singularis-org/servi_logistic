-- SL-45 (2 de 2) — el CHECK tipo<->categoría del libro de la caja admite `egreso_pago_plataforma` en el lado
-- `egreso` (design §2, §8).
--
-- Parte de la definición VIGENTE, la de `20260928120100_wallet_458_tablas` (la última que lo reescribe,
-- medido en T0), y solo añade el valor nuevo al final del lado `egreso`. El lado `ingreso` no cambia: la
-- anulación de un pago es el `ingreso_ajuste` de siempre.
--
-- En su propio archivo porque el valor lo añade la migración 1 y Postgres no deja usarlo en la misma
-- transacción (55P04).

ALTER TABLE "wallet_movimiento" DROP CONSTRAINT "wallet_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_movimiento" ADD CONSTRAINT "wallet_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'ingreso' AND "categoria" IN ('ingreso_flete','ingreso_flete_devolucion','ingreso_comision_cod',
     'ingreso_iva_flete','ingreso_iva_flete_devolucion','ingreso_iva_comision_cod','ingreso_ajuste',
     'ingreso_cod_recaudado','ingreso_reverso_pago_tienda',
     'ingreso_reverso_pago_por_cuenta_tienda','ingreso_aporte_capital',
     'ingreso_cobro_tienda',
     'ingreso_abono_tienda'))
  OR
  ("tipo" = 'egreso' AND "categoria" IN ('egreso_pago_tienda','egreso_pago_mensajero','egreso_gasto',
     'egreso_sueldo','egreso_ajuste','egreso_gasto_fijo','egreso_gasto_variable','egreso_indemnizacion',
     'egreso_pago_por_cuenta_tienda','egreso_reverso_aporte_capital',
     'egreso_reverso_cobro_tienda',
     'egreso_reverso_abono_tienda',
     'egreso_reverso_flete_devolucion','egreso_reverso_iva_flete_devolucion',
     'egreso_pago_plataforma'))
);
