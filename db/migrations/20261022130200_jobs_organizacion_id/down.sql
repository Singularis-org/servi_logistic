-- DOWN (SL-17 M4) — revierte `migration.sql`. Quitar la columna olvida la empresa de los jobs
-- pendientes: tras el down, el drenador los correria en plataforma.

BEGIN;

DROP INDEX IF EXISTS "jobs_organizacion_id_estado_run_after_idx";
ALTER TABLE "jobs" DROP CONSTRAINT IF EXISTS "jobs_organizacion_id_fkey";
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "organizacion_id";

COMMIT;
