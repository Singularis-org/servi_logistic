-- SL-42 (design §2.2, P2; R21, R22) — el rastro de plataforma de las acciones del superadmin sobre el
-- catálogo de vehículos. Calcado de `plan_rastro` (SL-24, 20261028130000).
--
-- De PLATAFORMA, sin `organizacion_id`. `vehiculo_id` y `actor_usuario_id` son opacos y SIN FK: el
-- rastro sobrevive a su sujeto. Solo se añade; lo escribe un único punto,
-- `lib/repositories/registrar-rastro-vehiculo.ts`, en la misma transacción que la acción.
--
-- Acceso (R22): la tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000),
-- así que hace falta el REVOKE ALL. La RLS sin ninguna política es la segunda red.
--
-- Anchuras: 40 = `VEHICULO_NOMBRE_MAX` (`lib/types/vehiculos.ts`); 120 = la del actor en `plan_rastro`.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TYPE "vehiculo_rastro_accion" AS ENUM
    ('vehiculo_creado', 'vehiculo_renombrado', 'vehiculo_activado', 'vehiculo_desactivado');

CREATE TABLE "vehiculo_rastro" (
    "id" TEXT NOT NULL,
    "vehiculo_id" TEXT NOT NULL,
    "vehiculo_nombre" VARCHAR(40) NOT NULL,
    "accion" "vehiculo_rastro_accion" NOT NULL,
    -- Solo en el renombre.
    "valor_anterior" VARCHAR(40),
    "valor_nuevo" VARCHAR(40),
    "actor_usuario_id" TEXT NOT NULL,
    "actor_nombre" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehiculo_rastro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "vehiculo_rastro_vehiculo_id_created_at_idx" ON "vehiculo_rastro" ("vehiculo_id", "created_at");

-- ─── Acceso (R22) ────────────────────────────────────────────────────────────────────────────────
ALTER TABLE "vehiculo_rastro" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "vehiculo_rastro" FROM servi_app;
