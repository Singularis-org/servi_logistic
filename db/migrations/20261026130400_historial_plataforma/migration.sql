-- SL-20 (design §2.6, §3; R33, R34, R35; D15) — qué hizo el superadmin sobre países y geografía.
--
-- De PLATAFORMA: sin `organizacion_id` y aparte de `historial_accion`, que es por empresa. El cambio de
-- un país o de un nodo no es de ninguna empresa, y meterlo en `historial_accion` obligaría a inventarle
-- una (D15).
--
-- Ninguna empresa lo ve ni lo escribe (R34), patrón `entorno_marca` (SL-43):
--   · la tabla nace con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000), así que
--     hace falta el REVOKE;
--   · la RLS sin ninguna política es la segunda red.
-- Lo escribe solo el superadmin, como dueño, por `appendAccionPlataforma`
-- (`lib/repositories/registrar-accion-plataforma.ts`), dentro de la transacción del cambio (R33).
--
-- `entidad_id` sin FK, como `historial_accion.entidad_id`: la fila tiene que sobrevivir a su sujeto.
-- `actor_usuario_id` RESTRICT: la autoría es evidencia y no se pierde al dar de baja al usuario.
-- Inmutable: sin `updated_at`.

BEGIN;

CREATE TYPE "historial_plataforma_accion" AS ENUM (
  'pais_creado',
  'division_cargada',
  'nodo_geografico_creado',
  'nodo_geografico_renombrado',
  'nodo_geografico_desactivado',
  'nodo_geografico_activado'
);

CREATE TYPE "historial_plataforma_entidad" AS ENUM ('pais', 'provincia', 'canton', 'distrito');

CREATE TABLE "historial_plataforma" (
    "id" TEXT NOT NULL,
    "accion" "historial_plataforma_accion" NOT NULL,
    "entidad_tipo" "historial_plataforma_entidad" NOT NULL,
    "entidad_id" TEXT NOT NULL,
    "entidad_etiqueta" VARCHAR(120) NOT NULL,
    "pais_id" TEXT NOT NULL,
    "actor_usuario_id" TEXT,
    "actor_nombre" VARCHAR(120),
    "valor_anterior" VARCHAR(80),
    "valor_nuevo" VARCHAR(80),
    "detalle" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_plataforma_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "historial_plataforma_created_at_id_idx" ON "historial_plataforma"("created_at" DESC, "id");
CREATE INDEX "historial_plataforma_pais_id_created_at_idx" ON "historial_plataforma"("pais_id", "created_at" DESC);

ALTER TABLE "historial_plataforma" ADD CONSTRAINT "historial_plataforma_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "historial_plataforma" ADD CONSTRAINT "historial_plataforma_actor_usuario_id_fkey"
  FOREIGN KEY ("actor_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "historial_plataforma" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "historial_plataforma" FROM servi_app;

COMMIT;
