-- DOWN (SLT-73, 2 de 2) — revierte `migration.sql` de esta carpeta (design §1.2):
--   1. borra las filas de caja con origen `conciliacion_bodega_ajuste` (las diferencias de la satélite);
--   2. devuelve el CHECK tipo<->categoría a la definición de `20261024130100_pago_plataforma_check`,
--      tal cual;
--   3. suelta la tabla del evento con su política y sus triggers.
--
-- Va ANTES que el down de la migración 1, que retira los valores del enum: cuando aquel corre, ningún
-- CHECK los nombra y ninguna fila los usa. Dentro de una transacción: si algo falla, no queda nada a
-- medias.

BEGIN;

DELETE FROM "wallet_movimiento" WHERE "origen_tipo"::text = 'conciliacion_bodega_ajuste';

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

DROP TRIGGER IF EXISTS "conciliacion_bodega_ajuste_sin_cambio_de_empresa" ON "conciliacion_bodega_ajuste";
DROP TRIGGER IF EXISTS "sme_conciliacion_bodega_ajuste_creado_por_6e78ee5b" ON "conciliacion_bodega_ajuste";
DROP TRIGGER IF EXISTS "sme_conciliacion_bodega_ajuste_cierre_bodega_a4fd2497" ON "conciliacion_bodega_ajuste";
DROP POLICY IF EXISTS "conciliacion_bodega_ajuste_por_empresa" ON "conciliacion_bodega_ajuste";
DROP TABLE IF EXISTS "conciliacion_bodega_ajuste";

COMMIT;
