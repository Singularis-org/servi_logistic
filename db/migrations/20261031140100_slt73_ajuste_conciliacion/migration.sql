-- SLT-73 (2 de 2) — la tabla del EVENTO que mueve la diferencia de la satélite al conciliar, y el
-- CHECK tipo<->categoría de la caja con las dos categorías nuevas (design §1.2).
--
-- `conciliacion_bodega_ajuste`: UNA fila por evento (la marca o una corrección del monto recibido).
-- APPEND-ONLY. Es el `origen_id` del movimiento de caja de la diferencia: el único de la caja
-- `(origen_tipo, origen_id, categoria)` no admite dos diferencias de la misma consolidación con el
-- mismo origen, así que cada evento necesita su propia fila.
--
-- Patrón de tabla de negocio de SL-17 / SL-36: `organizacion_id` con el DEFAULT de la transacción, FK
-- RESTRICT, índice, RLS para `servi_app`, el trigger que impide cambiar de empresa y uno de misma
-- empresa por cada FK a otra tabla de negocio (generados con `tsx scripts/generar-misma-empresa.ts
-- --faltantes`).
--
-- En su propio archivo porque los valores de enum los añade la migración 1 y Postgres no deja usarlos
-- en la misma transacción (55P04).

CREATE TABLE "conciliacion_bodega_ajuste" (
  "id"               TEXT NOT NULL,
  "organizacion_id"  TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "cierre_bodega_id" TEXT NOT NULL,
  "evento"           TEXT NOT NULL,
  "monto_esperado"   DECIMAL(12,2) NOT NULL,
  "monto_recibido"   DECIMAL(12,2) NOT NULL,
  "diferencia"       DECIMAL(12,2) NOT NULL,
  "creado_por"       TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conciliacion_bodega_ajuste_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conciliacion_bodega_ajuste_evento_check" CHECK ("evento" IN ('marca', 'correccion')),
  -- Un evento que no mueve la diferencia no deja fila (R13: «si la diferencia no varía, ninguno»).
  CONSTRAINT "conciliacion_bodega_ajuste_diferencia_check" CHECK ("diferencia" <> 0)
);

CREATE INDEX "conciliacion_bodega_ajuste_cierre_bodega_id_idx" ON "conciliacion_bodega_ajuste"("cierre_bodega_id");
CREATE INDEX "conciliacion_bodega_ajuste_organizacion_id_idx" ON "conciliacion_bodega_ajuste"("organizacion_id");

ALTER TABLE "conciliacion_bodega_ajuste" ADD CONSTRAINT "conciliacion_bodega_ajuste_cierre_bodega_id_fkey"
  FOREIGN KEY ("cierre_bodega_id") REFERENCES "cierre_bodega"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conciliacion_bodega_ajuste" ADD CONSTRAINT "conciliacion_bodega_ajuste_creado_por_fkey"
  FOREIGN KEY ("creado_por") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conciliacion_bodega_ajuste" ADD CONSTRAINT "conciliacion_bodega_ajuste_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "conciliacion_bodega_ajuste" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conciliacion_bodega_ajuste_por_empresa" ON "conciliacion_bodega_ajuste" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Los privilegios por defecto de M1 de SL-17 ya los dan; se repiten por si la migración la corre otro rol.
GRANT SELECT, INSERT, UPDATE, DELETE ON "conciliacion_bodega_ajuste" TO servi_app;

-- ConciliacionBodegaAjuste.cierreBodega
CREATE TRIGGER "sme_conciliacion_bodega_ajuste_cierre_bodega_a4fd2497" BEFORE INSERT OR UPDATE OF "cierre_bodega_id", "organizacion_id"
  ON "conciliacion_bodega_ajuste" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_bodega', 'cierre_bodega_id', 'id');
-- ConciliacionBodegaAjuste.creador
CREATE TRIGGER "sme_conciliacion_bodega_ajuste_creado_por_6e78ee5b" BEFORE INSERT OR UPDATE OF "creado_por", "organizacion_id"
  ON "conciliacion_bodega_ajuste" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'creado_por', 'id');

CREATE TRIGGER "conciliacion_bodega_ajuste_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "conciliacion_bodega_ajuste" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

-- El CHECK tipo<->categoría de la caja: parte de la definición VIGENTE, la de
-- `20261024130100_pago_plataforma_check` (la última que lo reescribe en `prod`), y solo añade
-- `ingreso_diferencia_satelite` al final del lado `ingreso` y `egreso_diferencia_satelite` al final
-- del lado `egreso`.
ALTER TABLE "wallet_movimiento" DROP CONSTRAINT "wallet_movimiento_tipo_categoria_check";
ALTER TABLE "wallet_movimiento" ADD CONSTRAINT "wallet_movimiento_tipo_categoria_check"
CHECK (
  ("tipo" = 'ingreso' AND "categoria" IN ('ingreso_flete','ingreso_flete_devolucion','ingreso_comision_cod',
     'ingreso_iva_flete','ingreso_iva_flete_devolucion','ingreso_iva_comision_cod','ingreso_ajuste',
     'ingreso_cod_recaudado','ingreso_reverso_pago_tienda',
     'ingreso_reverso_pago_por_cuenta_tienda','ingreso_aporte_capital',
     'ingreso_cobro_tienda',
     'ingreso_abono_tienda',
     'ingreso_diferencia_satelite'))
  OR
  ("tipo" = 'egreso' AND "categoria" IN ('egreso_pago_tienda','egreso_pago_mensajero','egreso_gasto',
     'egreso_sueldo','egreso_ajuste','egreso_gasto_fijo','egreso_gasto_variable','egreso_indemnizacion',
     'egreso_pago_por_cuenta_tienda','egreso_reverso_aporte_capital',
     'egreso_reverso_cobro_tienda',
     'egreso_reverso_abono_tienda',
     'egreso_reverso_flete_devolucion','egreso_reverso_iva_flete_devolucion',
     'egreso_pago_plataforma',
     'egreso_diferencia_satelite'))
);

-- CHECK DE ORIGEN: design §1.2 pide añadir las dos categorías al CHECK de origen «si existe para la
-- categoría». En la caja NO existe (medido en T1: solo `pago_mensajero_movimiento` tiene uno, SLT-68),
-- así que no se crea: que la diferencia vaya con origen `conciliacion_bodega_ajuste` lo sostiene el
-- único escritor (la marca y la corrección de la conciliación).
