-- SL-17 M2 (design §3 M2): `organizacion_id` + FK + indice + RLS por empresa en las 73 tablas de
-- negocio de `lib/db/modelos-de-negocio.ts`. GENERADO con un script de un solo uso (no se commitea);
-- se commitea este SQL, que es el que se revisa.
--
--   · `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`: las creaciones anidadas y el
--     SQL a mano toman la empresa de la transaccion. Sin empresa fijada da NULL y salta el NOT NULL
--     (R19). `usuario` es la unica nulable (R3: el superadmin).
--   · Sin backfill: la app esta vacia (D9, D10).
--   · Politica `<t>_por_empresa` para `servi_app` (R17). El dueno de las tablas no la ve (plataforma).
--   · Las 73 ya tenian RLS activa antes de M2 (medido): el `ENABLE` no cambia nada y el down no la
--     desactiva.
--   · Unicos (R36): `usuario.email` y `usuario.cedula` siguen globales; SL-18 decide los por empresa.

BEGIN;

-- UNICA FILA PREVIA EN NEGOCIO: `20260716130000_premio_ranking` sembro las 3 posiciones del podio
-- SIN empresa (monto y descripcion NULL). No pueden recibir `organizacion_id` y harian fallar el
-- NOT NULL en una base recien migrada, asi que se quitan. Solo las intactas: si alguna se edito, el
-- NOT NULL falla y la base se rehace con `migrate reset` (D9, D10). El down.sql las vuelve a sembrar.
DELETE FROM "premio_ranking" WHERE "monto" IS NULL AND "descripcion" IS NULL;

-- Usuario
ALTER TABLE "usuario" ADD COLUMN "organizacion_id" TEXT DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "usuario_organizacion_id_idx" ON "usuario"("organizacion_id");
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario_por_empresa" ON "usuario" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- MensajeroDocumento
ALTER TABLE "mensajero_documento" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "mensajero_documento" ADD CONSTRAINT "mensajero_documento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "mensajero_documento_organizacion_id_idx" ON "mensajero_documento"("organizacion_id");
ALTER TABLE "mensajero_documento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mensajero_documento_por_empresa" ON "mensajero_documento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- UsuarioPreferencia
ALTER TABLE "usuario_preferencia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "usuario_preferencia" ADD CONSTRAINT "usuario_preferencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "usuario_preferencia_organizacion_id_idx" ON "usuario_preferencia"("organizacion_id");
ALTER TABLE "usuario_preferencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "usuario_preferencia_por_empresa" ON "usuario_preferencia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PushSuscripcion
ALTER TABLE "push_suscripcion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "push_suscripcion" ADD CONSTRAINT "push_suscripcion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "push_suscripcion_organizacion_id_idx" ON "push_suscripcion"("organizacion_id");
ALTER TABLE "push_suscripcion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_suscripcion_por_empresa" ON "push_suscripcion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PushEnvioDia
ALTER TABLE "push_envio_dia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "push_envio_dia" ADD CONSTRAINT "push_envio_dia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "push_envio_dia_organizacion_id_idx" ON "push_envio_dia"("organizacion_id");
ALTER TABLE "push_envio_dia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_envio_dia_por_empresa" ON "push_envio_dia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AsistenteUsoDiario
ALTER TABLE "asistente_uso_diario" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "asistente_uso_diario" ADD CONSTRAINT "asistente_uso_diario_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "asistente_uso_diario_organizacion_id_idx" ON "asistente_uso_diario"("organizacion_id");
ALTER TABLE "asistente_uso_diario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "asistente_uso_diario_por_empresa" ON "asistente_uso_diario" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- VistaFiltro
ALTER TABLE "vista_filtro" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "vista_filtro" ADD CONSTRAINT "vista_filtro_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "vista_filtro_organizacion_id_idx" ON "vista_filtro"("organizacion_id");
ALTER TABLE "vista_filtro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vista_filtro_por_empresa" ON "vista_filtro" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- ApiKey
ALTER TABLE "api_key" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "api_key_organizacion_id_idx" ON "api_key"("organizacion_id");
ALTER TABLE "api_key" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_key_por_empresa" ON "api_key" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WebhookSuscripcion
ALTER TABLE "webhook_suscripcion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "webhook_suscripcion" ADD CONSTRAINT "webhook_suscripcion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "webhook_suscripcion_organizacion_id_idx" ON "webhook_suscripcion"("organizacion_id");
ALTER TABLE "webhook_suscripcion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook_suscripcion_por_empresa" ON "webhook_suscripcion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PostulacionRecurso
ALTER TABLE "postulacion_recurso" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "postulacion_recurso" ADD CONSTRAINT "postulacion_recurso_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "postulacion_recurso_organizacion_id_idx" ON "postulacion_recurso"("organizacion_id");
ALTER TABLE "postulacion_recurso" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "postulacion_recurso_por_empresa" ON "postulacion_recurso" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Zona
ALTER TABLE "zona" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "zona" ADD CONSTRAINT "zona_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "zona_organizacion_id_idx" ON "zona"("organizacion_id");
ALTER TABLE "zona" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zona_por_empresa" ON "zona" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- ZonaDistrito
ALTER TABLE "zona_distrito" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "zona_distrito" ADD CONSTRAINT "zona_distrito_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "zona_distrito_organizacion_id_idx" ON "zona_distrito"("organizacion_id");
ALTER TABLE "zona_distrito" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zona_distrito_por_empresa" ON "zona_distrito" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Tarifa
ALTER TABLE "tarifas" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tarifas_organizacion_id_idx" ON "tarifas"("organizacion_id");
ALTER TABLE "tarifas" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifas_por_empresa" ON "tarifas" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- TarifaZonaMensajero
ALTER TABLE "tarifa_zona_mensajero" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "tarifa_zona_mensajero" ADD CONSTRAINT "tarifa_zona_mensajero_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tarifa_zona_mensajero_organizacion_id_idx" ON "tarifa_zona_mensajero"("organizacion_id");
ALTER TABLE "tarifa_zona_mensajero" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tarifa_zona_mensajero_por_empresa" ON "tarifa_zona_mensajero" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PremioRanking
ALTER TABLE "premio_ranking" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "premio_ranking" ADD CONSTRAINT "premio_ranking_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "premio_ranking_organizacion_id_idx" ON "premio_ranking"("organizacion_id");
ALTER TABLE "premio_ranking" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "premio_ranking_por_empresa" ON "premio_ranking" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GastoFijoPlantilla
ALTER TABLE "gasto_fijo_plantilla" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gasto_fijo_plantilla" ADD CONSTRAINT "gasto_fijo_plantilla_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gasto_fijo_plantilla_organizacion_id_idx" ON "gasto_fijo_plantilla"("organizacion_id");
ALTER TABLE "gasto_fijo_plantilla" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gasto_fijo_plantilla_por_empresa" ON "gasto_fijo_plantilla" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Orden
ALTER TABLE "orden" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden" ADD CONSTRAINT "orden_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_organizacion_id_idx" ON "orden"("organizacion_id");
ALTER TABLE "orden" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_por_empresa" ON "orden" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Carga
ALTER TABLE "carga" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "carga" ADD CONSTRAINT "carga_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "carga_organizacion_id_idx" ON "carga"("organizacion_id");
ALTER TABLE "carga" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carga_por_empresa" ON "carga" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenMensajeroMeta
ALTER TABLE "orden_mensajero_meta" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_mensajero_meta" ADD CONSTRAINT "orden_mensajero_meta_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_mensajero_meta_organizacion_id_idx" ON "orden_mensajero_meta"("organizacion_id");
ALTER TABLE "orden_mensajero_meta" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_mensajero_meta_por_empresa" ON "orden_mensajero_meta" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenNota
ALTER TABLE "orden_nota" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_nota" ADD CONSTRAINT "orden_nota_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_nota_organizacion_id_idx" ON "orden_nota"("organizacion_id");
ALTER TABLE "orden_nota" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_nota_por_empresa" ON "orden_nota" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenHabilitacionApi
ALTER TABLE "orden_habilitacion_api" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_habilitacion_api" ADD CONSTRAINT "orden_habilitacion_api_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_habilitacion_api_organizacion_id_idx" ON "orden_habilitacion_api"("organizacion_id");
ALTER TABLE "orden_habilitacion_api" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_habilitacion_api_por_empresa" ON "orden_habilitacion_api" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenHistorialEstado
ALTER TABLE "orden_historial_estado" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_historial_estado" ADD CONSTRAINT "orden_historial_estado_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_historial_estado_organizacion_id_idx" ON "orden_historial_estado"("organizacion_id");
ALTER TABLE "orden_historial_estado" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_historial_estado_por_empresa" ON "orden_historial_estado" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenDiaRepartoCambio
ALTER TABLE "orden_dia_reparto_cambio" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_dia_reparto_cambio" ADD CONSTRAINT "orden_dia_reparto_cambio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_dia_reparto_cambio_organizacion_id_idx" ON "orden_dia_reparto_cambio"("organizacion_id");
ALTER TABLE "orden_dia_reparto_cambio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_dia_reparto_cambio_por_empresa" ON "orden_dia_reparto_cambio" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenTraspasoMensajero
ALTER TABLE "orden_traspaso_mensajero" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_traspaso_mensajero" ADD CONSTRAINT "orden_traspaso_mensajero_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_traspaso_mensajero_organizacion_id_idx" ON "orden_traspaso_mensajero"("organizacion_id");
ALTER TABLE "orden_traspaso_mensajero" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_traspaso_mensajero_por_empresa" ON "orden_traspaso_mensajero" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenEvento
ALTER TABLE "orden_evento" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_evento" ADD CONSTRAINT "orden_evento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_evento_organizacion_id_idx" ON "orden_evento"("organizacion_id");
ALTER TABLE "orden_evento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_evento_por_empresa" ON "orden_evento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenIncidente
ALTER TABLE "orden_incidente" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_incidente" ADD CONSTRAINT "orden_incidente_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_incidente_organizacion_id_idx" ON "orden_incidente"("organizacion_id");
ALTER TABLE "orden_incidente" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_incidente_por_empresa" ON "orden_incidente" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- OrdenIncidenteEvidencia
ALTER TABLE "orden_incidente_evidencia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "orden_incidente_evidencia" ADD CONSTRAINT "orden_incidente_evidencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "orden_incidente_evidencia_organizacion_id_idx" ON "orden_incidente_evidencia"("organizacion_id");
ALTER TABLE "orden_incidente_evidencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orden_incidente_evidencia_por_empresa" ON "orden_incidente_evidencia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GestionOrden
ALTER TABLE "gestion_orden" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gestion_orden" ADD CONSTRAINT "gestion_orden_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gestion_orden_organizacion_id_idx" ON "gestion_orden"("organizacion_id");
ALTER TABLE "gestion_orden" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_orden_por_empresa" ON "gestion_orden" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GestionOrdenEvidencia
ALTER TABLE "gestion_orden_evidencia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gestion_orden_evidencia" ADD CONSTRAINT "gestion_orden_evidencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gestion_orden_evidencia_organizacion_id_idx" ON "gestion_orden_evidencia"("organizacion_id");
ALTER TABLE "gestion_orden_evidencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_orden_evidencia_por_empresa" ON "gestion_orden_evidencia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GestionOrdenPago
ALTER TABLE "gestion_orden_pago" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gestion_orden_pago" ADD CONSTRAINT "gestion_orden_pago_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gestion_orden_pago_organizacion_id_idx" ON "gestion_orden_pago"("organizacion_id");
ALTER TABLE "gestion_orden_pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_orden_pago_por_empresa" ON "gestion_orden_pago" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GestionFechaReprogramacionCambio
ALTER TABLE "gestion_fecha_reprogramacion_cambio" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gestion_fecha_reprogramacion_cambio" ADD CONSTRAINT "gestion_fecha_reprogramacion_cambio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gestion_fecha_reprogramacion_cambio_organizacion_id_idx" ON "gestion_fecha_reprogramacion_cambio"("organizacion_id");
ALTER TABLE "gestion_fecha_reprogramacion_cambio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gestion_fecha_reprogramacion_cambio_por_empresa" ON "gestion_fecha_reprogramacion_cambio" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RutaOptimizada
ALTER TABLE "ruta_optimizada" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "ruta_optimizada" ADD CONSTRAINT "ruta_optimizada_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ruta_optimizada_organizacion_id_idx" ON "ruta_optimizada"("organizacion_id");
ALTER TABLE "ruta_optimizada" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ruta_optimizada_por_empresa" ON "ruta_optimizada" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RutaOptimizadaParada
ALTER TABLE "ruta_optimizada_parada" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "ruta_optimizada_parada" ADD CONSTRAINT "ruta_optimizada_parada_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ruta_optimizada_parada_organizacion_id_idx" ON "ruta_optimizada_parada"("organizacion_id");
ALTER TABLE "ruta_optimizada_parada" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ruta_optimizada_parada_por_empresa" ON "ruta_optimizada_parada" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CierreDia
ALTER TABLE "cierre_dia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cierre_dia" ADD CONSTRAINT "cierre_dia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cierre_dia_organizacion_id_idx" ON "cierre_dia"("organizacion_id");
ALTER TABLE "cierre_dia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_dia_por_empresa" ON "cierre_dia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CierreBodega
ALTER TABLE "cierre_bodega" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cierre_bodega" ADD CONSTRAINT "cierre_bodega_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cierre_bodega_organizacion_id_idx" ON "cierre_bodega"("organizacion_id");
ALTER TABLE "cierre_bodega" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_bodega_por_empresa" ON "cierre_bodega" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CierreDetail
ALTER TABLE "cierre_detail" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cierre_detail" ADD CONSTRAINT "cierre_detail_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cierre_detail_organizacion_id_idx" ON "cierre_detail"("organizacion_id");
ALTER TABLE "cierre_detail" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_detail_por_empresa" ON "cierre_detail" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CierreSinGestion
ALTER TABLE "cierre_sin_gestion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cierre_sin_gestion" ADD CONSTRAINT "cierre_sin_gestion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cierre_sin_gestion_organizacion_id_idx" ON "cierre_sin_gestion"("organizacion_id");
ALTER TABLE "cierre_sin_gestion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_sin_gestion_por_empresa" ON "cierre_sin_gestion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CierreRechazoTienda
ALTER TABLE "cierre_rechazo_tienda" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cierre_rechazo_tienda" ADD CONSTRAINT "cierre_rechazo_tienda_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cierre_rechazo_tienda_organizacion_id_idx" ON "cierre_rechazo_tienda"("organizacion_id");
ALTER TABLE "cierre_rechazo_tienda" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cierre_rechazo_tienda_por_empresa" ON "cierre_rechazo_tienda" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WalletMovimiento
ALTER TABLE "wallet_movimiento" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "wallet_movimiento" ADD CONSTRAINT "wallet_movimiento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "wallet_movimiento_organizacion_id_idx" ON "wallet_movimiento"("organizacion_id");
ALTER TABLE "wallet_movimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_movimiento_por_empresa" ON "wallet_movimiento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WalletTiendaMovimiento
ALTER TABLE "wallet_tienda_movimiento" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "wallet_tienda_movimiento" ADD CONSTRAINT "wallet_tienda_movimiento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "wallet_tienda_movimiento_organizacion_id_idx" ON "wallet_tienda_movimiento"("organizacion_id");
ALTER TABLE "wallet_tienda_movimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_tienda_movimiento_por_empresa" ON "wallet_tienda_movimiento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PagoMensajeroMovimiento
ALTER TABLE "pago_mensajero_movimiento" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "pago_mensajero_movimiento" ADD CONSTRAINT "pago_mensajero_movimiento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "pago_mensajero_movimiento_organizacion_id_idx" ON "pago_mensajero_movimiento"("organizacion_id");
ALTER TABLE "pago_mensajero_movimiento" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_mensajero_movimiento_por_empresa" ON "pago_mensajero_movimiento" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- LiquidacionPago
ALTER TABLE "liquidacion_pago" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "liquidacion_pago" ADD CONSTRAINT "liquidacion_pago_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "liquidacion_pago_organizacion_id_idx" ON "liquidacion_pago"("organizacion_id");
ALTER TABLE "liquidacion_pago" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liquidacion_pago_por_empresa" ON "liquidacion_pago" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- LiquidacionAnulacion
ALTER TABLE "liquidacion_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "liquidacion_anulacion" ADD CONSTRAINT "liquidacion_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "liquidacion_anulacion_organizacion_id_idx" ON "liquidacion_anulacion"("organizacion_id");
ALTER TABLE "liquidacion_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liquidacion_anulacion_por_empresa" ON "liquidacion_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- LiquidacionReparto
ALTER TABLE "liquidacion_reparto" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "liquidacion_reparto" ADD CONSTRAINT "liquidacion_reparto_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "liquidacion_reparto_organizacion_id_idx" ON "liquidacion_reparto"("organizacion_id");
ALTER TABLE "liquidacion_reparto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "liquidacion_reparto_por_empresa" ON "liquidacion_reparto" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PagoPorCuentaTienda
ALTER TABLE "pago_por_cuenta_tienda" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "pago_por_cuenta_tienda" ADD CONSTRAINT "pago_por_cuenta_tienda_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "pago_por_cuenta_tienda_organizacion_id_idx" ON "pago_por_cuenta_tienda"("organizacion_id");
ALTER TABLE "pago_por_cuenta_tienda" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_por_cuenta_tienda_por_empresa" ON "pago_por_cuenta_tienda" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PagoPorCuentaTiendaAnulacion
ALTER TABLE "pago_por_cuenta_tienda_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "pago_por_cuenta_tienda_anulacion" ADD CONSTRAINT "pago_por_cuenta_tienda_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "pago_por_cuenta_tienda_anulacion_organizacion_id_idx" ON "pago_por_cuenta_tienda_anulacion"("organizacion_id");
ALTER TABLE "pago_por_cuenta_tienda_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pago_por_cuenta_tienda_anulacion_por_empresa" ON "pago_por_cuenta_tienda_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- CobroTiendaAnulacion
ALTER TABLE "cobro_tienda_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "cobro_tienda_anulacion" ADD CONSTRAINT "cobro_tienda_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "cobro_tienda_anulacion_organizacion_id_idx" ON "cobro_tienda_anulacion"("organizacion_id");
ALTER TABLE "cobro_tienda_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cobro_tienda_anulacion_por_empresa" ON "cobro_tienda_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AjusteCajaAnulacion
ALTER TABLE "ajuste_caja_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "ajuste_caja_anulacion" ADD CONSTRAINT "ajuste_caja_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ajuste_caja_anulacion_organizacion_id_idx" ON "ajuste_caja_anulacion"("organizacion_id");
ALTER TABLE "ajuste_caja_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ajuste_caja_anulacion_por_empresa" ON "ajuste_caja_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WalletAnotacion
ALTER TABLE "wallet_anotacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "wallet_anotacion" ADD CONSTRAINT "wallet_anotacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "wallet_anotacion_organizacion_id_idx" ON "wallet_anotacion"("organizacion_id");
ALTER TABLE "wallet_anotacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_anotacion_por_empresa" ON "wallet_anotacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RechazoTiendaCobro
ALTER TABLE "rechazo_tienda_cobro" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "rechazo_tienda_cobro" ADD CONSTRAINT "rechazo_tienda_cobro_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "rechazo_tienda_cobro_organizacion_id_idx" ON "rechazo_tienda_cobro"("organizacion_id");
ALTER TABLE "rechazo_tienda_cobro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rechazo_tienda_cobro_por_empresa" ON "rechazo_tienda_cobro" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RechazoTiendaCobroAnulacion
ALTER TABLE "rechazo_tienda_cobro_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "rechazo_tienda_cobro_anulacion" ADD CONSTRAINT "rechazo_tienda_cobro_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "rechazo_tienda_cobro_anulacion_organizacion_id_idx" ON "rechazo_tienda_cobro_anulacion"("organizacion_id");
ALTER TABLE "rechazo_tienda_cobro_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rechazo_tienda_cobro_anulacion_por_empresa" ON "rechazo_tienda_cobro_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WalletComprobante
ALTER TABLE "wallet_comprobante" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "wallet_comprobante" ADD CONSTRAINT "wallet_comprobante_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "wallet_comprobante_organizacion_id_idx" ON "wallet_comprobante"("organizacion_id");
ALTER TABLE "wallet_comprobante" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallet_comprobante_por_empresa" ON "wallet_comprobante" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AbonoTienda
ALTER TABLE "abono_tienda" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "abono_tienda" ADD CONSTRAINT "abono_tienda_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "abono_tienda_organizacion_id_idx" ON "abono_tienda"("organizacion_id");
ALTER TABLE "abono_tienda" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abono_tienda_por_empresa" ON "abono_tienda" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AbonoTiendaAnulacion
ALTER TABLE "abono_tienda_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "abono_tienda_anulacion" ADD CONSTRAINT "abono_tienda_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "abono_tienda_anulacion_organizacion_id_idx" ON "abono_tienda_anulacion"("organizacion_id");
ALTER TABLE "abono_tienda_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abono_tienda_anulacion_por_empresa" ON "abono_tienda_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AporteCapital
ALTER TABLE "aporte_capital" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "aporte_capital" ADD CONSTRAINT "aporte_capital_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "aporte_capital_organizacion_id_idx" ON "aporte_capital"("organizacion_id");
ALTER TABLE "aporte_capital" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aporte_capital_por_empresa" ON "aporte_capital" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AporteCapitalAnulacion
ALTER TABLE "aporte_capital_anulacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "aporte_capital_anulacion" ADD CONSTRAINT "aporte_capital_anulacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "aporte_capital_anulacion_organizacion_id_idx" ON "aporte_capital_anulacion"("organizacion_id");
ALTER TABLE "aporte_capital_anulacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aporte_capital_anulacion_por_empresa" ON "aporte_capital_anulacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- GastoFijoCobro
ALTER TABLE "gasto_fijo_cobro" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "gasto_fijo_cobro" ADD CONSTRAINT "gasto_fijo_cobro_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "gasto_fijo_cobro_organizacion_id_idx" ON "gasto_fijo_cobro"("organizacion_id");
ALTER TABLE "gasto_fijo_cobro" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gasto_fijo_cobro_por_empresa" ON "gasto_fijo_cobro" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- DevolucionTiendaComprobante
ALTER TABLE "devolucion_tienda_comprobante" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "devolucion_tienda_comprobante" ADD CONSTRAINT "devolucion_tienda_comprobante_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "devolucion_tienda_comprobante_organizacion_id_idx" ON "devolucion_tienda_comprobante"("organizacion_id");
ALTER TABLE "devolucion_tienda_comprobante" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devolucion_tienda_comprobante_por_empresa" ON "devolucion_tienda_comprobante" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- DevolucionTiendaEvidencia
ALTER TABLE "devolucion_tienda_evidencia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "devolucion_tienda_evidencia" ADD CONSTRAINT "devolucion_tienda_evidencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "devolucion_tienda_evidencia_organizacion_id_idx" ON "devolucion_tienda_evidencia"("organizacion_id");
ALTER TABLE "devolucion_tienda_evidencia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devolucion_tienda_evidencia_por_empresa" ON "devolucion_tienda_evidencia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- DevolucionTiendaOrden
ALTER TABLE "devolucion_tienda_orden" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "devolucion_tienda_orden" ADD CONSTRAINT "devolucion_tienda_orden_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "devolucion_tienda_orden_organizacion_id_idx" ON "devolucion_tienda_orden"("organizacion_id");
ALTER TABLE "devolucion_tienda_orden" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devolucion_tienda_orden_por_empresa" ON "devolucion_tienda_orden" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- PlantillaMensaje
ALTER TABLE "plantilla_mensaje" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "plantilla_mensaje" ADD CONSTRAINT "plantilla_mensaje_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "plantilla_mensaje_organizacion_id_idx" ON "plantilla_mensaje"("organizacion_id");
ALTER TABLE "plantilla_mensaje" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plantilla_mensaje_por_empresa" ON "plantilla_mensaje" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- ChatConversacion
ALTER TABLE "chat_conversacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "chat_conversacion" ADD CONSTRAINT "chat_conversacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "chat_conversacion_organizacion_id_idx" ON "chat_conversacion"("organizacion_id");
ALTER TABLE "chat_conversacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_conversacion_por_empresa" ON "chat_conversacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- ChatMensaje
ALTER TABLE "chat_mensaje" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "chat_mensaje" ADD CONSTRAINT "chat_mensaje_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "chat_mensaje_organizacion_id_idx" ON "chat_mensaje"("organizacion_id");
ALTER TABLE "chat_mensaje" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_mensaje_por_empresa" ON "chat_mensaje" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- Notificacion
ALTER TABLE "notificacion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "notificacion_organizacion_id_idx" ON "notificacion"("organizacion_id");
ALTER TABLE "notificacion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacion_por_empresa" ON "notificacion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- NotificacionLectura
ALTER TABLE "notificacion_lectura" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "notificacion_lectura" ADD CONSTRAINT "notificacion_lectura_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "notificacion_lectura_organizacion_id_idx" ON "notificacion_lectura"("organizacion_id");
ALTER TABLE "notificacion_lectura" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notificacion_lectura_por_empresa" ON "notificacion_lectura" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WhatsappEnvio
ALTER TABLE "whatsapp_envio" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "whatsapp_envio" ADD CONSTRAINT "whatsapp_envio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "whatsapp_envio_organizacion_id_idx" ON "whatsapp_envio"("organizacion_id");
ALTER TABLE "whatsapp_envio" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_envio_por_empresa" ON "whatsapp_envio" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WhatsappEnvioDestinatario
ALTER TABLE "whatsapp_envio_destinatario" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "whatsapp_envio_destinatario" ADD CONSTRAINT "whatsapp_envio_destinatario_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "whatsapp_envio_destinatario_organizacion_id_idx" ON "whatsapp_envio_destinatario"("organizacion_id");
ALTER TABLE "whatsapp_envio_destinatario" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_envio_destinatario_por_empresa" ON "whatsapp_envio_destinatario" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WhatsappEnvioEjecucion
ALTER TABLE "whatsapp_envio_ejecucion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "whatsapp_envio_ejecucion" ADD CONSTRAINT "whatsapp_envio_ejecucion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "whatsapp_envio_ejecucion_organizacion_id_idx" ON "whatsapp_envio_ejecucion"("organizacion_id");
ALTER TABLE "whatsapp_envio_ejecucion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_envio_ejecucion_por_empresa" ON "whatsapp_envio_ejecucion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- WhatsappEnvioEntrega
ALTER TABLE "whatsapp_envio_entrega" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "whatsapp_envio_entrega" ADD CONSTRAINT "whatsapp_envio_entrega_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "whatsapp_envio_entrega_organizacion_id_idx" ON "whatsapp_envio_entrega"("organizacion_id");
ALTER TABLE "whatsapp_envio_entrega" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_envio_entrega_por_empresa" ON "whatsapp_envio_entrega" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- HistorialAccion
ALTER TABLE "historial_accion" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "historial_accion" ADD CONSTRAINT "historial_accion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "historial_accion_organizacion_id_idx" ON "historial_accion"("organizacion_id");
ALTER TABLE "historial_accion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "historial_accion_por_empresa" ON "historial_accion" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- AnalyticsDaily
ALTER TABLE "analytics_daily" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "analytics_daily" ADD CONSTRAINT "analytics_daily_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "analytics_daily_organizacion_id_idx" ON "analytics_daily"("organizacion_id");
ALTER TABLE "analytics_daily" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_daily_por_empresa" ON "analytics_daily" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RankingSnapshotDia
ALTER TABLE "ranking_snapshot_dia" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "ranking_snapshot_dia" ADD CONSTRAINT "ranking_snapshot_dia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ranking_snapshot_dia_organizacion_id_idx" ON "ranking_snapshot_dia"("organizacion_id");
ALTER TABLE "ranking_snapshot_dia" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ranking_snapshot_dia_por_empresa" ON "ranking_snapshot_dia" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

-- RankingSnapshotFila
ALTER TABLE "ranking_snapshot_fila" ADD COLUMN "organizacion_id" TEXT NOT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "ranking_snapshot_fila" ADD CONSTRAINT "ranking_snapshot_fila_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "ranking_snapshot_fila_organizacion_id_idx" ON "ranking_snapshot_fila"("organizacion_id");
ALTER TABLE "ranking_snapshot_fila" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ranking_snapshot_fila_por_empresa" ON "ranking_snapshot_fila" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));

COMMIT;
