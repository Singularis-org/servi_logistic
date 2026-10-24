-- DOWN (SL-45, 2 de 2) — devuelve el CHECK tipo<->categoría del libro de la caja a la definición de
-- `20260928120100_wallet_458_tablas`, tal cual.
--
-- Va ANTES que el down de la migración 1: así, cuando aquel quita el valor del enum, ningún CHECK lo nombra.
-- Si hay un pago registrado, el `ADD CONSTRAINT` de aquí falla (23514) y, con el `BEGIN`, no queda nada a
-- medias. El down de la migración 1 lo vuelve a frenar con su propio RAISE (R27).

BEGIN;

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
     'egreso_reverso_flete_devolucion','egreso_reverso_iva_flete_devolucion'))
);

COMMIT;
