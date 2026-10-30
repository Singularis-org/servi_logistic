-- SL-24 (design §16.1, enmienda del 2026-10-28) — el cambio programado de un plan (R37–R40).
--
-- Una tabla de PLATAFORMA, sin `organizacion_id`, como el resto del catálogo (20261028130000): la
-- escribe solo el superadmin, como dueño (`comoPlataforma`), y la leen él y el trabajo que aplica.
-- Una empresa no la lee ni la escribe (R8):
--   · nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000), así que hace
--     falta el REVOKE ALL. La RLS sin ninguna política es la segunda red.
--
-- `id` identifica ESTA programación: los trabajos lo llevan en el payload y comparan con él (§16.3).
-- Reemplazar es borrar la fila y crear otra con `id` nuevo; cancelar es borrarla.
-- `plan_id` UNIQUE hace cumplir «un solo cambio pendiente por plan» (R39). CASCADE con el plan: un
-- pendiente no tiene sentido sin él (el producto no borra planes, R6).
-- `version` es la edición completa ya validada por zod; los CHECK de `plan` la vuelven a validar al
-- aplicarla. Ningún trigger lee esta tabla, y esta migración no toca los de 20261028130200.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "plan_cambio_programado" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL,
    "version" JSONB NOT NULL,
    "avisos_al_programar" JSONB NOT NULL,
    "actor_usuario_id" TEXT NOT NULL,
    "actor_nombre" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_cambio_programado_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_cambio_programado_plan_id_key" ON "plan_cambio_programado" ("plan_id");

ALTER TABLE "plan_cambio_programado" ADD CONSTRAINT "plan_cambio_programado_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Acceso (§16.1, R8) ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "plan_cambio_programado" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan_cambio_programado" FROM servi_app;
