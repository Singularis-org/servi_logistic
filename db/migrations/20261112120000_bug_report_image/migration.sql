-- SLT-98 (design §2.1-§2.3; R13, R18, R19) — `bug_report_image`, las imágenes de un reporte de problema.
-- Una fila por imagen; el archivo vive en el bucket privado `bucketReporteBug()` (design §3).
--
-- De PLATAFORMA, como `bug_report` (20261110120000): la empresa no la lee ni la escribe. La escribe solo
-- `lib/repositories/BugReportRepository.ts`, en `comoPlataforma` y como dueño. No lleva `organization_id`:
-- la empresa se lee del `bug_report` padre. Sin `updated_at` ni `deleted_at` a propósito: la fila no se
-- edita ni se borra sola, muere con su reporte (como `bug_report_status_change`, SLT-97).
-- Identificadores en inglés, como `bug_report` (R19).
--
-- Los CHECK son la segunda red del borde (zod en `lib/types/reporte-bug.ts`):
--   - 5 = `IMAGENES_MAX` de `lib/config/reporte-bug.ts`; con el UNIQUE (bug_report_id, position), nunca
--     más de 5 imágenes por reporte.
--   - 5242880 = `IMAGEN_BYTES_MAX` de `lib/config/reporte-bug.ts` (P4). Si cambia allí, cambia aquí con
--     otra migración.
--   - los tipos son `TIPOS_IMAGEN` del mismo archivo.
--   - la ruta es `<usuario_id>/<imagen_id>.<ext>`, relativa a la carpeta de la empresa (design §3.1).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "bug_report_image" (
    "id"            TEXT NOT NULL,
    "bug_report_id" TEXT NOT NULL,
    "position"      SMALLINT NOT NULL,
    "storage_path"  VARCHAR(255) NOT NULL,
    "content_type"  VARCHAR(20) NOT NULL,
    "size_bytes"    INTEGER NOT NULL,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_report_image_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bug_report_image_position_rango" CHECK ("position" BETWEEN 1 AND 5),
    CONSTRAINT "bug_report_image_storage_path_forma" CHECK ("storage_path" ~ '^[^/]+/[^/]+\.(png|jpg|webp)$'),
    CONSTRAINT "bug_report_image_content_type_permitido" CHECK (
        "content_type" IN ('image/png', 'image/jpeg', 'image/webp')
    ),
    CONSTRAINT "bug_report_image_size_bytes_rango" CHECK ("size_bytes" BETWEEN 1 AND 5242880)
);

-- El orden de las imágenes de un reporte: también es el índice con que el detalle las lee en orden.
CREATE UNIQUE INDEX "bug_report_image_bug_report_id_position_key" ON "bug_report_image" ("bug_report_id", "position");
-- Un objeto del bucket es de una sola fila.
CREATE UNIQUE INDEX "bug_report_image_storage_path_key" ON "bug_report_image" ("storage_path");

-- CASCADE: la imagen muere con su reporte (borrado de las empresas demo, SL-43).
ALTER TABLE "bug_report_image" ADD CONSTRAINT "bug_report_image_bug_report_id_fkey"
    FOREIGN KEY ("bug_report_id") REFERENCES "bug_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Acceso (R18) ────────────────────────────────────────────────────────────────────────────────
-- La tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000): hace falta el
-- REVOKE ALL. La RLS sin ninguna política es la segunda red, como en `bug_report`.
ALTER TABLE "bug_report_image" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "bug_report_image" FROM servi_app;
