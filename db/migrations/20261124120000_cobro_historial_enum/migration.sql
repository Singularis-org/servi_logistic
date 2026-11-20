-- SLT-226 (design §1.3; R25) — los dos valores del historial de plataforma para las transiciones del cobro en línea:
--   historial_plataforma_accion  + cobro_intento_transicion
--   historial_plataforma_entidad + cobro_intento
--
-- VA SOLA, antes de 20261124120100_cobro_intento: Postgres prohíbe USAR un valor de enum en la misma transacción
-- que lo añade (55P04), y las funciones de esa migración escriben filas con estos valores. Mismo patrón que
-- `20261121140000_plan_nivel_job_enum`.
--
-- ADITIVA: ni tablas, ni columnas, ni datos (R28). `IF NOT EXISTS`: reaplicarla no falla.
-- Escrita a mano: `db:migrate:create` falla con P3006 en este repo. Prefijo 20261124120000: después de
-- 20261123120100_zona_activa, la mayor de `dev` al empezar (T0.1).
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'cobro_intento_transicion';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'cobro_intento';
