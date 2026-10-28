-- SL-24 (design §2) — el catálogo de planes (plataforma) y la asignación de un plan a cada empresa.
--
-- Cuatro tablas de PLATAFORMA, sin `organizacion_id`: `plan`, `plan_tope_rol`, `plan_modulo` y
-- `plan_rastro`. Las escribe solo el superadmin, como dueño (`comoPlataforma`); las leen él y los
-- triggers `SECURITY DEFINER` de 20261027130200. Una empresa no las lee ni las escribe (R8):
--   · nacen con CRUD para `servi_app` (ALTER DEFAULT PRIVILEGES de 20261022130000), así que hace
--     falta el REVOKE ALL. La RLS sin ninguna política es la segunda red. Precedente:
--     `cobro_plataforma_tarifa` (SL-40, 20261023130000).
--
-- La asignación son dos columnas de `organizacion` (design §2.4), como la excepción de cobro de SL-40:
-- `organizacion` ya es de solo lectura para `servi_app` y cada empresa ve solo su fila. No se rellena
-- nada: todas las empresas que existen quedan sin plan (R14).
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TYPE "plan_visibilidad" AS ENUM ('publico', 'custom');

CREATE TYPE "plan_rastro_accion" AS ENUM ('creado', 'editado', 'archivado');

-- ─── plan (§2.1) ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "plan" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "visibilidad" "plan_visibilidad" NOT NULL,
    "organizacion_exclusiva_id" TEXT,
    "tope_ordenes_ciclo" INTEGER,
    "tope_api_keys" INTEGER,
    "precio_negociable" BOOLEAN NOT NULL DEFAULT false,
    "precio_mensual" DECIMAL(12,2),
    "precio_anual" DECIMAL(12,2),
    "descuento_anual_pct" DECIMAL(5,2),
    "archivado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plan_nombre_check" CHECK (btrim("nombre") <> ''),
    -- Un custom nombra exactamente una empresa y un público ninguna (R2).
    CONSTRAINT "plan_custom_con_empresa" CHECK (("visibilidad" = 'custom') = ("organizacion_exclusiva_id" IS NOT NULL)),
    CONSTRAINT "plan_tope_ordenes_ciclo_check" CHECK ("tope_ordenes_ciclo" IS NULL OR "tope_ordenes_ciclo" >= 0),
    CONSTRAINT "plan_tope_api_keys_check" CHECK ("tope_api_keys" IS NULL OR "tope_api_keys" >= 0),
    CONSTRAINT "plan_precio_mensual_check" CHECK ("precio_mensual" IS NULL OR "precio_mensual" >= 0),
    CONSTRAINT "plan_precio_anual_check" CHECK ("precio_anual" IS NULL OR "precio_anual" >= 0),
    CONSTRAINT "plan_descuento_anual_pct_check" CHECK ("descuento_anual_pct" IS NULL OR ("descuento_anual_pct" > 0 AND "descuento_anual_pct" <= 100)),
    -- Las cinco formas del precio (R3): sin precio; negociable sin monto; mensual; mensual y anual
    -- fijo; mensual y porcentaje. Todo lo demás se rechaza aquí aunque el servicio ya lo valide.
    CONSTRAINT "plan_precio_forma" CHECK (
      NOT ("precio_negociable" AND ("precio_mensual" IS NOT NULL OR "precio_anual" IS NOT NULL OR "descuento_anual_pct" IS NOT NULL))
      AND NOT ("precio_anual" IS NOT NULL AND "descuento_anual_pct" IS NOT NULL)
      AND ("precio_mensual" IS NOT NULL OR ("precio_anual" IS NULL AND "descuento_anual_pct" IS NULL))
    )
);

-- CASCADE: un custom no tiene sentido sin su empresa, y las limpiezas de tests borran empresas. El
-- producto no borra empresas (design §2.1; precedente SL-23 §4.1).
ALTER TABLE "plan" ADD CONSTRAINT "plan_organizacion_exclusiva_id_fkey"
    FOREIGN KEY ("organizacion_exclusiva_id") REFERENCES "organizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── plan_tope_rol (§2.2) ────────────────────────────────────────────────────────────────────────
-- Sin fila = ese rol no tiene tope. `apiKey` y `superadmin` no llevan tope de usuarios (R25); las
-- keys tienen el suyo en `plan.tope_api_keys`. `adminTienda` se guarda como 'Admin Tienda' (`@map`).
CREATE TABLE "plan_tope_rol" (
    "plan_id" TEXT NOT NULL,
    "rol" "rol_value" NOT NULL,
    "maximo" INTEGER NOT NULL,

    CONSTRAINT "plan_tope_rol_pkey" PRIMARY KEY ("plan_id", "rol"),
    CONSTRAINT "plan_tope_rol_rol_check" CHECK ("rol" IN ('maestro', 'admin', 'mensajero', 'Admin Tienda', 'adminSatelite')),
    CONSTRAINT "plan_tope_rol_maximo_check" CHECK ("maximo" >= 0)
);

ALTER TABLE "plan_tope_rol" ADD CONSTRAINT "plan_tope_rol_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── plan_modulo (§2.3) ──────────────────────────────────────────────────────────────────────────
-- Una fila = un módulo incluido. El enum de SL-23 impide nombrar uno inexistente o del núcleo.
CREATE TABLE "plan_modulo" (
    "plan_id" TEXT NOT NULL,
    "modulo" "modulo_apagable" NOT NULL,

    CONSTRAINT "plan_modulo_pkey" PRIMARY KEY ("plan_id", "modulo")
);

ALTER TABLE "plan_modulo" ADD CONSTRAINT "plan_modulo_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── plan_rastro (§2.8) ──────────────────────────────────────────────────────────────────────────
-- `plan_id` y `actor_usuario_id` son opacos y SIN FK, como `historial_accion.entidad_id`: el rastro
-- sobrevive aunque el CASCADE de arriba borre un custom al borrar su empresa. Solo se añade.
CREATE TABLE "plan_rastro" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "plan_nombre" VARCHAR(80) NOT NULL,
    "accion" "plan_rastro_accion" NOT NULL,
    "cambios" JSONB NOT NULL,
    "actor_usuario_id" TEXT NOT NULL,
    "actor_nombre" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_rastro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plan_rastro_plan_id_created_at_idx" ON "plan_rastro" ("plan_id", "created_at");

-- ─── Acceso (§2.5, R8) ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "plan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_tope_rol" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_modulo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "plan_rastro" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "plan" FROM servi_app;
REVOKE ALL ON "plan_tope_rol" FROM servi_app;
REVOKE ALL ON "plan_modulo" FROM servi_app;
REVOKE ALL ON "plan_rastro" FROM servi_app;

-- ─── Asignación en `organizacion` (§2.4) ─────────────────────────────────────────────────────────
-- NO ACTION y no RESTRICT: si se borra una empresa con su propio custom asignado, el CASCADE de
-- `plan_organizacion_exclusiva_id_fkey` borra el plan en la misma sentencia; NO ACTION comprueba al
-- final, cuando la empresa ya no está, y RESTRICT fallaría. En el producto los planes no se borran.
ALTER TABLE "organizacion" ADD COLUMN "plan_id" TEXT;
ALTER TABLE "organizacion" ADD COLUMN "plan_ciclo_ancla_at" TIMESTAMP(3);
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_id_fkey"
    FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
-- Con plan, el ancla de sus ciclos existe (R9, R20).
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_plan_ciclo_ancla_check"
    CHECK ("plan_id" IS NULL OR "plan_ciclo_ancla_at" IS NOT NULL);

-- ─── Conteo de órdenes (§2.6) ────────────────────────────────────────────────────────────────────
-- Sirve exactamente el conteo del tope (R19): las vivas de una empresa desde el inicio del ciclo.
CREATE INDEX "orden_organizacion_id_created_at_vivas_idx"
    ON "orden" ("organizacion_id", "created_at") WHERE "deleted_at" IS NULL;
