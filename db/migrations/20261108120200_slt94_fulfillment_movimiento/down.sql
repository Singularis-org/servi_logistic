-- DOWN (SLT-94, 3 de 4) — revierte `migration.sql` de esta carpeta (design §1 M3):
--   1. borra las filas de los DOS libros con origen `orden_fulfillment` (solo las suyas: los cobros y
--      devoluciones de fulfillment). Ninguna otra fila se toca;
--   2. devuelve los dos CHECK tipo<->categoría a su definición anterior, tal cual
--      (`20260928120100_wallet_458_tablas` para la tienda, `20261031140100_slt73_ajuste_conciliacion`
--      para la caja);
--   3. suelta el CHECK de `tarifa_valor`;
--   4. suelta la tabla con su política y sus triggers, y sus dos tipos.
--
-- Va DESPUÉS del down de M4 (sin triggers no se escriben más cobros) y ANTES del de M1, que retira los
-- valores de enum: cuando aquel corre, ningún CHECK los nombra y ninguna fila los usa. En una
-- transacción: si algo falla, no queda nada a medias.

BEGIN;

DELETE FROM "wallet_tienda_movimiento" WHERE "origen_tipo"::text = 'orden_fulfillment';
DELETE FROM "wallet_movimiento" WHERE "origen_tipo"::text = 'orden_fulfillment';

ALTER TABLE "wallet_tienda_movimiento" DROP CONSTRAINT "wallet_tienda_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_tienda_movimiento" ADD CONSTRAINT "wallet_tienda_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'credito' AND "categoria" IN ('cod_recaudado','ajuste_credito','pago_por_cuenta_anulado','cobro_tienda_anulado',
     'abono_tienda',
     'flete_devolucion_anulado','iva_flete_devolucion_anulado'))
  OR
  ("tipo" = 'debito' AND "categoria" IN ('flete','flete_devolucion','comision_cod','iva_flete',
     'iva_flete_devolucion','iva_comision_cod','pago_tienda','ajuste_debito','cobro_manual','pago_por_cuenta',
     'abono_tienda_anulado'))
);

ALTER TABLE "wallet_movimiento" DROP CONSTRAINT "wallet_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_movimiento" ADD CONSTRAINT "wallet_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'ingreso' AND "categoria" IN ('ingreso_flete','ingreso_flete_devolucion','ingreso_comision_cod',
     'ingreso_iva_flete','ingreso_iva_flete_devolucion','ingreso_iva_comision_cod','ingreso_ajuste',
     'ingreso_cod_recaudado','ingreso_reverso_pago_tienda',
     'ingreso_reverso_pago_por_cuenta_tienda','ingreso_aporte_capital',
     'ingreso_cobro_tienda',
     'ingreso_abono_tienda',
     'ingreso_diferencia_satelite'))
  OR
  ("tipo" = 'egreso' AND "categoria" IN ('egreso_pago_tienda','egreso_pago_mensajero','egreso_gasto',
     'egreso_sueldo','egreso_ajuste','egreso_gasto_fijo','egreso_gasto_variable','egreso_indemnizacion',
     'egreso_pago_por_cuenta_tienda','egreso_reverso_aporte_capital',
     'egreso_reverso_cobro_tienda',
     'egreso_reverso_abono_tienda',
     'egreso_reverso_flete_devolucion','egreso_reverso_iva_flete_devolucion',
     'egreso_pago_plataforma',
     'egreso_diferencia_satelite'))
);

ALTER TABLE "tarifa_valor" DROP CONSTRAINT IF EXISTS "tarifa_valor_fulfillment_solo_tienda_monto";

DROP TRIGGER IF EXISTS "orden_fulfillment_movimiento_sin_cambio_de_empresa" ON "orden_fulfillment_movimiento";
DROP TRIGGER IF EXISTS "sme_orden_fulfillment_movimiento_tienda_id_da061cd4" ON "orden_fulfillment_movimiento";
DROP TRIGGER IF EXISTS "sme_orden_fulfillment_movimiento_tarifa_valo_ecf54710" ON "orden_fulfillment_movimiento";
DROP TRIGGER IF EXISTS "sme_orden_fulfillment_movimiento_orden_id_aac21f7e" ON "orden_fulfillment_movimiento";
DROP POLICY IF EXISTS "orden_fulfillment_movimiento_por_empresa" ON "orden_fulfillment_movimiento";
DROP TABLE IF EXISTS "orden_fulfillment_movimiento";

DROP TYPE IF EXISTS "orden_fulfillment_movimiento_causa";
DROP TYPE IF EXISTS "orden_fulfillment_movimiento_tipo";

COMMIT;
