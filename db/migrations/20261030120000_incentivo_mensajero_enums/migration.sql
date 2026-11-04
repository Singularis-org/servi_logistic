-- SLT-68 (1 de 2) — los valores de enum del INCENTIVO MANUAL A UN MENSAJERO (design §2.1, §3.1).
--
--   pago_mensajero_movimiento_categoria  + incentivo          (rama `devengo`: sube la cuenta por pagar)
--   pago_mensajero_movimiento_categoria  + reverso_incentivo  (rama `pago`: su contraasiento)
--   wallet_origen_tipo                   + incentivo_mensajero (origen del egreso de caja, de su reverso
--                                                               y del `reverso_incentivo`; origen_id = id
--                                                               del devengo `incentivo`)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la transacción que lo añade (55P04). El CHECK y el
-- único parcial que los NOMBRAN van en la migración 2 (`20261030120100_incentivo_mensajero_checks`).
-- Mismo corte que SL-45.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'incentivo';
ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'reverso_incentivo';
ALTER TYPE "wallet_origen_tipo" ADD VALUE IF NOT EXISTS 'incentivo_mensajero';
