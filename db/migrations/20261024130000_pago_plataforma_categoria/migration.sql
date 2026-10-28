-- SL-45 (1 de 2) — la categoría del libro de la caja del PAGO DE LA EMPRESA A LA PLATAFORMA (design §2, §8).
--
--   wallet_movimiento_categoria  + egreso_pago_plataforma (PROPIO, EFECTIVO: sale de la caja y baja la ganancia)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la transacción que lo añade (55P04) y Prisma corre
-- cada `migration.sql` en su propia transacción. El CHECK tipo<->categoría que NOMBRA el valor va en la
-- migración 2 (`20261024130100_pago_plataforma_check`). Mismo corte que la 457.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.

ALTER TYPE "wallet_movimiento_categoria" ADD VALUE IF NOT EXISTS 'egreso_pago_plataforma';
