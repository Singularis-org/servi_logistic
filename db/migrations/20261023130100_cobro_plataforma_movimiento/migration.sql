-- SL-40 (design §3.3, §3.4) — los cargos y reversos del cobro de la plataforma, un libro append-only
-- por orden: cargo, reverso, cargo… La deuda de la empresa es Σ cargo − Σ reverso.
--
-- Tabla de NEGOCIO (D9), con las mismas piezas que las 73 de SL-17:
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK, su índice y
--     la política `…_por_empresa` para `servi_app`, con la misma forma que reconoce la guardia
--     `rls-por-empresa`. Con ella, la empresa solo LEE sus cargos (R24);
--   · el REVOKE de escritura. Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD, y
--     una empresa podría borrar su deuda con un DELETE a mano: la RLS se lo permitiría, porque la
--     fila es suya (R8). Escriben solo los triggers de 20261023130200 (SECURITY DEFINER);
--   · los triggers de misma empresa y de «sin cambio de empresa», generados con
--     `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (R20, R28).
--
-- FK a `orden` ON DELETE CASCADE: la app nunca borra una orden de verdad (solo `deleted_at`), y el
-- único `DELETE FROM orden` está en las limpiezas de tests y scripts. RESTRICT los rompería sin
-- proteger nada del producto. Las acciones referenciales corren como dueño: el REVOKE no las frena.
--
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TYPE "cobro_plataforma_tipo" AS ENUM ('cargo', 'reverso');

CREATE TYPE "cobro_plataforma_fuente" AS ENUM ('empresa', 'global', 'sin_configurar');

CREATE TABLE "cobro_plataforma_movimiento" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "orden_id" TEXT NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "tipo" "cobro_plataforma_tipo" NOT NULL,
    "fuente" "cobro_plataforma_fuente" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "ocurrido_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cobro_plataforma_movimiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cobro_plataforma_movimiento_secuencia_check" CHECK ("secuencia" >= 1),
    CONSTRAINT "cobro_plataforma_movimiento_monto_check" CHECK ("monto" >= 0)
);

-- Cerrojo de último recurso de la alternancia: una sola fila por (empresa, orden, secuencia).
CREATE UNIQUE INDEX "cobro_plataforma_movimiento_orden_secuencia_key"
    ON "cobro_plataforma_movimiento"("organizacion_id", "orden_id", "secuencia");
CREATE INDEX "cobro_plataforma_movimiento_organizacion_id_idx" ON "cobro_plataforma_movimiento"("organizacion_id");
CREATE INDEX "cobro_plataforma_movimiento_orden_id_idx" ON "cobro_plataforma_movimiento"("orden_id");

ALTER TABLE "cobro_plataforma_movimiento" ADD CONSTRAINT "cobro_plataforma_movimiento_orden_id_fkey"
    FOREIGN KEY ("orden_id") REFERENCES "orden"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cobro_plataforma_movimiento" ADD CONSTRAINT "cobro_plataforma_movimiento_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cobro_plataforma_movimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobro_plataforma_movimiento_por_empresa" ON "cobro_plataforma_movimiento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

REVOKE INSERT, UPDATE, DELETE ON "cobro_plataforma_movimiento" FROM servi_app;

-- ── Misma empresa (SL-17 M3) ── GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.

-- CobroPlataformaMovimiento.orden
CREATE TRIGGER "sme_cobro_plataforma_movimiento_orden_id_a07cad67" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cobro_plataforma_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');

CREATE TRIGGER "cobro_plataforma_movimiento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cobro_plataforma_movimiento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
