-- SLT-97 — revierte 20261111120000_bug_report_status (design §2.5), en orden inverso.
-- PÉRDIDA DE DATO DECLARADA: el estado de los reportes y su historial de cambios se pierden. Los CHECK, el
-- índice, la FK, el trigger de inmutabilidad, la RLS y los privilegios del historial se van con la tabla.
-- No toca la tabla `bug_report` de SLT-87 más allá de la columna `status`.

DROP TABLE IF EXISTS "bug_report_status_change";
DROP FUNCTION IF EXISTS bug_report_status_change_inmutable();

DROP TRIGGER IF EXISTS "bug_report_status_solo_adelante" ON "bug_report";
DROP FUNCTION IF EXISTS bug_report_status_solo_adelante();

DROP INDEX IF EXISTS "bug_report_status_created_at_id_idx";
ALTER TABLE "bug_report" DROP COLUMN IF EXISTS "status";

DROP TYPE IF EXISTS "bug_report_status";
