-- SLT-73 (1 de 2) — los valores de enum de la DIFERENCIA DE LA SATELITE al conciliar (design §1.1).
--
--   wallet_movimiento_categoria  + egreso_diferencia_satelite   (se recibio MENOS que lo esperado)
--   wallet_movimiento_categoria  + ingreso_diferencia_satelite  (se recibio MAS que lo esperado)
--   wallet_origen_tipo           + conciliacion_bodega_ajuste   (origen_id = id de la fila del evento)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la transacción que lo añade (55P04) y Prisma corre
-- cada `migration.sql` en su propia transacción. La tabla del evento y el CHECK tipo<->categoría que
-- NOMBRAN estos valores van en la migración 2 (`20261031140100_slt73_ajuste_conciliacion`). Mismo corte
-- que SL-45 y SLT-68.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_diferencia_satelite';
ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'ingreso_diferencia_satelite';
ALTER TYPE "wallet_origen_tipo" ADD VALUE IF NOT EXISTS 'conciliacion_bodega_ajuste';
