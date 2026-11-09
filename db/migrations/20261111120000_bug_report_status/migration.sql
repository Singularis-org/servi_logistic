-- SLT-97 (design §2.1-§2.5; R3, R16, R18, R21, R23) — el estado de un reporte de problema y su historial,
-- para el módulo del superadmin.
--
-- De PLATAFORMA, como `bug_report` (20261110120000): la empresa no lee ni escribe ninguna de las dos. Las
-- escribe solo `lib/repositories/BugReportRepository.ts`, en `comoPlataforma` y como dueño.
-- Identificadores en inglés por la decisión «Borrado e identificadores» y Q5 de SLT-87.
--
-- Las dos redes de la base (§2.3) lanzan SQLSTATE 'SL097' para cualquier rol, también para el dueño, como
-- `cobro_plataforma_traza_inmutable` (SL085):
--   - el estado solo avanza (R18);
--   - el historial no se cambia ni se borra, salvo en cascada con su reporte (R23).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

-- ─── 1. El enum (§2.1) ───────────────────────────────────────────────────────────────────────────
CREATE TYPE "bug_report_status" AS ENUM ('new', 'in_review', 'resolved', 'dismissed');

-- ─── 2. La columna y su índice (§2.1; R16) ───────────────────────────────────────────────────────
-- El DEFAULT deja en «Nuevo» los reportes que ya existen y los que crea `BugReportRepository.crear`.
ALTER TABLE "bug_report" ADD COLUMN "status" "bug_report_status" NOT NULL DEFAULT 'new';

-- El filtro por defecto del listado («Pendientes») siempre filtra por estado.
CREATE INDEX "bug_report_status_created_at_id_idx" ON "bug_report" ("status", "created_at" DESC, "id");

-- ─── 3. El historial (§2.2; R21) ─────────────────────────────────────────────────────────────────
-- Sin `updated_at` ni `deleted_at`, a propósito: la fila es inmutable (R23).
-- `actor_user_id` es opaco y sin FK, como en `plan_rastro` y `vehiculo_rastro`: la autoría sobrevive a la
-- cuenta.
CREATE TABLE "bug_report_status_change" (
    "id"            TEXT NOT NULL,
    "bug_report_id" TEXT NOT NULL,
    "from_status"   "bug_report_status" NOT NULL,
    "to_status"     "bug_report_status" NOT NULL,
    -- NULL = sin nota.
    "note"          TEXT,
    "actor_user_id" TEXT NOT NULL,
    -- 120, como `actor_nombre` de los rastros.
    "actor_name"    VARCHAR(120) NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_report_status_change_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bug_report_status_change_cambia" CHECK ("from_status" <> "to_status"),
    -- 500 = `NOTA_MAX` de `lib/types/reporte-bug.ts`. Si cambia allí, cambia aquí con otra migración.
    CONSTRAINT "bug_report_status_change_note_largo" CHECK ("note" IS NULL OR char_length(btrim("note")) BETWEEN 1 AND 500)
);

-- El orden del historial en el detalle (R22).
CREATE INDEX "bug_report_status_change_bug_report_id_created_at_id_idx"
    ON "bug_report_status_change" ("bug_report_id", "created_at" DESC, "id");

-- CASCADE: el historial muere con su reporte (borrado de las empresas demo, SL-43).
ALTER TABLE "bug_report_status_change" ADD CONSTRAINT "bug_report_status_change_bug_report_id_fkey"
    FOREIGN KEY ("bug_report_id") REFERENCES "bug_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 4. Las dos redes (§2.3; R18, R23) ───────────────────────────────────────────────────────────
-- El estado solo avanza: new → in_review | resolved | dismissed; in_review → resolved | dismissed.
-- Un UPDATE que deja el mismo estado no es un cambio y pasa (el servicio nunca lo manda).
CREATE FUNCTION bug_report_status_solo_adelante() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
       (OLD."status" = 'new'       AND NEW."status" IN ('in_review', 'resolved', 'dismissed'))
    OR (OLD."status" = 'in_review' AND NEW."status" IN ('resolved', 'dismissed'))
  ) THEN
    RAISE EXCEPTION 'el estado de un reporte solo avanza (bug_report %: % -> %)', OLD."id", OLD."status", NEW."status"
      USING ERRCODE = 'SL097';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "bug_report_status_solo_adelante" BEFORE UPDATE OF "status" ON "bug_report"
  FOR EACH ROW EXECUTE FUNCTION bug_report_status_solo_adelante();

CREATE FUNCTION bug_report_status_change_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- El borrado en cascada desde `bug_report` llega por el trigger de la FK (profundidad > 1) y pasa:
  -- es el borrado de las empresas demo. Un DELETE directo (profundidad 1) no.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'el historial de un reporte no se cambia ni se borra (bug_report_status_change %)', OLD."id"
    USING ERRCODE = 'SL097';
END $$;

CREATE TRIGGER "bug_report_status_change_inmutable" BEFORE UPDATE OR DELETE ON "bug_report_status_change"
  FOR EACH ROW EXECUTE FUNCTION bug_report_status_change_inmutable();

-- ─── 5. Acceso (§2.4; R3) ────────────────────────────────────────────────────────────────────────
-- La tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000): hace falta el
-- REVOKE ALL. La RLS sin ninguna política es la segunda red. La columna nueva de `bug_report` hereda el
-- REVOKE ALL de SLT-87. Las funciones de trigger no se pueden llamar fuera de un trigger: no hace falta
-- revocar EXECUTE.
ALTER TABLE "bug_report_status_change" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report_status_change" FROM servi_app;
