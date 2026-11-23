-- SLT-255 (design §1.2) — los DOS valores de enum de la prórroga del pago:
--
--   `historial_accion_tipo` += 'empresa_prorroga_fijada'  (R3, R4, R15: prórroga dada, alargada o acortada)
--                           += 'empresa_prorroga_quitada' (R5, R15: prórroga quitada)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04) y Prisma
-- Migrate corre cada `migration.sql` dentro de una. Aquí solo se añaden; el primer uso es en runtime.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.
--
-- Prefijo 20261127: después de `20261126120100_mora_congelamiento` (SLT-121), la mayor de `dev` al abrir la ficha.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_prorroga_fijada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_prorroga_quitada';
