-- SLT-87 (design §2.1-§2.4; R11, R12, R13, R14, R19) — `bug_report`, los reportes de problema que manda
-- un usuario de empresa desde el botón flotante del portal.
--
-- De PLATAFORMA, calcado de `vehiculo_rastro` (20261103120100): la empresa no la lee ni la escribe. La
-- escribe solo `lib/repositories/BugReportRepository.ts`, en `comoPlataforma` y como dueño.
-- `organization_id` es un atributo (quién reportó), no reparte la tabla: no hay política por empresa.
-- Identificadores en inglés por la decisión «Borrado e identificadores» y Q5 (2026-11-09).
--
-- Los CHECK son la segunda red del borde (zod en `lib/types/reporte-bug.ts`):
--   - 500 = `DESCRIPCION_MAX` de `lib/config/reporte-bug.ts` (Q3). Si cambia allí, cambia aquí con otra
--     migración.
--   - la página es solo la ruta (Q2): empieza por «/» y no lleva «?» ni «#».
--   - el rol nunca es de plataforma (R11).
--
-- Las FK son CASCADE para no bloquear el borrado de empresas demo (SL-43, `demo-qa.test.ts`).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "bug_report" (
    "id"               TEXT NOT NULL,
    "organization_id"  TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    -- 120, como `actor_nombre` de los rastros.
    "reporter_name"    VARCHAR(120) NOT NULL,
    "reporter_role"    "rol_value" NOT NULL,
    "description"      TEXT NOT NULL,
    "page_path"        VARCHAR(2048) NOT NULL,
    -- De la cabecera; el servicio lo recorta a 512.
    "user_agent"       VARCHAR(512) NOT NULL,
    "viewport_width"   INTEGER,
    "viewport_height"  INTEGER,
    "is_standalone"    BOOLEAN,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Borrado lógico (R19): nace NULL y en SLT-87 nada lo escribe.
    "deleted_at"       TIMESTAMP(3),

    CONSTRAINT "bug_report_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bug_report_reporter_role_no_plataforma" CHECK ("reporter_role" <> 'superadmin'),
    CONSTRAINT "bug_report_description_largo" CHECK (char_length(btrim("description")) BETWEEN 1 AND 500),
    CONSTRAINT "bug_report_page_path_solo_ruta" CHECK (
        left("page_path", 1) = '/' AND strpos("page_path", '?') = 0 AND strpos("page_path", '#') = 0
    ),
    CONSTRAINT "bug_report_viewport_width_rango" CHECK ("viewport_width" IS NULL OR "viewport_width" BETWEEN 1 AND 20000),
    CONSTRAINT "bug_report_viewport_height_rango" CHECK ("viewport_height" IS NULL OR "viewport_height" BETWEEN 1 AND 20000)
);

-- El listado y el filtro por empresa del superadmin (SLT-97): se crean ya para no migrar solo por ellos.
CREATE INDEX "bug_report_created_at_id_idx" ON "bug_report" ("created_at" DESC, "id");
CREATE INDEX "bug_report_organization_id_created_at_idx" ON "bug_report" ("organization_id", "created_at" DESC);

ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bug_report" ADD CONSTRAINT "bug_report_reporter_user_id_fkey"
    FOREIGN KEY ("reporter_user_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Acceso (R14) ────────────────────────────────────────────────────────────────────────────────
-- La tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000): hace falta el
-- REVOKE ALL. La RLS sin ninguna política es la segunda red.
ALTER TABLE "bug_report" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report" FROM servi_app;
