-- SLT-94 (3 de 4, design §1 M3) — el registro del COBRO DE FULFILLMENT por paquete, los dos CHECK
-- tipo<->categoría de los libros con las categorías nuevas, y la restricción del valor de fulfillment.
--
-- `orden_fulfillment_movimiento`: un registro INMUTABLE por evento (cargo / reverso, con secuencia y
-- causa). Congela monto, % de IVA, IVA, la tienda cobrada y el valor que lo produjo (R21, R31). Es el
-- `origen_id` de sus filas en los dos libros: cada evento tiene su propia clave, así que los únicos
-- parciales `(origen_tipo, origen_id, [tienda_id,] categoria)` de los libros son la segunda barrera de
-- idempotencia, y el único `(organizacion_id, orden_id, secuencia)` la primera (R23, R27).
--
-- Tabla de NEGOCIO, con las piezas de `cobro_plataforma_movimiento` (SL-40) y SLT-73:
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transacción, su FK, su índice y la
--     política `…_por_empresa` para `servi_app`, con la forma que reconoce la guardia `rls-por-empresa`;
--   · el REVOKE de escritura (R25). Sin él, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daría CRUD,
--     y una empresa podría borrar un cobro con un DELETE a mano. Escriben solo los triggers de
--     20261108120300 (SECURITY DEFINER);
--   · los triggers de misma empresa y de «sin cambio de empresa», generados con
--     `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` (R38).
--
-- FK a `orden` y a `usuario` (la tienda) ON DELETE RESTRICT: el dinero es evidencia (design §1 M3). A
-- diferencia de SL-40 (CASCADE), quien limpie órdenes de prueba con cobro de fulfillment tiene que borrar
-- antes estos movimientos como dueño. FK a `tarifa_valor` SET NULL: es traza, nunca bloqueo (R21).
--
-- Va después de M1 porque los CHECK nombran los valores de enum que M1 añade (55P04).
-- A mano: `db:migrate:create` falla con P3006 en este repo.

CREATE TYPE "orden_fulfillment_movimiento_tipo" AS ENUM ('cargo', 'reverso');

CREATE TYPE "orden_fulfillment_movimiento_causa" AS ENUM ('creacion', 'restauracion', 'eliminacion', 'cancelacion_api');

CREATE TABLE "orden_fulfillment_movimiento" (
    "id" TEXT NOT NULL,
    "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
    "orden_id" TEXT NOT NULL,
    "tienda_id" TEXT NOT NULL,
    "secuencia" INTEGER NOT NULL,
    "tipo" "orden_fulfillment_movimiento_tipo" NOT NULL,
    "causa" "orden_fulfillment_movimiento_causa" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "iva_pct" DECIMAL(5,2) NOT NULL,
    "iva" DECIMAL(12,2) NOT NULL,
    "tarifa_valor_id" TEXT,
    "ocurrido_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_fulfillment_movimiento_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orden_fulfillment_movimiento_secuencia_check" CHECK ("secuencia" >= 1),
    CONSTRAINT "orden_fulfillment_movimiento_monto_check" CHECK ("monto" > 0),
    CONSTRAINT "orden_fulfillment_movimiento_iva_pct_check" CHECK ("iva_pct" >= 0),
    CONSTRAINT "orden_fulfillment_movimiento_iva_check" CHECK ("iva" >= 0),
    -- La alternancia empieza por un cargo: secuencia impar <=> cargo.
    CONSTRAINT "orden_fulfillment_movimiento_alternancia_check" CHECK ((("secuencia" % 2) = 1) = ("tipo" = 'cargo')),
    -- La causa casa con el tipo (D11/D12).
    CONSTRAINT "orden_fulfillment_movimiento_causa_check" CHECK (
      ("tipo" = 'cargo'   AND "causa" IN ('creacion', 'restauracion'))
      OR
      ("tipo" = 'reverso' AND "causa" IN ('eliminacion', 'cancelacion_api'))
    ),
    -- La secuencia 1 es el ÚNICO cobro inicial (R23): `creacion` solo ahí.
    CONSTRAINT "orden_fulfillment_movimiento_creacion_check" CHECK (("causa" = 'creacion') = ("secuencia" = 1))
);

-- R23/R27: un evento por (empresa, orden, secuencia); la secuencia 1 es el único cobro inicial.
CREATE UNIQUE INDEX "orden_fulfillment_movimiento_orden_secuencia_key"
    ON "orden_fulfillment_movimiento"("organizacion_id", "orden_id", "secuencia");
CREATE INDEX "orden_fulfillment_movimiento_organizacion_id_idx" ON "orden_fulfillment_movimiento"("organizacion_id");
CREATE INDEX "orden_fulfillment_movimiento_orden_id_idx" ON "orden_fulfillment_movimiento"("orden_id");
CREATE INDEX "orden_fulfillment_movimiento_tienda_id_idx" ON "orden_fulfillment_movimiento"("tienda_id");
CREATE INDEX "orden_fulfillment_movimiento_tarifa_valor_id_idx" ON "orden_fulfillment_movimiento"("tarifa_valor_id");

ALTER TABLE "orden_fulfillment_movimiento" ADD CONSTRAINT "orden_fulfillment_movimiento_orden_id_fkey"
    FOREIGN KEY ("orden_id") REFERENCES "orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orden_fulfillment_movimiento" ADD CONSTRAINT "orden_fulfillment_movimiento_tienda_id_fkey"
    FOREIGN KEY ("tienda_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orden_fulfillment_movimiento" ADD CONSTRAINT "orden_fulfillment_movimiento_tarifa_valor_id_fkey"
    FOREIGN KEY ("tarifa_valor_id") REFERENCES "tarifa_valor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orden_fulfillment_movimiento" ADD CONSTRAINT "orden_fulfillment_movimiento_organizacion_id_fkey"
    FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orden_fulfillment_movimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_fulfillment_movimiento_por_empresa" ON "orden_fulfillment_movimiento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- R25: la app solo lee; escribe solo el trigger (SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON "orden_fulfillment_movimiento" FROM servi_app;

-- ── Misma empresa (SL-17 M3) ── GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.

-- OrdenFulfillmentMovimiento.orden
CREATE TRIGGER "sme_orden_fulfillment_movimiento_orden_id_aac21f7e" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_fulfillment_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenFulfillmentMovimiento.tarifaValor
CREATE TRIGGER "sme_orden_fulfillment_movimiento_tarifa_valo_ecf54710" BEFORE INSERT OR UPDATE OF "tarifa_valor_id", "organizacion_id"
  ON "orden_fulfillment_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifa_valor', 'tarifa_valor_id', 'id');
-- OrdenFulfillmentMovimiento.tienda
CREATE TRIGGER "sme_orden_fulfillment_movimiento_tienda_id_da061cd4" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "orden_fulfillment_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');

CREATE TRIGGER "orden_fulfillment_movimiento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_fulfillment_movimiento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- ── Los dos CHECK tipo<->categoría, AMPLIADOS ─────────────────────────────────────────────────────
-- Tienda: parte de la definición VIGENTE (`20260928120100_wallet_458_tablas`, comprobada contra
-- `pg_get_constraintdef` en la base migrada) y solo añade `fulfillment_anulado`,
-- `iva_fulfillment_anulado` al final del lado `credito` y `fulfillment`, `iva_fulfillment` al final del
-- lado `debito`.
ALTER TABLE "wallet_tienda_movimiento" DROP CONSTRAINT "wallet_tienda_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_tienda_movimiento" ADD CONSTRAINT "wallet_tienda_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'credito' AND "categoria" IN ('cod_recaudado','ajuste_credito','pago_por_cuenta_anulado','cobro_tienda_anulado',
     'abono_tienda',
     'flete_devolucion_anulado','iva_flete_devolucion_anulado',
     'fulfillment_anulado','iva_fulfillment_anulado'))
  OR
  ("tipo" = 'debito' AND "categoria" IN ('flete','flete_devolucion','comision_cod','iva_flete',
     'iva_flete_devolucion','iva_comision_cod','pago_tienda','ajuste_debito','cobro_manual','pago_por_cuenta',
     'abono_tienda_anulado',
     'fulfillment','iva_fulfillment'))
);

-- Caja: parte de la definición VIGENTE (`20261031140100_slt73_ajuste_conciliacion`, comprobada igual) y
-- solo añade `ingreso_fulfillment`, `ingreso_iva_fulfillment` al final del lado `ingreso` y
-- `egreso_reverso_fulfillment`, `egreso_reverso_iva_fulfillment` al final del lado `egreso`.
ALTER TABLE "wallet_movimiento" DROP CONSTRAINT "wallet_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_movimiento" ADD CONSTRAINT "wallet_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'ingreso' AND "categoria" IN ('ingreso_flete','ingreso_flete_devolucion','ingreso_comision_cod',
     'ingreso_iva_flete','ingreso_iva_flete_devolucion','ingreso_iva_comision_cod','ingreso_ajuste',
     'ingreso_cod_recaudado','ingreso_reverso_pago_tienda',
     'ingreso_reverso_pago_por_cuenta_tienda','ingreso_aporte_capital',
     'ingreso_cobro_tienda',
     'ingreso_abono_tienda',
     'ingreso_diferencia_satelite',
     'ingreso_fulfillment','ingreso_iva_fulfillment'))
  OR
  ("tipo" = 'egreso' AND "categoria" IN ('egreso_pago_tienda','egreso_pago_mensajero','egreso_gasto',
     'egreso_sueldo','egreso_ajuste','egreso_gasto_fijo','egreso_gasto_variable','egreso_indemnizacion',
     'egreso_pago_por_cuenta_tienda','egreso_reverso_aporte_capital',
     'egreso_reverso_cobro_tienda',
     'egreso_reverso_abono_tienda',
     'egreso_reverso_flete_devolucion','egreso_reverso_iva_flete_devolucion',
     'egreso_pago_plataforma',
     'egreso_diferencia_satelite',
     'egreso_reverso_fulfillment','egreso_reverso_iva_fulfillment'))
);

-- ── R12: el fulfillment solo como precio propio de la tienda («tienda en todas sus zonas») y en monto ──
-- NOT VALID: en dev puede haber filas viejas que no cumplen y no se borran (R14, design §8 alt. 6);
-- Postgres la aplica igual a todo INSERT y UPDATE nuevo. En producción hay 0 filas (T0).
-- `mensajero_id` y `vehiculo_id` ya los exige NULL `tarifa_valor_niveles_tienda` para todo `tienda_%`.
ALTER TABLE "tarifa_valor" ADD CONSTRAINT "tarifa_valor_fulfillment_solo_tienda_monto" CHECK (
  "concepto" <> 'tienda_fulfillment'
  OR ("tienda_id" IS NOT NULL AND "zona_id" IS NULL AND "grupo_id" IS NULL AND "modo" = 'monto')
) NOT VALID;
