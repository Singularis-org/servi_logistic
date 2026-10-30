-- SLT-56 (design §1.1, §1.3) — el rastro de cada AJUSTE del pago al mensajero de una gestion, hecho
-- al revisar su cierre ABIERTO.
--
-- Una fila por ajuste, append-only: un ajuste posterior sobre la misma gestion AÑADE otra (R17). Por
-- eso no hay unico. Tabla propia y no `historial_accion`: el motivo es obligatorio y aquella prohibe
-- texto libre (362/R5). Molde: `gestion_fecha_reprogramacion_cambio` (371), con las piezas de SL-17:
--   · `organizacion_id` NOT NULL con el DEFAULT de la empresa de la transaccion, su FK, su indice y la
--     politica `…_por_empresa` con la forma que reconoce la guardia `rls-por-empresa`;
--   · el REVOKE de UPDATE y DELETE. Sin el, el ALTER DEFAULT PRIVILEGES de 20261022130000 le daria
--     CRUD a `servi_app` y un ajuste se podria reescribir o borrar con SQL a mano: la RLS lo dejaria
--     porque la fila es de la empresa (R17, «sin posibilidad de editarlo ni borrarlo»). INSERT si
--     queda: la app escribe el rastro como `servi_app`;
--   · los triggers de misma empresa y de «sin cambio de empresa», GENERADOS con
--     `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes`.
--
-- FK RESTRICT en las tres: el rastro es evidencia de dinero y sobrevive a cualquier intento de borrar
-- la gestion, el cierre o la persona que ajusto.
--
-- `actor_rol` CONGELADO (precedente `historial_accion.actor_rol`): un admin que mañana cambia de rol
-- no re-etiqueta lo que hizo hoy.
--
-- Sin backfill: antes de esta migracion no existia el ajuste.
-- A mano: `db:migrate:create` falla con P3006 en este repo (ver 20261022130000).

CREATE TABLE "gestion_pago_mensajero_ajuste" (
  "id"               TEXT NOT NULL,
  "organizacion_id"  TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), ''),
  "gestion_id"       TEXT NOT NULL,
  -- El cierre EN EL QUE se ajusto: una gestion puede salir de un cierre rechazado (477).
  "cierre_id"        TEXT NOT NULL,
  "pago_anterior"    DECIMAL(12,2) NOT NULL,
  "pago_nuevo"       DECIMAL(12,2) NOT NULL,
  "actor_usuario_id" TEXT NOT NULL,
  "actor_rol"        "rol_value" NOT NULL,
  "motivo"           TEXT NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "gestion_pago_mensajero_ajuste_pkey" PRIMARY KEY ("id"),
  -- Las tres reglas de R7/R8 puestas en la base, ultima red detras del borde y del servicio. Prisma no
  -- expresa CHECK: viven solo aqui (precedente 371).
  CONSTRAINT "gestion_pago_mensajero_ajuste_pago_nuevo_no_negativo" CHECK ("pago_nuevo" >= 0),
  -- Un «ajuste» que no cambia nada no es un hecho que registrar.
  CONSTRAINT "gestion_pago_mensajero_ajuste_pago_distinto" CHECK ("pago_nuevo" <> "pago_anterior"),
  -- Al menos un caracter que no sea espacio en blanco. No `length(btrim(motivo)) > 0`: `btrim` solo
  -- quita espacios y dejaria pasar un motivo de tabuladores o saltos de linea, que el borde
  -- (`motivoSchema`, `.trim()`) si rechaza.
  CONSTRAINT "gestion_pago_mensajero_ajuste_motivo_no_vacio" CHECK ("motivo" ~ '[^[:space:]]')
);

ALTER TABLE "gestion_pago_mensajero_ajuste" ADD CONSTRAINT "gestion_pago_mensajero_ajuste_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gestion_pago_mensajero_ajuste" ADD CONSTRAINT "gestion_pago_mensajero_ajuste_gestion_id_fkey"
  FOREIGN KEY ("gestion_id") REFERENCES "gestion_orden"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gestion_pago_mensajero_ajuste" ADD CONSTRAINT "gestion_pago_mensajero_ajuste_cierre_id_fkey"
  FOREIGN KEY ("cierre_id") REFERENCES "cierre_dia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "gestion_pago_mensajero_ajuste" ADD CONSTRAINT "gestion_pago_mensajero_ajuste_actor_usuario_id_fkey"
  FOREIGN KEY ("actor_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- La lectura del detalle: los ajustes de una gestion en orden cronologico. Cubre la FK por prefijo.
CREATE INDEX "gestion_pago_mensajero_ajuste_gestion_id_created_at_idx"
  ON "gestion_pago_mensajero_ajuste"("gestion_id", "created_at");
-- Las otras dos FK RESTRICT, indexadas: sin indice, el RESTRICT recorre la tabla en cada borrado.
CREATE INDEX "gestion_pago_mensajero_ajuste_cierre_id_idx" ON "gestion_pago_mensajero_ajuste"("cierre_id");
CREATE INDEX "gestion_pago_mensajero_ajuste_actor_usuario_id_idx" ON "gestion_pago_mensajero_ajuste"("actor_usuario_id");
CREATE INDEX "gestion_pago_mensajero_ajuste_organizacion_id_idx" ON "gestion_pago_mensajero_ajuste"("organizacion_id");

ALTER TABLE "gestion_pago_mensajero_ajuste" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_pago_mensajero_ajuste_por_empresa" ON "gestion_pago_mensajero_ajuste" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- R17: inmutable para la app. Lee e inserta; nunca reescribe ni borra.
REVOKE UPDATE, DELETE ON "gestion_pago_mensajero_ajuste" FROM servi_app;

-- ── Misma empresa (SL-17 M3) ── GENERADO con `tsx scripts/generar-misma-empresa.ts --faltantes`.

-- GestionPagoMensajeroAjuste.actor
CREATE TRIGGER "sme_gestion_pago_mensajero_ajuste_actor_usua_c147fb09" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "gestion_pago_mensajero_ajuste" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- GestionPagoMensajeroAjuste.cierre
CREATE TRIGGER "sme_gestion_pago_mensajero_ajuste_cierre_id_a1cb5a27" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "gestion_pago_mensajero_ajuste" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- GestionPagoMensajeroAjuste.gestion
CREATE TRIGGER "sme_gestion_pago_mensajero_ajuste_gestion_id_22d339fa" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "gestion_pago_mensajero_ajuste" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');

CREATE TRIGGER "gestion_pago_mensajero_ajuste_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_pago_mensajero_ajuste" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
