-- SLT-227 (design §1, §1.1; R5, R6) — las credenciales de los proveedores de cobro, de la plataforma.
--
-- Una fila por (proveedor, país, entorno). Es de plataforma y no lleva `organizacion_id`: las credenciales son
-- de la cuenta de la plataforma en el proveedor, no de una empresa. Ninguna empresa la lee ni la escribe (R6):
-- RLS encendida sin políticas y `REVOKE ALL` a `servi_app`, como `cobro_webhook_evento`.
--
-- `id` no tiene default: el servicio lo genera antes de cifrar porque va en los datos asociados (design §8.1,
-- R7). `actualizado_por` es opaco y sin FK, como `plan_rastro.actor_usuario_id`.

BEGIN;

CREATE TABLE "cobro_proveedor_credencial" (
    "id" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "pais_id" TEXT NOT NULL,
    "entorno" TEXT NOT NULL,
    "secretos" JSONB NOT NULL,
    "actualizado_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cobro_proveedor_credencial_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cobro_proveedor_credencial_proveedor" CHECK ("proveedor" IN ('rebill', 'wompi', 'global66')),
    CONSTRAINT "cobro_proveedor_credencial_entorno" CHECK ("entorno" IN ('sandbox', 'produccion')),
    -- R5: la expresión de `integracion_secretos_cifrados` (20261025120000), literal, más el objeto no vacío. Corre
    -- para todos los roles, el dueño incluido: ni un script con la conexión directa deja un secreto en claro.
    CONSTRAINT "cobro_proveedor_credencial_secretos_cifrados"
      CHECK (
        jsonb_typeof("secretos") = 'object'
        AND "secretos" <> '{}'::jsonb
        AND NOT jsonb_path_exists(
          "secretos",
          '$.* ? (@.type() != "string" || !(@ like_regex "^v[1-9][0-9]*:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:(([A-Za-z0-9+/]{4})+([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$"))'
        )
      )
);

-- R5: una fila por trío. Tabla de plataforma: no pasa por `unicos-por-empresa`. Va como índice y no como
-- restricción dentro del CREATE TABLE porque el detector de esa guardia solo sigue esta forma (T0.3).
CREATE UNIQUE INDEX "cobro_proveedor_credencial_trio_key"
  ON "cobro_proveedor_credencial" ("proveedor", "pais_id", "entorno");

ALTER TABLE "cobro_proveedor_credencial" ADD CONSTRAINT "cobro_proveedor_credencial_pais_id_fkey"
  FOREIGN KEY ("pais_id") REFERENCES "pais"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- R6: ninguna empresa la lee ni la escribe (el patrón de `historial_plataforma` y `cobro_webhook_evento`).
ALTER TABLE "cobro_proveedor_credencial" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "cobro_proveedor_credencial" FROM servi_app;

COMMIT;
