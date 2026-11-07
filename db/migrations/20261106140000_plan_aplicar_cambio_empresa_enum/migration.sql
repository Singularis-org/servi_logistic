-- SLT-86 (design §5.2; R17, R20) — el trabajo que aplica un cambio de empresa pendiente al llegar sus 00:00.
--
-- `plan_aplicar_cambio_empresa` es PUNTUAL y va CON empresa (`jobs.organizacion_id`): lo encola
-- `PlanesRepository` en la misma transacción que guarda el pendiente, con `run_after` = la fecha de
-- efecto y `dedupe_key` = `plan_cambio_empresa:<cambioId>`. Es de núcleo (`MODULO_POR_JOB`). El barrido
-- horario `plan_cambios_vencidos` recoge el que se pierda.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04). Nada aquí
-- escribe filas; el primer uso ocurre en runtime.
ALTER TYPE "job_tipo" ADD VALUE IF NOT EXISTS 'plan_aplicar_cambio_empresa';
