-- FICHA 419 (design §D3) — la bodega CENTRAL cierra la devolucion a la tienda con un COMPROBANTE.
-- A mano (`db:migrate:create` falla con P3006 en este repo); el DDL de las tablas es el que
-- `prisma migrate diff --from-config-datasource --to-schema` produce para los modelos de
-- `db/schema.prisma`, mas los CHECK y la RLS que Prisma no expresa.
--
--   · `devolucion_tienda_comprobante`: un LOTE (una tienda, quien lo confirmo, el instante).
--   · `devolucion_tienda_evidencia`: los 1..N archivos del comprobante (bucket privado
--     `gestion-evidencias`, carpeta `devolucion-tienda/`). `storage_path` nunca sale al cliente.
--   · `devolucion_tienda_orden`: enlace orden <-> comprobante. PK = `orden_id`: una orden se
--     devuelve a la tienda UNA vez (segunda red de R8 tras el `UPDATE ... RETURNING`).
--   · Inmutables: sin `updated_at` ni `deleted_at`. FKs RESTRICT (molde `wallet_comprobante`).
--   · RLS habilitada SIN policies en las tres (solo service role).
--
-- No toca ningun enum ni ninguna fila existente.

-- ── Tablas ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE "devolucion_tienda_comprobante" (
    "id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "subido_por" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucion_tienda_comprobante_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "devolucion_tienda_evidencia" (
    "id" TEXT NOT NULL,
    "comprobante_id" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,

    CONSTRAINT "devolucion_tienda_evidencia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "devolucion_tienda_orden" (
    "orden_id" TEXT NOT NULL,
    "comprobante_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devolucion_tienda_orden_pkey" PRIMARY KEY ("orden_id")
);

-- ── Indices ───────────────────────────────────────────────────────────────────────────────────
CREATE INDEX "devolucion_tienda_comprobante_tienda_id_idx" ON "devolucion_tienda_comprobante"("tienda_id");
CREATE INDEX "devolucion_tienda_comprobante_subido_por_idx" ON "devolucion_tienda_comprobante"("subido_por");
CREATE UNIQUE INDEX "devolucion_tienda_evidencia_comprobante_id_indice_key" ON "devolucion_tienda_evidencia"("comprobante_id", "indice");
CREATE INDEX "devolucion_tienda_orden_comprobante_id_idx" ON "devolucion_tienda_orden"("comprobante_id");

-- ── Claves foraneas (RESTRICT: ni la tienda, ni quien confirmo, ni la orden se borran) ────────
ALTER TABLE "devolucion_tienda_comprobante" ADD CONSTRAINT "devolucion_tienda_comprobante_tienda_id_fkey" FOREIGN KEY ("tienda_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devolucion_tienda_comprobante" ADD CONSTRAINT "devolucion_tienda_comprobante_subido_por_fkey" FOREIGN KEY ("subido_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devolucion_tienda_evidencia" ADD CONSTRAINT "devolucion_tienda_evidencia_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "devolucion_tienda_comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devolucion_tienda_orden" ADD CONSTRAINT "devolucion_tienda_orden_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devolucion_tienda_orden" ADD CONSTRAINT "devolucion_tienda_orden_comprobante_id_fkey" FOREIGN KEY ("comprobante_id") REFERENCES "devolucion_tienda_comprobante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── CHECK (Prisma no los expresa) ─────────────────────────────────────────────────────────────
-- La lista de `GESTION_ALLOWED_MIME` (`lib/config/gestion.ts`): los limites de la 119.
ALTER TABLE "devolucion_tienda_evidencia" ADD CONSTRAINT "devolucion_tienda_evidencia_content_type_check"
  CHECK ("content_type" IN ('image/jpeg', 'image/png', 'image/webp'));
ALTER TABLE "devolucion_tienda_evidencia" ADD CONSTRAINT "devolucion_tienda_evidencia_indice_check"
  CHECK ("indice" >= 0);
ALTER TABLE "devolucion_tienda_evidencia" ADD CONSTRAINT "devolucion_tienda_evidencia_storage_path_check"
  CHECK (btrim("storage_path") <> '');

-- ── RLS: habilitada SIN policies, solo service role ───────────────────────────────────────────
ALTER TABLE "devolucion_tienda_comprobante" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devolucion_tienda_evidencia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devolucion_tienda_orden" ENABLE ROW LEVEL SECURITY;
