-- SL-24 (design §16.6, enmienda del 2026-10-28) — los valores de enum del cambio programado.
--
-- `plan_rastro_accion` gana las cuatro acciones del rastro de un pendiente (R43) y `job_tipo` los
-- cuatro trabajos de §16.3 y §16.4: aplicar un cambio, el recordatorio, el aviso por correo y el
-- barrido recurrente de los vencidos. Los cuatro son del núcleo (`MODULO_POR_JOB`).
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
-- Nada aquí escribe filas ni toca las funciones o los triggers de 20261028130200; el primer uso ocurre
-- en runtime.

ALTER TYPE "plan_rastro_accion" ADD VALUE IF NOT EXISTS 'cambio_programado';
ALTER TYPE "plan_rastro_accion" ADD VALUE IF NOT EXISTS 'cambio_reemplazado';
ALTER TYPE "plan_rastro_accion" ADD VALUE IF NOT EXISTS 'cambio_cancelado';
ALTER TYPE "plan_rastro_accion" ADD VALUE IF NOT EXISTS 'cambio_aplicado';

ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_aplicar_cambio';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_recordatorio_cambio';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_aviso_correo';
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_cambios_vencidos';
