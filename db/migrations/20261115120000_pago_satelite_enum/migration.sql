-- SLT-139 (1 de 2) — el valor de enum «pagado por la satélite» (design §3.1, R337).
--
--   pago_mensajero_movimiento_categoria  + pago_satelite  (rama `pago`: la satélite le pagó P al mensajero
--                                                           de un cierre nuevo; se escribe al conciliar)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la transacción que lo añade (55P04). Los CHECK que lo
-- nombran van en la migración 2 (`20261115120100_pago_satelite_checks`). Mismo corte que SLT-68.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TYPE "pago_mensajero_movimiento_categoria" ADD VALUE IF NOT EXISTS 'pago_satelite';
