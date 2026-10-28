-- SL-23 (design §4.2, R20) — el estado `descartado` de un job.
--
-- El drenador marca así el job de un módulo apagado para la empresa del job: no se ejecuta, no cuenta
-- como fallo y no se reintenta. El motivo va en `last_error` (`modulo_inactivo:<clave>`). No vuelve a
-- reclamarse porque el reclamo solo toma `pending`: el índice parcial de 20260717120000 no cambia.
--
-- VA SOLA: Postgres prohíbe USAR un valor de enum en la misma transacción que lo añade (55P04).
ALTER TYPE "job_estado" ADD VALUE IF NOT EXISTS 'descartado';
