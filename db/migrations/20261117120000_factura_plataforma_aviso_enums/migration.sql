-- SLT-136 (design §1, §7; R31) — el aviso de factura de la plataforma emitida, en TRES enums:
--
--   `notificacion_evento`       += 'factura_plataforma_emitida'  (la campanita y el push al maestro, R22-R24)
--   `notificacion_entidad_tipo` += 'factura_plataforma'          (la entidad es la factura: un aviso por factura)
--   `job_tipo`                  += 'factura_plataforma_aviso'    (el trabajo que avisa, encolado al cerrar, R21/R30)
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04) y Prisma
-- Migrate corre cada `migration.sql` dentro de una. Aquí SOLO se añaden los valores; el primer uso ocurre en
-- runtime (`FacturaPlataformaRepository.cerrar` y el manejador del trabajo).
--
-- ADITIVA: no crea tablas ni columnas, no crea índices, no toca la RLS. SIN BACKFILL: las facturas ya cerradas
-- antes de esta migración no avisan. `IF NOT EXISTS`: reaplicarla no falla.
--
-- Prefijo 20261117: va después de la mayor migración de `dev` al empezar (20261116120000_pago_plataforma_confirmacion).
ALTER TYPE "notificacion_evento" ADD VALUE IF NOT EXISTS 'factura_plataforma_emitida';
ALTER TYPE "notificacion_entidad_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'factura_plataforma_aviso';
