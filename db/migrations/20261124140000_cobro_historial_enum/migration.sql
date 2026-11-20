-- SLT-226 (design §1.3; R25) — los dos valores del historial de plataforma para las transiciones del cobro en línea:
--   historial_plataforma_accion  + cobro_intento_transicion
--   historial_plataforma_entidad + cobro_intento
--
-- VA SOLA, antes de 20261124140100_cobro_intento: Postgres prohíbe USAR un valor de enum en la misma transacción
-- que lo añade (55P04), y las funciones de esa migración escriben filas con estos valores. Mismo patrón que
-- `20261121140000_plan_nivel_job_enum`.
--
-- ADITIVA: ni tablas, ni columnas, ni datos (R28). `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo. Prefijo 20261124140000: después de
-- 20261124130000_orden_historial_origen_retorno_rechazo_cierre (SLT-247), la mayor de `dev` al sincronizar
-- (renombrada desde 20261124120000 al mergear SL-21 y desde 20261124130000 al mergear SLT-247).
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'cobro_intento_transicion';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'cobro_intento';
