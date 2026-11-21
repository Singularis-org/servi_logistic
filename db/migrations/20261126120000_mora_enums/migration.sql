-- SLT-121 (design §1.2, §8.1) — los SIETE valores de enum de la mora y el congelamiento:
--
--   `historial_accion_tipo` += 'empresa_congelada'               (R30: congelada, con sus facturas y el saldo vencido)
--                           += 'empresa_descongelada_por_pago'   (R19, R30: el saldo vencido llegó a 0)
--                           += 'empresa_descongelada_a_mano'     (R22, R30: el superadmin, con motivo y fecha hasta)
--                           += 'empresa_descongelada_por_gracia' (R5, R30: un cambio de gracia dejó la empresa al día)
--                           += 'factura_dias_gracia_cambiada'    (R3, R30: la gracia propia, de/a y quién)
--   `job_tipo`              += 'mora_diaria'                     (§4.1: RECURRENTE, sin empresa, 06:30 UTC)
--                           += 'mora_aviso_correo'               (§4.2: PUNTUAL, con empresa; los tres correos)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04) y Prisma
-- Migrate corre cada `migration.sql` dentro de una. Aquí solo se añaden; el primer uso es en runtime.
--
-- ADITIVA: ni tablas, ni columnas, ni datos. `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo.
--
-- Prefijo 20261126: después de la mayor migración de `dev` (20261123120100_zona_activa), sin chocar con
-- 20261124120000 (SLT-226, otra rama) y sin que `20261125` caiga en la regex `/125/` de `backfill-guards.test.ts`.
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_congelada';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_descongelada_por_pago';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_descongelada_a_mano';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'empresa_descongelada_por_gracia';
ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'factura_dias_gracia_cambiada';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'mora_diaria';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'mora_aviso_correo';
