-- DOWN (SL-17 M2) — revierte `migration.sql`, tabla por tabla en orden inverso: DROP POLICY,
-- DROP INDEX, DROP CONSTRAINT y DROP COLUMN. No desactiva la RLS: las 73 ya la tenian antes de M2.
--
-- PRECONDICION RUIDOSA: si hay empresas en `organizacion` se ABORTA sin tocar nada (quitar la
-- columna borraria a que empresa pertenece cada fila).

BEGIN;

DO $$
DECLARE
  v_n bigint;
BEGIN
  SELECT count(*) FROM "organizacion" INTO v_n;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'rollback SL-17 M2: hay % empresas en organizacion; se aborta sin tocar nada', v_n;
  END IF;
END
$$;

-- RankingSnapshotFila
DROP POLICY "ranking_snapshot_fila_por_empresa" ON "ranking_snapshot_fila";
DROP INDEX "ranking_snapshot_fila_organizacion_id_idx";
ALTER TABLE "ranking_snapshot_fila" DROP CONSTRAINT "ranking_snapshot_fila_organizacion_id_fkey";
ALTER TABLE "ranking_snapshot_fila" DROP COLUMN "organizacion_id";

-- RankingSnapshotDia
DROP POLICY "ranking_snapshot_dia_por_empresa" ON "ranking_snapshot_dia";
DROP INDEX "ranking_snapshot_dia_organizacion_id_idx";
ALTER TABLE "ranking_snapshot_dia" DROP CONSTRAINT "ranking_snapshot_dia_organizacion_id_fkey";
ALTER TABLE "ranking_snapshot_dia" DROP COLUMN "organizacion_id";

-- AnalyticsDaily
DROP POLICY "analytics_daily_por_empresa" ON "analytics_daily";
DROP INDEX "analytics_daily_organizacion_id_idx";
ALTER TABLE "analytics_daily" DROP CONSTRAINT "analytics_daily_organizacion_id_fkey";
ALTER TABLE "analytics_daily" DROP COLUMN "organizacion_id";

-- HistorialAccion
DROP POLICY "historial_accion_por_empresa" ON "historial_accion";
DROP INDEX "historial_accion_organizacion_id_idx";
ALTER TABLE "historial_accion" DROP CONSTRAINT "historial_accion_organizacion_id_fkey";
ALTER TABLE "historial_accion" DROP COLUMN "organizacion_id";

-- WhatsappEnvioEntrega
DROP POLICY "whatsapp_envio_entrega_por_empresa" ON "whatsapp_envio_entrega";
DROP INDEX "whatsapp_envio_entrega_organizacion_id_idx";
ALTER TABLE "whatsapp_envio_entrega" DROP CONSTRAINT "whatsapp_envio_entrega_organizacion_id_fkey";
ALTER TABLE "whatsapp_envio_entrega" DROP COLUMN "organizacion_id";

-- WhatsappEnvioEjecucion
DROP POLICY "whatsapp_envio_ejecucion_por_empresa" ON "whatsapp_envio_ejecucion";
DROP INDEX "whatsapp_envio_ejecucion_organizacion_id_idx";
ALTER TABLE "whatsapp_envio_ejecucion" DROP CONSTRAINT "whatsapp_envio_ejecucion_organizacion_id_fkey";
ALTER TABLE "whatsapp_envio_ejecucion" DROP COLUMN "organizacion_id";

-- WhatsappEnvioDestinatario
DROP POLICY "whatsapp_envio_destinatario_por_empresa" ON "whatsapp_envio_destinatario";
DROP INDEX "whatsapp_envio_destinatario_organizacion_id_idx";
ALTER TABLE "whatsapp_envio_destinatario" DROP CONSTRAINT "whatsapp_envio_destinatario_organizacion_id_fkey";
ALTER TABLE "whatsapp_envio_destinatario" DROP COLUMN "organizacion_id";

-- WhatsappEnvio
DROP POLICY "whatsapp_envio_por_empresa" ON "whatsapp_envio";
DROP INDEX "whatsapp_envio_organizacion_id_idx";
ALTER TABLE "whatsapp_envio" DROP CONSTRAINT "whatsapp_envio_organizacion_id_fkey";
ALTER TABLE "whatsapp_envio" DROP COLUMN "organizacion_id";

-- NotificacionLectura
DROP POLICY "notificacion_lectura_por_empresa" ON "notificacion_lectura";
DROP INDEX "notificacion_lectura_organizacion_id_idx";
ALTER TABLE "notificacion_lectura" DROP CONSTRAINT "notificacion_lectura_organizacion_id_fkey";
ALTER TABLE "notificacion_lectura" DROP COLUMN "organizacion_id";

-- Notificacion
DROP POLICY "notificacion_por_empresa" ON "notificacion";
DROP INDEX "notificacion_organizacion_id_idx";
ALTER TABLE "notificacion" DROP CONSTRAINT "notificacion_organizacion_id_fkey";
ALTER TABLE "notificacion" DROP COLUMN "organizacion_id";

-- ChatMensaje
DROP POLICY "chat_mensaje_por_empresa" ON "chat_mensaje";
DROP INDEX "chat_mensaje_organizacion_id_idx";
ALTER TABLE "chat_mensaje" DROP CONSTRAINT "chat_mensaje_organizacion_id_fkey";
ALTER TABLE "chat_mensaje" DROP COLUMN "organizacion_id";

-- ChatConversacion
DROP POLICY "chat_conversacion_por_empresa" ON "chat_conversacion";
DROP INDEX "chat_conversacion_organizacion_id_idx";
ALTER TABLE "chat_conversacion" DROP CONSTRAINT "chat_conversacion_organizacion_id_fkey";
ALTER TABLE "chat_conversacion" DROP COLUMN "organizacion_id";

-- PlantillaMensaje
DROP POLICY "plantilla_mensaje_por_empresa" ON "plantilla_mensaje";
DROP INDEX "plantilla_mensaje_organizacion_id_idx";
ALTER TABLE "plantilla_mensaje" DROP CONSTRAINT "plantilla_mensaje_organizacion_id_fkey";
ALTER TABLE "plantilla_mensaje" DROP COLUMN "organizacion_id";

-- DevolucionTiendaOrden
DROP POLICY "devolucion_tienda_orden_por_empresa" ON "devolucion_tienda_orden";
DROP INDEX "devolucion_tienda_orden_organizacion_id_idx";
ALTER TABLE "devolucion_tienda_orden" DROP CONSTRAINT "devolucion_tienda_orden_organizacion_id_fkey";
ALTER TABLE "devolucion_tienda_orden" DROP COLUMN "organizacion_id";

-- DevolucionTiendaEvidencia
DROP POLICY "devolucion_tienda_evidencia_por_empresa" ON "devolucion_tienda_evidencia";
DROP INDEX "devolucion_tienda_evidencia_organizacion_id_idx";
ALTER TABLE "devolucion_tienda_evidencia" DROP CONSTRAINT "devolucion_tienda_evidencia_organizacion_id_fkey";
ALTER TABLE "devolucion_tienda_evidencia" DROP COLUMN "organizacion_id";

-- DevolucionTiendaComprobante
DROP POLICY "devolucion_tienda_comprobante_por_empresa" ON "devolucion_tienda_comprobante";
DROP INDEX "devolucion_tienda_comprobante_organizacion_id_idx";
ALTER TABLE "devolucion_tienda_comprobante" DROP CONSTRAINT "devolucion_tienda_comprobante_organizacion_id_fkey";
ALTER TABLE "devolucion_tienda_comprobante" DROP COLUMN "organizacion_id";

-- GastoFijoCobro
DROP POLICY "gasto_fijo_cobro_por_empresa" ON "gasto_fijo_cobro";
DROP INDEX "gasto_fijo_cobro_organizacion_id_idx";
ALTER TABLE "gasto_fijo_cobro" DROP CONSTRAINT "gasto_fijo_cobro_organizacion_id_fkey";
ALTER TABLE "gasto_fijo_cobro" DROP COLUMN "organizacion_id";

-- AporteCapitalAnulacion
DROP POLICY "aporte_capital_anulacion_por_empresa" ON "aporte_capital_anulacion";
DROP INDEX "aporte_capital_anulacion_organizacion_id_idx";
ALTER TABLE "aporte_capital_anulacion" DROP CONSTRAINT "aporte_capital_anulacion_organizacion_id_fkey";
ALTER TABLE "aporte_capital_anulacion" DROP COLUMN "organizacion_id";

-- AporteCapital
DROP POLICY "aporte_capital_por_empresa" ON "aporte_capital";
DROP INDEX "aporte_capital_organizacion_id_idx";
ALTER TABLE "aporte_capital" DROP CONSTRAINT "aporte_capital_organizacion_id_fkey";
ALTER TABLE "aporte_capital" DROP COLUMN "organizacion_id";

-- AbonoTiendaAnulacion
DROP POLICY "abono_tienda_anulacion_por_empresa" ON "abono_tienda_anulacion";
DROP INDEX "abono_tienda_anulacion_organizacion_id_idx";
ALTER TABLE "abono_tienda_anulacion" DROP CONSTRAINT "abono_tienda_anulacion_organizacion_id_fkey";
ALTER TABLE "abono_tienda_anulacion" DROP COLUMN "organizacion_id";

-- AbonoTienda
DROP POLICY "abono_tienda_por_empresa" ON "abono_tienda";
DROP INDEX "abono_tienda_organizacion_id_idx";
ALTER TABLE "abono_tienda" DROP CONSTRAINT "abono_tienda_organizacion_id_fkey";
ALTER TABLE "abono_tienda" DROP COLUMN "organizacion_id";

-- WalletComprobante
DROP POLICY "wallet_comprobante_por_empresa" ON "wallet_comprobante";
DROP INDEX "wallet_comprobante_organizacion_id_idx";
ALTER TABLE "wallet_comprobante" DROP CONSTRAINT "wallet_comprobante_organizacion_id_fkey";
ALTER TABLE "wallet_comprobante" DROP COLUMN "organizacion_id";

-- RechazoTiendaCobroAnulacion
DROP POLICY "rechazo_tienda_cobro_anulacion_por_empresa" ON "rechazo_tienda_cobro_anulacion";
DROP INDEX "rechazo_tienda_cobro_anulacion_organizacion_id_idx";
ALTER TABLE "rechazo_tienda_cobro_anulacion" DROP CONSTRAINT "rechazo_tienda_cobro_anulacion_organizacion_id_fkey";
ALTER TABLE "rechazo_tienda_cobro_anulacion" DROP COLUMN "organizacion_id";

-- RechazoTiendaCobro
DROP POLICY "rechazo_tienda_cobro_por_empresa" ON "rechazo_tienda_cobro";
DROP INDEX "rechazo_tienda_cobro_organizacion_id_idx";
ALTER TABLE "rechazo_tienda_cobro" DROP CONSTRAINT "rechazo_tienda_cobro_organizacion_id_fkey";
ALTER TABLE "rechazo_tienda_cobro" DROP COLUMN "organizacion_id";

-- WalletAnotacion
DROP POLICY "wallet_anotacion_por_empresa" ON "wallet_anotacion";
DROP INDEX "wallet_anotacion_organizacion_id_idx";
ALTER TABLE "wallet_anotacion" DROP CONSTRAINT "wallet_anotacion_organizacion_id_fkey";
ALTER TABLE "wallet_anotacion" DROP COLUMN "organizacion_id";

-- AjusteCajaAnulacion
DROP POLICY "ajuste_caja_anulacion_por_empresa" ON "ajuste_caja_anulacion";
DROP INDEX "ajuste_caja_anulacion_organizacion_id_idx";
ALTER TABLE "ajuste_caja_anulacion" DROP CONSTRAINT "ajuste_caja_anulacion_organizacion_id_fkey";
ALTER TABLE "ajuste_caja_anulacion" DROP COLUMN "organizacion_id";

-- CobroTiendaAnulacion
DROP POLICY "cobro_tienda_anulacion_por_empresa" ON "cobro_tienda_anulacion";
DROP INDEX "cobro_tienda_anulacion_organizacion_id_idx";
ALTER TABLE "cobro_tienda_anulacion" DROP CONSTRAINT "cobro_tienda_anulacion_organizacion_id_fkey";
ALTER TABLE "cobro_tienda_anulacion" DROP COLUMN "organizacion_id";

-- PagoPorCuentaTiendaAnulacion
DROP POLICY "pago_por_cuenta_tienda_anulacion_por_empresa" ON "pago_por_cuenta_tienda_anulacion";
DROP INDEX "pago_por_cuenta_tienda_anulacion_organizacion_id_idx";
ALTER TABLE "pago_por_cuenta_tienda_anulacion" DROP CONSTRAINT "pago_por_cuenta_tienda_anulacion_organizacion_id_fkey";
ALTER TABLE "pago_por_cuenta_tienda_anulacion" DROP COLUMN "organizacion_id";

-- PagoPorCuentaTienda
DROP POLICY "pago_por_cuenta_tienda_por_empresa" ON "pago_por_cuenta_tienda";
DROP INDEX "pago_por_cuenta_tienda_organizacion_id_idx";
ALTER TABLE "pago_por_cuenta_tienda" DROP CONSTRAINT "pago_por_cuenta_tienda_organizacion_id_fkey";
ALTER TABLE "pago_por_cuenta_tienda" DROP COLUMN "organizacion_id";

-- LiquidacionReparto
DROP POLICY "liquidacion_reparto_por_empresa" ON "liquidacion_reparto";
DROP INDEX "liquidacion_reparto_organizacion_id_idx";
ALTER TABLE "liquidacion_reparto" DROP CONSTRAINT "liquidacion_reparto_organizacion_id_fkey";
ALTER TABLE "liquidacion_reparto" DROP COLUMN "organizacion_id";

-- LiquidacionAnulacion
DROP POLICY "liquidacion_anulacion_por_empresa" ON "liquidacion_anulacion";
DROP INDEX "liquidacion_anulacion_organizacion_id_idx";
ALTER TABLE "liquidacion_anulacion" DROP CONSTRAINT "liquidacion_anulacion_organizacion_id_fkey";
ALTER TABLE "liquidacion_anulacion" DROP COLUMN "organizacion_id";

-- LiquidacionPago
DROP POLICY "liquidacion_pago_por_empresa" ON "liquidacion_pago";
DROP INDEX "liquidacion_pago_organizacion_id_idx";
ALTER TABLE "liquidacion_pago" DROP CONSTRAINT "liquidacion_pago_organizacion_id_fkey";
ALTER TABLE "liquidacion_pago" DROP COLUMN "organizacion_id";

-- PagoMensajeroMovimiento
DROP POLICY "pago_mensajero_movimiento_por_empresa" ON "pago_mensajero_movimiento";
DROP INDEX "pago_mensajero_movimiento_organizacion_id_idx";
ALTER TABLE "pago_mensajero_movimiento" DROP CONSTRAINT "pago_mensajero_movimiento_organizacion_id_fkey";
ALTER TABLE "pago_mensajero_movimiento" DROP COLUMN "organizacion_id";

-- WalletTiendaMovimiento
DROP POLICY "wallet_tienda_movimiento_por_empresa" ON "wallet_tienda_movimiento";
DROP INDEX "wallet_tienda_movimiento_organizacion_id_idx";
ALTER TABLE "wallet_tienda_movimiento" DROP CONSTRAINT "wallet_tienda_movimiento_organizacion_id_fkey";
ALTER TABLE "wallet_tienda_movimiento" DROP COLUMN "organizacion_id";

-- WalletMovimiento
DROP POLICY "wallet_movimiento_por_empresa" ON "wallet_movimiento";
DROP INDEX "wallet_movimiento_organizacion_id_idx";
ALTER TABLE "wallet_movimiento" DROP CONSTRAINT "wallet_movimiento_organizacion_id_fkey";
ALTER TABLE "wallet_movimiento" DROP COLUMN "organizacion_id";

-- CierreRechazoTienda
DROP POLICY "cierre_rechazo_tienda_por_empresa" ON "cierre_rechazo_tienda";
DROP INDEX "cierre_rechazo_tienda_organizacion_id_idx";
ALTER TABLE "cierre_rechazo_tienda" DROP CONSTRAINT "cierre_rechazo_tienda_organizacion_id_fkey";
ALTER TABLE "cierre_rechazo_tienda" DROP COLUMN "organizacion_id";

-- CierreSinGestion
DROP POLICY "cierre_sin_gestion_por_empresa" ON "cierre_sin_gestion";
DROP INDEX "cierre_sin_gestion_organizacion_id_idx";
ALTER TABLE "cierre_sin_gestion" DROP CONSTRAINT "cierre_sin_gestion_organizacion_id_fkey";
ALTER TABLE "cierre_sin_gestion" DROP COLUMN "organizacion_id";

-- CierreDetail
DROP POLICY "cierre_detail_por_empresa" ON "cierre_detail";
DROP INDEX "cierre_detail_organizacion_id_idx";
ALTER TABLE "cierre_detail" DROP CONSTRAINT "cierre_detail_organizacion_id_fkey";
ALTER TABLE "cierre_detail" DROP COLUMN "organizacion_id";

-- CierreBodega
DROP POLICY "cierre_bodega_por_empresa" ON "cierre_bodega";
DROP INDEX "cierre_bodega_organizacion_id_idx";
ALTER TABLE "cierre_bodega" DROP CONSTRAINT "cierre_bodega_organizacion_id_fkey";
ALTER TABLE "cierre_bodega" DROP COLUMN "organizacion_id";

-- CierreDia
DROP POLICY "cierre_dia_por_empresa" ON "cierre_dia";
DROP INDEX "cierre_dia_organizacion_id_idx";
ALTER TABLE "cierre_dia" DROP CONSTRAINT "cierre_dia_organizacion_id_fkey";
ALTER TABLE "cierre_dia" DROP COLUMN "organizacion_id";

-- RutaOptimizadaParada
DROP POLICY "ruta_optimizada_parada_por_empresa" ON "ruta_optimizada_parada";
DROP INDEX "ruta_optimizada_parada_organizacion_id_idx";
ALTER TABLE "ruta_optimizada_parada" DROP CONSTRAINT "ruta_optimizada_parada_organizacion_id_fkey";
ALTER TABLE "ruta_optimizada_parada" DROP COLUMN "organizacion_id";

-- RutaOptimizada
DROP POLICY "ruta_optimizada_por_empresa" ON "ruta_optimizada";
DROP INDEX "ruta_optimizada_organizacion_id_idx";
ALTER TABLE "ruta_optimizada" DROP CONSTRAINT "ruta_optimizada_organizacion_id_fkey";
ALTER TABLE "ruta_optimizada" DROP COLUMN "organizacion_id";

-- GestionFechaReprogramacionCambio
DROP POLICY "gestion_fecha_reprogramacion_cambio_por_empresa" ON "gestion_fecha_reprogramacion_cambio";
DROP INDEX "gestion_fecha_reprogramacion_cambio_organizacion_id_idx";
ALTER TABLE "gestion_fecha_reprogramacion_cambio" DROP CONSTRAINT "gestion_fecha_reprogramacion_cambio_organizacion_id_fkey";
ALTER TABLE "gestion_fecha_reprogramacion_cambio" DROP COLUMN "organizacion_id";

-- GestionOrdenPago
DROP POLICY "gestion_orden_pago_por_empresa" ON "gestion_orden_pago";
DROP INDEX "gestion_orden_pago_organizacion_id_idx";
ALTER TABLE "gestion_orden_pago" DROP CONSTRAINT "gestion_orden_pago_organizacion_id_fkey";
ALTER TABLE "gestion_orden_pago" DROP COLUMN "organizacion_id";

-- GestionOrdenEvidencia
DROP POLICY "gestion_orden_evidencia_por_empresa" ON "gestion_orden_evidencia";
DROP INDEX "gestion_orden_evidencia_organizacion_id_idx";
ALTER TABLE "gestion_orden_evidencia" DROP CONSTRAINT "gestion_orden_evidencia_organizacion_id_fkey";
ALTER TABLE "gestion_orden_evidencia" DROP COLUMN "organizacion_id";

-- GestionOrden
DROP POLICY "gestion_orden_por_empresa" ON "gestion_orden";
DROP INDEX "gestion_orden_organizacion_id_idx";
ALTER TABLE "gestion_orden" DROP CONSTRAINT "gestion_orden_organizacion_id_fkey";
ALTER TABLE "gestion_orden" DROP COLUMN "organizacion_id";

-- OrdenIncidenteEvidencia
DROP POLICY "orden_incidente_evidencia_por_empresa" ON "orden_incidente_evidencia";
DROP INDEX "orden_incidente_evidencia_organizacion_id_idx";
ALTER TABLE "orden_incidente_evidencia" DROP CONSTRAINT "orden_incidente_evidencia_organizacion_id_fkey";
ALTER TABLE "orden_incidente_evidencia" DROP COLUMN "organizacion_id";

-- OrdenIncidente
DROP POLICY "orden_incidente_por_empresa" ON "orden_incidente";
DROP INDEX "orden_incidente_organizacion_id_idx";
ALTER TABLE "orden_incidente" DROP CONSTRAINT "orden_incidente_organizacion_id_fkey";
ALTER TABLE "orden_incidente" DROP COLUMN "organizacion_id";

-- OrdenEvento
DROP POLICY "orden_evento_por_empresa" ON "orden_evento";
DROP INDEX "orden_evento_organizacion_id_idx";
ALTER TABLE "orden_evento" DROP CONSTRAINT "orden_evento_organizacion_id_fkey";
ALTER TABLE "orden_evento" DROP COLUMN "organizacion_id";

-- OrdenTraspasoMensajero
DROP POLICY "orden_traspaso_mensajero_por_empresa" ON "orden_traspaso_mensajero";
DROP INDEX "orden_traspaso_mensajero_organizacion_id_idx";
ALTER TABLE "orden_traspaso_mensajero" DROP CONSTRAINT "orden_traspaso_mensajero_organizacion_id_fkey";
ALTER TABLE "orden_traspaso_mensajero" DROP COLUMN "organizacion_id";

-- OrdenDiaRepartoCambio
DROP POLICY "orden_dia_reparto_cambio_por_empresa" ON "orden_dia_reparto_cambio";
DROP INDEX "orden_dia_reparto_cambio_organizacion_id_idx";
ALTER TABLE "orden_dia_reparto_cambio" DROP CONSTRAINT "orden_dia_reparto_cambio_organizacion_id_fkey";
ALTER TABLE "orden_dia_reparto_cambio" DROP COLUMN "organizacion_id";

-- OrdenHistorialEstado
DROP POLICY "orden_historial_estado_por_empresa" ON "orden_historial_estado";
DROP INDEX "orden_historial_estado_organizacion_id_idx";
ALTER TABLE "orden_historial_estado" DROP CONSTRAINT "orden_historial_estado_organizacion_id_fkey";
ALTER TABLE "orden_historial_estado" DROP COLUMN "organizacion_id";

-- OrdenHabilitacionApi
DROP POLICY "orden_habilitacion_api_por_empresa" ON "orden_habilitacion_api";
DROP INDEX "orden_habilitacion_api_organizacion_id_idx";
ALTER TABLE "orden_habilitacion_api" DROP CONSTRAINT "orden_habilitacion_api_organizacion_id_fkey";
ALTER TABLE "orden_habilitacion_api" DROP COLUMN "organizacion_id";

-- OrdenNota
DROP POLICY "orden_nota_por_empresa" ON "orden_nota";
DROP INDEX "orden_nota_organizacion_id_idx";
ALTER TABLE "orden_nota" DROP CONSTRAINT "orden_nota_organizacion_id_fkey";
ALTER TABLE "orden_nota" DROP COLUMN "organizacion_id";

-- OrdenMensajeroMeta
DROP POLICY "orden_mensajero_meta_por_empresa" ON "orden_mensajero_meta";
DROP INDEX "orden_mensajero_meta_organizacion_id_idx";
ALTER TABLE "orden_mensajero_meta" DROP CONSTRAINT "orden_mensajero_meta_organizacion_id_fkey";
ALTER TABLE "orden_mensajero_meta" DROP COLUMN "organizacion_id";

-- Carga
DROP POLICY "carga_por_empresa" ON "carga";
DROP INDEX "carga_organizacion_id_idx";
ALTER TABLE "carga" DROP CONSTRAINT "carga_organizacion_id_fkey";
ALTER TABLE "carga" DROP COLUMN "organizacion_id";

-- Orden
DROP POLICY "orden_por_empresa" ON "orden";
DROP INDEX "orden_organizacion_id_idx";
ALTER TABLE "orden" DROP CONSTRAINT "orden_organizacion_id_fkey";
ALTER TABLE "orden" DROP COLUMN "organizacion_id";

-- GastoFijoPlantilla
DROP POLICY "gasto_fijo_plantilla_por_empresa" ON "gasto_fijo_plantilla";
DROP INDEX "gasto_fijo_plantilla_organizacion_id_idx";
ALTER TABLE "gasto_fijo_plantilla" DROP CONSTRAINT "gasto_fijo_plantilla_organizacion_id_fkey";
ALTER TABLE "gasto_fijo_plantilla" DROP COLUMN "organizacion_id";

-- PremioRanking
DROP POLICY "premio_ranking_por_empresa" ON "premio_ranking";
DROP INDEX "premio_ranking_organizacion_id_idx";
ALTER TABLE "premio_ranking" DROP CONSTRAINT "premio_ranking_organizacion_id_fkey";
ALTER TABLE "premio_ranking" DROP COLUMN "organizacion_id";

-- TarifaZonaMensajero
DROP POLICY "tarifa_zona_mensajero_por_empresa" ON "tarifa_zona_mensajero";
DROP INDEX "tarifa_zona_mensajero_organizacion_id_idx";
ALTER TABLE "tarifa_zona_mensajero" DROP CONSTRAINT "tarifa_zona_mensajero_organizacion_id_fkey";
ALTER TABLE "tarifa_zona_mensajero" DROP COLUMN "organizacion_id";

-- Tarifa
DROP POLICY "tarifas_por_empresa" ON "tarifas";
DROP INDEX "tarifas_organizacion_id_idx";
ALTER TABLE "tarifas" DROP CONSTRAINT "tarifas_organizacion_id_fkey";
ALTER TABLE "tarifas" DROP COLUMN "organizacion_id";

-- ZonaDistrito
DROP POLICY "zona_distrito_por_empresa" ON "zona_distrito";
DROP INDEX "zona_distrito_organizacion_id_idx";
ALTER TABLE "zona_distrito" DROP CONSTRAINT "zona_distrito_organizacion_id_fkey";
ALTER TABLE "zona_distrito" DROP COLUMN "organizacion_id";

-- Zona
DROP POLICY "zona_por_empresa" ON "zona";
DROP INDEX "zona_organizacion_id_idx";
ALTER TABLE "zona" DROP CONSTRAINT "zona_organizacion_id_fkey";
ALTER TABLE "zona" DROP COLUMN "organizacion_id";

-- PostulacionRecurso
DROP POLICY "postulacion_recurso_por_empresa" ON "postulacion_recurso";
DROP INDEX "postulacion_recurso_organizacion_id_idx";
ALTER TABLE "postulacion_recurso" DROP CONSTRAINT "postulacion_recurso_organizacion_id_fkey";
ALTER TABLE "postulacion_recurso" DROP COLUMN "organizacion_id";

-- WebhookSuscripcion
DROP POLICY "webhook_suscripcion_por_empresa" ON "webhook_suscripcion";
DROP INDEX "webhook_suscripcion_organizacion_id_idx";
ALTER TABLE "webhook_suscripcion" DROP CONSTRAINT "webhook_suscripcion_organizacion_id_fkey";
ALTER TABLE "webhook_suscripcion" DROP COLUMN "organizacion_id";

-- ApiKey
DROP POLICY "api_key_por_empresa" ON "api_key";
DROP INDEX "api_key_organizacion_id_idx";
ALTER TABLE "api_key" DROP CONSTRAINT "api_key_organizacion_id_fkey";
ALTER TABLE "api_key" DROP COLUMN "organizacion_id";

-- VistaFiltro
DROP POLICY "vista_filtro_por_empresa" ON "vista_filtro";
DROP INDEX "vista_filtro_organizacion_id_idx";
ALTER TABLE "vista_filtro" DROP CONSTRAINT "vista_filtro_organizacion_id_fkey";
ALTER TABLE "vista_filtro" DROP COLUMN "organizacion_id";

-- AsistenteUsoDiario
DROP POLICY "asistente_uso_diario_por_empresa" ON "asistente_uso_diario";
DROP INDEX "asistente_uso_diario_organizacion_id_idx";
ALTER TABLE "asistente_uso_diario" DROP CONSTRAINT "asistente_uso_diario_organizacion_id_fkey";
ALTER TABLE "asistente_uso_diario" DROP COLUMN "organizacion_id";

-- PushEnvioDia
DROP POLICY "push_envio_dia_por_empresa" ON "push_envio_dia";
DROP INDEX "push_envio_dia_organizacion_id_idx";
ALTER TABLE "push_envio_dia" DROP CONSTRAINT "push_envio_dia_organizacion_id_fkey";
ALTER TABLE "push_envio_dia" DROP COLUMN "organizacion_id";

-- PushSuscripcion
DROP POLICY "push_suscripcion_por_empresa" ON "push_suscripcion";
DROP INDEX "push_suscripcion_organizacion_id_idx";
ALTER TABLE "push_suscripcion" DROP CONSTRAINT "push_suscripcion_organizacion_id_fkey";
ALTER TABLE "push_suscripcion" DROP COLUMN "organizacion_id";

-- UsuarioPreferencia
DROP POLICY "usuario_preferencia_por_empresa" ON "usuario_preferencia";
DROP INDEX "usuario_preferencia_organizacion_id_idx";
ALTER TABLE "usuario_preferencia" DROP CONSTRAINT "usuario_preferencia_organizacion_id_fkey";
ALTER TABLE "usuario_preferencia" DROP COLUMN "organizacion_id";

-- MensajeroDocumento
DROP POLICY "mensajero_documento_por_empresa" ON "mensajero_documento";
DROP INDEX "mensajero_documento_organizacion_id_idx";
ALTER TABLE "mensajero_documento" DROP CONSTRAINT "mensajero_documento_organizacion_id_fkey";
ALTER TABLE "mensajero_documento" DROP COLUMN "organizacion_id";

-- Usuario
DROP POLICY "usuario_por_empresa" ON "usuario";
DROP INDEX "usuario_organizacion_id_idx";
ALTER TABLE "usuario" DROP CONSTRAINT "usuario_organizacion_id_fkey";
ALTER TABLE "usuario" DROP COLUMN "organizacion_id";

-- La semilla del podio que quito migration.sql, igual que en `20260716130000_premio_ranking`.
INSERT INTO "premio_ranking" ("id", "posicion", "monto") VALUES
  (md5(random()::text || clock_timestamp()::text), 1, NULL),
  (md5(random()::text || clock_timestamp()::text), 2, NULL),
  (md5(random()::text || clock_timestamp()::text), 3, NULL);

COMMIT;
