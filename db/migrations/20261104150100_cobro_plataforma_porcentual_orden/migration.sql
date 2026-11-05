-- SLT-83 (design §2.2; R6, R17, R24) — las condiciones congeladas de cada orden porcentual: el porcentaje
-- y el mínimo del plan en el momento del alta. Una fila por orden, que escribe SOLO el trigger de alta de
-- 20261104150200 (SECURITY DEFINER). La conciliación las lee para calcular el cargo al estado final.
--
-- Tabla de NEGOCIO, con las mismas piezas que `cobro_plataforma_movimiento` (SL-40 §3.3, §3.4):
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK, su índice y la
--     política `…_por_empresa` para `servi_app`, con la forma que reconoce la guardia `rls-por-empresa`.
--     Con ella, la empresa solo LEE las condiciones de sus órdenes (R17);
--   · el REVOKE de escritura. Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD, y una
--     empresa podría bajarse el porcentaje con un UPDATE a mano: la RLS se lo permitiría, porque la fila
--     es suya (R17);
--   · los triggers de misma empresa y de «sin cambio de empresa», generados con
--     `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (R17).
--
-- FK a `orden` ON DELETE CASCADE, por la misma razón que SL-40 §3.3: la app nunca borra una orden de
-- verdad (solo `deleted_at`), y el único `DELETE FROM orden` está en las limpiezas de tests y scripts.
--
-- Índice nuevo en `cobro_plataforma_movimiento` (`organizacion_id`, `ocurrido_at`): la suma de lo cobrado
-- en el ciclo filtra por la fecha del cargo (R24, P1 opción A). No cambia ninguna fila.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "cobro_plataforma_porcentual_orden" (
    "orden_id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "minimo" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_plataforma_porcentual_orden_pkey" PRIMARY KEY ("orden_id"),
    CONSTRAINT "cobro_plataforma_porcentual_orden_porcentaje_check" CHECK ("porcentaje" > 0 AND "porcentaje" <= 100),
    CONSTRAINT "cobro_plataforma_porcentual_orden_minimo_check" CHECK ("minimo" IS NULL OR "minimo" >= 0)
);

-- Único por empresa (regla de docs/architecture.md) y el índice del conteo de pendientes (R24).
CREATE UNIQUE INDEX "cobro_plataforma_porcentual_orden_organizacion_id_orden_id_key"
    ON "cobro_plataforma_porcentual_orden"("organizacion_id", "orden_id");
CREATE INDEX "cobro_plataforma_porcentual_orden_organizacion_id_idx"
    ON "cobro_plataforma_porcentual_orden"("organizacion_id");

ALTER TABLE "cobro_plataforma_porcentual_orden" ADD CONSTRAINT "cobro_plataforma_porcentual_orden_orden_id_fkey"
    FOREIGN KEY ("orden_id") REFERENCES "orden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobro_plataforma_porcentual_orden" ADD CONSTRAINT "cobro_plataforma_porcentual_orden_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cobro_plataforma_porcentual_orden" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobro_plataforma_porcentual_orden_por_empresa" ON "cobro_plataforma_porcentual_orden" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

REVOKE INSERT, UPDATE, DELETE ON "cobro_plataforma_porcentual_orden" FROM servi_app;

-- La suma de lo cobrado en el ciclo, por la fecha del cargo (R24).
CREATE INDEX "cobro_plataforma_movimiento_organizacion_id_ocurrido_at_idx"
    ON "cobro_plataforma_movimiento"("organizacion_id", "ocurrido_at");

-- ── Misma empresa (SL-17 M3) ── GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.

-- CobroPlataformaPorcentualOrden.orden
CREATE TRIGGER "sme_cobro_plataforma_porcentual_orden_orden__f90554ea" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cobro_plataforma_porcentual_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');

CREATE TRIGGER "cobro_plataforma_porcentual_orden_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cobro_plataforma_porcentual_orden" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
