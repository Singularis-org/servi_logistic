-- SLT-94 (1 de 4, design §1 M1) — los valores de enum del COBRO DE FULFILLMENT POR PAQUETE y de la
-- marca «se recoge en tienda».
--
--   wallet_tienda_movimiento_categoria + fulfillment, iva_fulfillment                  (débitos: el cobro)
--                                      + fulfillment_anulado, iva_fulfillment_anulado  (créditos: la devolución)
--   wallet_movimiento_categoria        + ingreso_fulfillment, ingreso_iva_fulfillment  (espejo del cobro)
--                                      + egreso_reverso_fulfillment, egreso_reverso_iva_fulfillment
--   wallet_origen_tipo                 + orden_fulfillment  (origen_id = id de `orden_fulfillment_movimiento`)
--   historial_accion_tipo              + usuario_se_recoge_en_tienda_cambiado (R8)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la transacción que lo añade (55P04) y Prisma corre
-- cada `migration.sql` en su propia transacción. La tabla, los CHECK que nombran estos valores y los
-- triggers van en M3 y M4. Mismo corte que SLT-73.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'fulfillment';
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'iva_fulfillment';
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'fulfillment_anulado';
ALTER TYPE "wallet_tienda_movimiento_categoria" ADD VALUE IF NOT EXISTS 'iva_fulfillment_anulado';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'ingreso_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'ingreso_iva_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_reverso_fulfillment';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_reverso_iva_fulfillment';
ALTER TYPE "wallet_origen_tipo" ADD VALUE IF NOT EXISTS 'orden_fulfillment';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'usuario_se_recoge_en_tienda_cambiado';
