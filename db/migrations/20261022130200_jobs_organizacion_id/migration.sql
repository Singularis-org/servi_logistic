-- SL-17 M4 (design §3 M4, D16, R42): la empresa de cada job. `jobs` sigue siendo «diferida»
-- (SL-19), no de negocio: sin filtro de la extension, sin politica por empresa (la de M1,
-- `jobs_abierta`, sigue) y sin trigger de misma empresa.
--
--   · NULABLE: los jobs recurrentes (los re-agenda el drenador en plataforma) y las filas sembradas
--     por migraciones no tienen empresa; el drenador los corre en plataforma o empresa por empresa.
--   · `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`: el outbox encola dentro de
--     la transaccion de la empresa, que ya fijo `app.organizacion_id`. Asi la empresa se captura sin
--     tocar los ~20 sitios que encolan.
--   · ON DELETE CASCADE: el job de una empresa que se borra no tiene ya donde ejecutarse.
--   · El indice empieza por la empresa para el drenado por empresa que pueda venir (SL-19); hoy el
--     reclamo sigue siendo global.
--   · Sin backfill: la app esta vacia (D9, D10); las filas previas quedan sin empresa, que es lo
--     correcto para la siembra de `whatsapp_envio_mantenimiento` (recurrente).

BEGIN;

ALTER TABLE "jobs" ADD COLUMN "organizacion_id" TEXT DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "jobs_organizacion_id_estado_run_after_idx" ON "jobs"("organizacion_id", "estado", "run_after");

COMMIT;
