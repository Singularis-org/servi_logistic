-- SL-17 M3 (design §3 M3, D15, R37–R39): misma empresa en cada FK de negocio a negocio.
-- GENERADO con `tsx scripts/generar-misma-empresa.ts`: no editar a mano.
--
--   · 150 FK de negocio a negocio: trigger `verificar_misma_empresa` (SQLSTATE SL017).
--   · 73 tablas de negocio: trigger `<tabla>_sin_cambio_de_empresa` (R38).
--   · Quedan fuera las FK a plataforma, a `organizacion` y a `jobs`, y el `usuario` referido
--     sin empresa (superadmin). Prisma no ve funciones ni triggers: no hay drift.

BEGIN;

CREATE FUNCTION verificar_misma_empresa() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tabla_ref text := TG_ARGV[0];  col_fk text := TG_ARGV[1];  col_ref text := TG_ARGV[2];
  v_fk text;  v_org_ref text;  v_encontrada boolean;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col_fk) INTO v_fk USING NEW;
  IF v_fk IS NULL THEN RETURN NEW; END IF;                        -- FK opcional sin valor
  -- La tabla referida va en el esquema del trigger (no en el search_path): asi funciona igual en
  -- un esquema desechable de test.
  EXECUTE format('SELECT organizacion_id, true FROM %I.%I WHERE %I::text = $1',
                 TG_TABLE_SCHEMA, tabla_ref, col_ref)
    INTO v_org_ref, v_encontrada USING v_fk;
  IF v_encontrada IS NULL THEN RETURN NEW; END IF;                -- inexistente: lo rechaza la FK
  IF v_org_ref IS NULL THEN RETURN NEW; END IF;                   -- usuario superadmin (D15)
  IF NEW.organizacion_id IS DISTINCT FROM v_org_ref THEN
    RAISE EXCEPTION 'referencia a otra empresa: %.% -> %', TG_TABLE_NAME, col_fk, tabla_ref
      USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION impedir_cambio_de_empresa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id THEN
    RAISE EXCEPTION 'una fila no cambia de empresa: %', TG_TABLE_NAME USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;

-- AbonoTienda.registrador
CREATE TRIGGER "sme_abono_tienda_registrado_por_b539ff48" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "abono_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- AbonoTienda.tienda
CREATE TRIGGER "sme_abono_tienda_tienda_id_b0728fb8" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "abono_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- AbonoTiendaAnulacion.abono
CREATE TRIGGER "sme_abono_tienda_anulacion_abono_id_de295dda" BEFORE INSERT OR UPDATE OF "abono_id", "organizacion_id"
  ON "abono_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('abono_tienda', 'abono_id', 'id');
-- AbonoTiendaAnulacion.anulador
CREATE TRIGGER "sme_abono_tienda_anulacion_anulado_por_fd95104f" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "abono_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- AjusteCajaAnulacion.anulador
CREATE TRIGGER "sme_ajuste_caja_anulacion_anulado_por_805eb3cf" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "ajuste_caja_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- AjusteCajaAnulacion.movimiento
CREATE TRIGGER "sme_ajuste_caja_anulacion_movimiento_id_7e5874c4" BEFORE INSERT OR UPDATE OF "movimiento_id", "organizacion_id"
  ON "ajuste_caja_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'movimiento_id', 'id');
-- AnalyticsDaily.mensajero
CREATE TRIGGER "sme_analytics_daily_mensajero_id_10327efb" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "analytics_daily" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- AnalyticsDaily.tienda
CREATE TRIGGER "sme_analytics_daily_tienda_id_29331dbf" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "analytics_daily" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- AnalyticsDaily.zona
CREATE TRIGGER "sme_analytics_daily_zona_id_90b12afb" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "analytics_daily" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- ApiKey.createdBy
CREATE TRIGGER "sme_api_key_created_by_id_15e3a479" BEFORE INSERT OR UPDATE OF "created_by_id", "organizacion_id"
  ON "api_key" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'created_by_id', 'id');
-- ApiKey.tiendaDestino
CREATE TRIGGER "sme_api_key_tienda_destino_id_12e1b4d4" BEFORE INSERT OR UPDATE OF "tienda_destino_id", "organizacion_id"
  ON "api_key" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_destino_id', 'id');
-- ApiKey.usuario
CREATE TRIGGER "sme_api_key_usuario_id_084db172" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "api_key" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- AporteCapital.registrador
CREATE TRIGGER "sme_aporte_capital_registrado_por_fb7197a3" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "aporte_capital" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- AporteCapitalAnulacion.anulador
CREATE TRIGGER "sme_aporte_capital_anulacion_anulado_por_ed46beb9" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "aporte_capital_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- AporteCapitalAnulacion.aporte
CREATE TRIGGER "sme_aporte_capital_anulacion_aporte_id_362891bf" BEFORE INSERT OR UPDATE OF "aporte_id", "organizacion_id"
  ON "aporte_capital_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('aporte_capital', 'aporte_id', 'id');
-- AsistenteUsoDiario.usuario
CREATE TRIGGER "sme_asistente_uso_diario_usuario_id_eab2a910" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "asistente_uso_diario" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- Carga.usuario
CREATE TRIGGER "sme_carga_usuario_carga_dc162f8c" BEFORE INSERT OR UPDATE OF "usuario_carga", "organizacion_id"
  ON "carga" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_carga', 'id');
-- ChatConversacion.mensajero
CREATE TRIGGER "sme_chat_conversacion_mensajero_id_56cf30bf" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "chat_conversacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- ChatConversacion.orden
CREATE TRIGGER "sme_chat_conversacion_orden_id_ad52b4e2" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "chat_conversacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- ChatMensaje.conversacion
CREATE TRIGGER "sme_chat_mensaje_conversacion_id_836b28a0" BEFORE INSERT OR UPDATE OF "conversacion_id", "organizacion_id"
  ON "chat_mensaje" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('chat_conversacion', 'conversacion_id', 'id');
-- ChatMensaje.plantilla
CREATE TRIGGER "sme_chat_mensaje_plantilla_id_27298dfc" BEFORE INSERT OR UPDATE OF "plantilla_id", "organizacion_id"
  ON "chat_mensaje" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('plantilla_mensaje', 'plantilla_id', 'id');
-- CierreBodega.conciliadoPorUsuario
CREATE TRIGGER "sme_cierre_bodega_conciliado_por_b60ce586" BEFORE INSERT OR UPDATE OF "conciliado_por", "organizacion_id"
  ON "cierre_bodega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'conciliado_por', 'id');
-- CierreBodega.resueltoPorUsuario
CREATE TRIGGER "sme_cierre_bodega_resuelto_por_87323826" BEFORE INSERT OR UPDATE OF "resuelto_por", "organizacion_id"
  ON "cierre_bodega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'resuelto_por', 'id');
-- CierreBodega.solicitadoPorUsuario
CREATE TRIGGER "sme_cierre_bodega_solicitado_por_73d7624f" BEFORE INSERT OR UPDATE OF "solicitado_por", "organizacion_id"
  ON "cierre_bodega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'solicitado_por', 'id');
-- CierreBodega.zona
CREATE TRIGGER "sme_cierre_bodega_zona_id_632e5ae0" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "cierre_bodega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- CierreDetail.cierre
CREATE TRIGGER "sme_cierre_detail_cierre_id_7bf32d37" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- CierreDetail.orden
CREATE TRIGGER "sme_cierre_detail_orden_id_3ec8c510" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- CierreDetail.tarifa
CREATE TRIGGER "sme_cierre_detail_tarifa_id_aee4b9d6" BEFORE INSERT OR UPDATE OF "tarifa_id", "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifas', 'tarifa_id', 'id');
-- CierreDetail.tienda
CREATE TRIGGER "sme_cierre_detail_tienda_id_f033ed41" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- CierreDetail.zona
CREATE TRIGGER "sme_cierre_detail_zona_id_d7ae27d3" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- CierreDia.cierreBodega
CREATE TRIGGER "sme_cierre_dia_cierre_bodega_id_aafc030d" BEFORE INSERT OR UPDATE OF "cierre_bodega_id", "organizacion_id"
  ON "cierre_dia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_bodega', 'cierre_bodega_id', 'id');
-- CierreDia.destinoZona
CREATE TRIGGER "sme_cierre_dia_destino_zona_id_00adf42e" BEFORE INSERT OR UPDATE OF "destino_zona_id", "organizacion_id"
  ON "cierre_dia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'destino_zona_id', 'id');
-- CierreDia.mensajero
CREATE TRIGGER "sme_cierre_dia_mensajero_id_34d61dac" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "cierre_dia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- CierreDia.resueltoPorUsuario
CREATE TRIGGER "sme_cierre_dia_resuelto_por_f30eba61" BEFORE INSERT OR UPDATE OF "resuelto_por", "organizacion_id"
  ON "cierre_dia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'resuelto_por', 'id');
-- CierreRechazoTienda.cierre
CREATE TRIGGER "sme_cierre_rechazo_tienda_cierre_id_99239499" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "cierre_rechazo_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- CierreRechazoTienda.gestion
CREATE TRIGGER "sme_cierre_rechazo_tienda_gestion_id_cdcc7150" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "cierre_rechazo_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');
-- CierreRechazoTienda.orden
CREATE TRIGGER "sme_cierre_rechazo_tienda_orden_id_78c5e48c" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cierre_rechazo_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- CierreSinGestion.cierre
CREATE TRIGGER "sme_cierre_sin_gestion_cierre_id_edb8946e" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "cierre_sin_gestion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- CierreSinGestion.orden
CREATE TRIGGER "sme_cierre_sin_gestion_orden_id_32beab6b" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "cierre_sin_gestion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- CobroTiendaAnulacion.anulador
CREATE TRIGGER "sme_cobro_tienda_anulacion_anulado_por_a1cb1cf8" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "cobro_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- CobroTiendaAnulacion.cobro
CREATE TRIGGER "sme_cobro_tienda_anulacion_cobro_id_ff3f1246" BEFORE INSERT OR UPDATE OF "cobro_id", "organizacion_id"
  ON "cobro_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_tienda_movimiento', 'cobro_id', 'id');
-- DevolucionTiendaComprobante.subidor
CREATE TRIGGER "sme_devolucion_tienda_comprobante_subido_por_72d2897d" BEFORE INSERT OR UPDATE OF "subido_por", "organizacion_id"
  ON "devolucion_tienda_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'subido_por', 'id');
-- DevolucionTiendaComprobante.tienda
CREATE TRIGGER "sme_devolucion_tienda_comprobante_tienda_id_8249dd65" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "devolucion_tienda_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- DevolucionTiendaEvidencia.comprobante
CREATE TRIGGER "sme_devolucion_tienda_evidencia_comprobante__0ff45ebf" BEFORE INSERT OR UPDATE OF "comprobante_id", "organizacion_id"
  ON "devolucion_tienda_evidencia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('devolucion_tienda_comprobante', 'comprobante_id', 'id');
-- DevolucionTiendaOrden.comprobante
CREATE TRIGGER "sme_devolucion_tienda_orden_comprobante_id_01b2c78f" BEFORE INSERT OR UPDATE OF "comprobante_id", "organizacion_id"
  ON "devolucion_tienda_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('devolucion_tienda_comprobante', 'comprobante_id', 'id');
-- DevolucionTiendaOrden.orden
CREATE TRIGGER "sme_devolucion_tienda_orden_orden_id_4817b007" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "devolucion_tienda_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- GastoFijoCobro.decisor
CREATE TRIGGER "sme_gasto_fijo_cobro_decidido_por_cbebe385" BEFORE INSERT OR UPDATE OF "decidido_por", "organizacion_id"
  ON "gasto_fijo_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'decidido_por', 'id');
-- GastoFijoCobro.movimiento
CREATE TRIGGER "sme_gasto_fijo_cobro_movimiento_id_84ae7e64" BEFORE INSERT OR UPDATE OF "movimiento_id", "organizacion_id"
  ON "gasto_fijo_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'movimiento_id', 'id');
-- GastoFijoCobro.plantilla
CREATE TRIGGER "sme_gasto_fijo_cobro_plantilla_id_791b653f" BEFORE INSERT OR UPDATE OF "plantilla_id", "organizacion_id"
  ON "gasto_fijo_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gasto_fijo_plantilla', 'plantilla_id', 'id');
-- GestionFechaReprogramacionCambio.actor
CREATE TRIGGER "sme_gestion_fecha_reprogramacion_cambio_acto_662c59bd" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "gestion_fecha_reprogramacion_cambio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- GestionFechaReprogramacionCambio.gestion
CREATE TRIGGER "sme_gestion_fecha_reprogramacion_cambio_gest_4c7efedc" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "gestion_fecha_reprogramacion_cambio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');
-- GestionFechaReprogramacionCambio.orden
CREATE TRIGGER "sme_gestion_fecha_reprogramacion_cambio_orde_ffe53259" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "gestion_fecha_reprogramacion_cambio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- GestionOrden.anuladaPorUsuario
CREATE TRIGGER "sme_gestion_orden_anulada_por_737b6428" BEFORE INSERT OR UPDATE OF "anulada_por", "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulada_por', 'id');
-- GestionOrden.cierre
CREATE TRIGGER "sme_gestion_orden_cierre_id_a77ffd99" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- GestionOrden.mensajero
CREATE TRIGGER "sme_gestion_orden_mensajero_id_ccc67a5b" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- GestionOrden.orden
CREATE TRIGGER "sme_gestion_orden_orden_id_125151b7" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- GestionOrden.pagosEditadosPorUsuario
CREATE TRIGGER "sme_gestion_orden_pagos_editados_por_c2d77656" BEFORE INSERT OR UPDATE OF "pagos_editados_por", "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'pagos_editados_por', 'id');
-- GestionOrdenEvidencia.gestion
CREATE TRIGGER "sme_gestion_orden_evidencia_gestion_id_3271701e" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "gestion_orden_evidencia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');
-- GestionOrdenPago.gestion
CREATE TRIGGER "sme_gestion_orden_pago_gestion_id_f75544e1" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "gestion_orden_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');
-- HistorialAccion.actor
CREATE TRIGGER "sme_historial_accion_actor_usuario_id_cf80eabc" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "historial_accion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- LiquidacionAnulacion.anulador
CREATE TRIGGER "sme_liquidacion_anulacion_anulado_por_851da486" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "liquidacion_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- LiquidacionAnulacion.pago
CREATE TRIGGER "sme_liquidacion_anulacion_pago_id_9c759ec1" BEFORE INSERT OR UPDATE OF "pago_id", "organizacion_id"
  ON "liquidacion_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('liquidacion_pago', 'pago_id', 'id');
-- LiquidacionPago.cierre
CREATE TRIGGER "sme_liquidacion_pago_cierre_id_a28723a0" BEFORE INSERT OR UPDATE OF "cierre_id", "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('cierre_dia', 'cierre_id', 'id');
-- LiquidacionPago.mensajero
CREATE TRIGGER "sme_liquidacion_pago_mensajero_id_c349e1dc" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- LiquidacionPago.registrador
CREATE TRIGGER "sme_liquidacion_pago_registrado_por_c6ded2f3" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- LiquidacionPago.reparto
CREATE TRIGGER "sme_liquidacion_pago_reparto_id_8de9c7de" BEFORE INSERT OR UPDATE OF "reparto_id", "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('liquidacion_reparto', 'reparto_id', 'id');
-- LiquidacionPago.tienda
CREATE TRIGGER "sme_liquidacion_pago_tienda_id_d1875c20" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- LiquidacionReparto.mensajero
CREATE TRIGGER "sme_liquidacion_reparto_mensajero_id_e63da04b" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "liquidacion_reparto" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- LiquidacionReparto.registrador
CREATE TRIGGER "sme_liquidacion_reparto_registrado_por_45af7606" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "liquidacion_reparto" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- MensajeroDocumento.usuario
CREATE TRIGGER "sme_mensajero_documento_usuario_id_db9e8b23" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "mensajero_documento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- Notificacion.destinatarioUsuario
CREATE TRIGGER "sme_notificacion_destinatario_usuario_id_fbb183a9" BEFORE INSERT OR UPDATE OF "destinatario_usuario_id", "organizacion_id"
  ON "notificacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'destinatario_usuario_id', 'id');
-- Notificacion.tienda
CREATE TRIGGER "sme_notificacion_tienda_id_f838abbc" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "notificacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- Notificacion.zona
CREATE TRIGGER "sme_notificacion_zona_id_27a13977" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "notificacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- NotificacionLectura.notificacion
CREATE TRIGGER "sme_notificacion_lectura_notificacion_id_4278585d" BEFORE INSERT OR UPDATE OF "notificacion_id", "organizacion_id"
  ON "notificacion_lectura" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('notificacion', 'notificacion_id', 'id');
-- NotificacionLectura.usuario
CREATE TRIGGER "sme_notificacion_lectura_usuario_id_11f5d0f9" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "notificacion_lectura" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- Orden.carga
CREATE TRIGGER "sme_orden_carga_id_e0190378" BEFORE INSERT OR UPDATE OF "carga_id", "organizacion_id"
  ON "orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('carga', 'carga_id', 'id');
-- Orden.mensajeroAsignado
CREATE TRIGGER "sme_orden_mensajero_asignado_id_cb6253d0" BEFORE INSERT OR UPDATE OF "mensajero_asignado_id", "organizacion_id"
  ON "orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_asignado_id', 'id');
-- Orden.tienda
CREATE TRIGGER "sme_orden_tienda_id_c85426db" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- Orden.zona
CREATE TRIGGER "sme_orden_zona_id_942fe314" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "orden" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- OrdenDiaRepartoCambio.actor
CREATE TRIGGER "sme_orden_dia_reparto_cambio_actor_usuario_i_62e0a12d" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "orden_dia_reparto_cambio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- OrdenDiaRepartoCambio.orden
CREATE TRIGGER "sme_orden_dia_reparto_cambio_orden_id_e9e870a2" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_dia_reparto_cambio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenEvento.actor
CREATE TRIGGER "sme_orden_evento_actor_usuario_id_e7f54c82" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "orden_evento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- OrdenEvento.gestion
CREATE TRIGGER "sme_orden_evento_gestion_orden_id_64234b5b" BEFORE INSERT OR UPDATE OF "gestion_orden_id", "organizacion_id"
  ON "orden_evento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_orden_id', 'id');
-- OrdenEvento.mensajero
CREATE TRIGGER "sme_orden_evento_mensajero_id_18e8abad" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "orden_evento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- OrdenEvento.orden
CREATE TRIGGER "sme_orden_evento_orden_id_d9ab8955" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_evento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenHabilitacionApi.actor
CREATE TRIGGER "sme_orden_habilitacion_api_actor_usuario_id_9776bb39" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "orden_habilitacion_api" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- OrdenHabilitacionApi.orden
CREATE TRIGGER "sme_orden_habilitacion_api_orden_id_b4116b68" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_habilitacion_api" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenHistorialEstado.actor
CREATE TRIGGER "sme_orden_historial_estado_actor_usuario_id_e9ed12cf" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "orden_historial_estado" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- OrdenHistorialEstado.gestion
CREATE TRIGGER "sme_orden_historial_estado_gestion_orden_id_5b2e3740" BEFORE INSERT OR UPDATE OF "gestion_orden_id", "organizacion_id"
  ON "orden_historial_estado" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_orden_id', 'id');
-- OrdenHistorialEstado.orden
CREATE TRIGGER "sme_orden_historial_estado_orden_id_037a3d1b" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_historial_estado" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenIncidente.orden
CREATE TRIGGER "sme_orden_incidente_orden_id_037b2eca" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_incidente" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenIncidente.reportadoPorUsuario
CREATE TRIGGER "sme_orden_incidente_reportado_por_410e35dd" BEFORE INSERT OR UPDATE OF "reportado_por", "organizacion_id"
  ON "orden_incidente" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'reportado_por', 'id');
-- OrdenIncidente.resueltoPorUsuario
CREATE TRIGGER "sme_orden_incidente_resuelto_por_546de8dc" BEFORE INSERT OR UPDATE OF "resuelto_por", "organizacion_id"
  ON "orden_incidente" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'resuelto_por', 'id');
-- OrdenIncidenteEvidencia.incidente
CREATE TRIGGER "sme_orden_incidente_evidencia_incidente_id_2a34c41d" BEFORE INSERT OR UPDATE OF "incidente_id", "organizacion_id"
  ON "orden_incidente_evidencia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden_incidente', 'incidente_id', 'id');
-- OrdenMensajeroMeta.orden
CREATE TRIGGER "sme_orden_mensajero_meta_orden_id_ffc0c6b0" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_mensajero_meta" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenMensajeroMeta.usuario
CREATE TRIGGER "sme_orden_mensajero_meta_usuario_id_af206f88" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "orden_mensajero_meta" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- OrdenNota.autor
CREATE TRIGGER "sme_orden_nota_autor_id_83f9b132" BEFORE INSERT OR UPDATE OF "autor_id", "organizacion_id"
  ON "orden_nota" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'autor_id', 'id');
-- OrdenNota.orden
CREATE TRIGGER "sme_orden_nota_orden_id_c54184f6" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_nota" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- OrdenTraspasoMensajero.actor
CREATE TRIGGER "sme_orden_traspaso_mensajero_actor_usuario_i_4b4d36e3" BEFORE INSERT OR UPDATE OF "actor_usuario_id", "organizacion_id"
  ON "orden_traspaso_mensajero" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'actor_usuario_id', 'id');
-- OrdenTraspasoMensajero.mensajeroAnterior
CREATE TRIGGER "sme_orden_traspaso_mensajero_mensajero_anter_20df2394" BEFORE INSERT OR UPDATE OF "mensajero_anterior_id", "organizacion_id"
  ON "orden_traspaso_mensajero" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_anterior_id', 'id');
-- OrdenTraspasoMensajero.mensajeroNuevo
CREATE TRIGGER "sme_orden_traspaso_mensajero_mensajero_nuevo_954f62ae" BEFORE INSERT OR UPDATE OF "mensajero_nuevo_id", "organizacion_id"
  ON "orden_traspaso_mensajero" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_nuevo_id', 'id');
-- OrdenTraspasoMensajero.orden
CREATE TRIGGER "sme_orden_traspaso_mensajero_orden_id_b849df0d" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "orden_traspaso_mensajero" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- PagoMensajeroMovimiento.mensajero
CREATE TRIGGER "sme_pago_mensajero_movimiento_mensajero_id_ac7d9dab" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "pago_mensajero_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- PagoMensajeroMovimiento.registrador
CREATE TRIGGER "sme_pago_mensajero_movimiento_registrado_por_98ed0b73" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "pago_mensajero_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- PagoPorCuentaTienda.registrador
CREATE TRIGGER "sme_pago_por_cuenta_tienda_registrado_por_44ecca29" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "pago_por_cuenta_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- PagoPorCuentaTienda.tienda
CREATE TRIGGER "sme_pago_por_cuenta_tienda_tienda_id_3e4f2d67" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "pago_por_cuenta_tienda" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- PagoPorCuentaTiendaAnulacion.anulador
CREATE TRIGGER "sme_pago_por_cuenta_tienda_anulacion_anulado_ebc7b898" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "pago_por_cuenta_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- PagoPorCuentaTiendaAnulacion.pago
CREATE TRIGGER "sme_pago_por_cuenta_tienda_anulacion_pago_id_f47bd6eb" BEFORE INSERT OR UPDATE OF "pago_id", "organizacion_id"
  ON "pago_por_cuenta_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('pago_por_cuenta_tienda', 'pago_id', 'id');
-- PlantillaMensaje.creador
CREATE TRIGGER "sme_plantilla_mensaje_created_by_36e82b43" BEFORE INSERT OR UPDATE OF "created_by", "organizacion_id"
  ON "plantilla_mensaje" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'created_by', 'id');
-- PostulacionRecurso.atendidaPor
CREATE TRIGGER "sme_postulacion_recurso_atendida_por_id_af5c44c6" BEFORE INSERT OR UPDATE OF "atendida_por_id", "organizacion_id"
  ON "postulacion_recurso" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'atendida_por_id', 'id');
-- PushEnvioDia.usuario
CREATE TRIGGER "sme_push_envio_dia_usuario_id_cc8ebbd6" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "push_envio_dia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- PushSuscripcion.usuario
CREATE TRIGGER "sme_push_suscripcion_usuario_id_a032c10e" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "push_suscripcion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- RankingSnapshotFila.mensajero
CREATE TRIGGER "sme_ranking_snapshot_fila_mensajero_id_9827cc38" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "ranking_snapshot_fila" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- RankingSnapshotFila.snapshot
CREATE TRIGGER "sme_ranking_snapshot_fila_snapshot_id_a79317b8" BEFORE INSERT OR UPDATE OF "snapshot_id", "organizacion_id"
  ON "ranking_snapshot_fila" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('ranking_snapshot_dia', 'snapshot_id', 'id');
-- RechazoTiendaCobro.decisor
CREATE TRIGGER "sme_rechazo_tienda_cobro_decidido_por_9e2e308e" BEFORE INSERT OR UPDATE OF "decidido_por", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'decidido_por', 'id');
-- RechazoTiendaCobro.gestion
CREATE TRIGGER "sme_rechazo_tienda_cobro_gestion_id_8f36d9af" BEFORE INSERT OR UPDATE OF "gestion_id", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('gestion_orden', 'gestion_id', 'id');
-- RechazoTiendaCobro.orden
CREATE TRIGGER "sme_rechazo_tienda_cobro_orden_id_9047a875" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- RechazoTiendaCobro.tarifa
CREATE TRIGGER "sme_rechazo_tienda_cobro_tarifa_id_d9728558" BEFORE INSERT OR UPDATE OF "tarifa_id", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('tarifas', 'tarifa_id', 'id');
-- RechazoTiendaCobro.tienda
CREATE TRIGGER "sme_rechazo_tienda_cobro_tienda_id_5c9eaacc" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- RechazoTiendaCobroAnulacion.anulador
CREATE TRIGGER "sme_rechazo_tienda_cobro_anulacion_anulado_p_8b0616f3" BEFORE INSERT OR UPDATE OF "anulado_por", "organizacion_id"
  ON "rechazo_tienda_cobro_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'anulado_por', 'id');
-- RechazoTiendaCobroAnulacion.cobro
CREATE TRIGGER "sme_rechazo_tienda_cobro_anulacion_cobro_id_eea67dc2" BEFORE INSERT OR UPDATE OF "cobro_id", "organizacion_id"
  ON "rechazo_tienda_cobro_anulacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('rechazo_tienda_cobro', 'cobro_id', 'id');
-- RutaOptimizada.mensajero
CREATE TRIGGER "sme_ruta_optimizada_mensajero_id_ee704bd7" BEFORE INSERT OR UPDATE OF "mensajero_id", "organizacion_id"
  ON "ruta_optimizada" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'mensajero_id', 'id');
-- RutaOptimizadaParada.orden
CREATE TRIGGER "sme_ruta_optimizada_parada_orden_id_c4d4fb5b" BEFORE INSERT OR UPDATE OF "orden_id", "organizacion_id"
  ON "ruta_optimizada_parada" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_id', 'id');
-- RutaOptimizadaParada.ruta
CREATE TRIGGER "sme_ruta_optimizada_parada_ruta_id_5ab783db" BEFORE INSERT OR UPDATE OF "ruta_id", "organizacion_id"
  ON "ruta_optimizada_parada" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('ruta_optimizada', 'ruta_id', 'id');
-- TarifaZonaMensajero.zona
CREATE TRIGGER "sme_tarifa_zona_mensajero_zona_id_b926a4d0" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "tarifa_zona_mensajero" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- Tarifa.tienda
CREATE TRIGGER "sme_tarifas_tienda_id_d2e92c3c" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "tarifas" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- Tarifa.zona
CREATE TRIGGER "sme_tarifas_zona_id_73ce47f7" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "tarifas" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- Usuario.ordenEnGestion
CREATE TRIGGER "sme_usuario_orden_en_gestion_id_a17ef3c9" BEFORE INSERT OR UPDATE OF "orden_en_gestion_id", "organizacion_id"
  ON "usuario" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('orden', 'orden_en_gestion_id', 'id');
-- Usuario.zona
CREATE TRIGGER "sme_usuario_zona_id_a217d598" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "usuario" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');
-- UsuarioPreferencia.usuario
CREATE TRIGGER "sme_usuario_preferencia_usuario_id_87f59440" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "usuario_preferencia" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- VistaFiltro.usuario
CREATE TRIGGER "sme_vista_filtro_usuario_id_340be237" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "vista_filtro" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- WalletAnotacion.movimiento
CREATE TRIGGER "sme_wallet_anotacion_movimiento_id_3d784301" BEFORE INSERT OR UPDATE OF "movimiento_id", "organizacion_id"
  ON "wallet_anotacion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'movimiento_id', 'id');
-- WalletComprobante.cajaMovimiento
CREATE TRIGGER "sme_wallet_comprobante_caja_movimiento_id_a74d7190" BEFORE INSERT OR UPDATE OF "caja_movimiento_id", "organizacion_id"
  ON "wallet_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_movimiento', 'caja_movimiento_id', 'id');
-- WalletComprobante.liquidacionPago
CREATE TRIGGER "sme_wallet_comprobante_liquidacion_pago_id_b9b12093" BEFORE INSERT OR UPDATE OF "liquidacion_pago_id", "organizacion_id"
  ON "wallet_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('liquidacion_pago', 'liquidacion_pago_id', 'id');
-- WalletComprobante.subidor
CREATE TRIGGER "sme_wallet_comprobante_subido_por_a473a836" BEFORE INSERT OR UPDATE OF "subido_por", "organizacion_id"
  ON "wallet_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'subido_por', 'id');
-- WalletComprobante.tiendaMovimiento
CREATE TRIGGER "sme_wallet_comprobante_tienda_movimiento_id_cfe4f11c" BEFORE INSERT OR UPDATE OF "tienda_movimiento_id", "organizacion_id"
  ON "wallet_comprobante" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('wallet_tienda_movimiento', 'tienda_movimiento_id', 'id');
-- WalletMovimiento.registrador
CREATE TRIGGER "sme_wallet_movimiento_registrado_por_a3b13386" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "wallet_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- WalletTiendaMovimiento.registrador
CREATE TRIGGER "sme_wallet_tienda_movimiento_registrado_por_2dc84db1" BEFORE INSERT OR UPDATE OF "registrado_por", "organizacion_id"
  ON "wallet_tienda_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'registrado_por', 'id');
-- WalletTiendaMovimiento.tienda
CREATE TRIGGER "sme_wallet_tienda_movimiento_tienda_id_c8fc54ba" BEFORE INSERT OR UPDATE OF "tienda_id", "organizacion_id"
  ON "wallet_tienda_movimiento" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'tienda_id', 'id');
-- WebhookSuscripcion.owner
CREATE TRIGGER "sme_webhook_suscripcion_owner_usuario_id_d6cc2a0c" BEFORE INSERT OR UPDATE OF "owner_usuario_id", "organizacion_id"
  ON "webhook_suscripcion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'owner_usuario_id', 'id');
-- WhatsappEnvio.creador
CREATE TRIGGER "sme_whatsapp_envio_created_by_ee98b504" BEFORE INSERT OR UPDATE OF "created_by", "organizacion_id"
  ON "whatsapp_envio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'created_by', 'id');
-- WhatsappEnvio.plantilla
CREATE TRIGGER "sme_whatsapp_envio_plantilla_id_bd280b92" BEFORE INSERT OR UPDATE OF "plantilla_id", "organizacion_id"
  ON "whatsapp_envio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('plantilla_mensaje', 'plantilla_id', 'id');
-- WhatsappEnvio.actualizador
CREATE TRIGGER "sme_whatsapp_envio_updated_by_d8e048b9" BEFORE INSERT OR UPDATE OF "updated_by", "organizacion_id"
  ON "whatsapp_envio" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'updated_by', 'id');
-- WhatsappEnvioDestinatario.envio
CREATE TRIGGER "sme_whatsapp_envio_destinatario_envio_id_8a2d2c8a" BEFORE INSERT OR UPDATE OF "envio_id", "organizacion_id"
  ON "whatsapp_envio_destinatario" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('whatsapp_envio', 'envio_id', 'id');
-- WhatsappEnvioDestinatario.usuario
CREATE TRIGGER "sme_whatsapp_envio_destinatario_usuario_id_7baf9949" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "whatsapp_envio_destinatario" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- WhatsappEnvioEjecucion.envio
CREATE TRIGGER "sme_whatsapp_envio_ejecucion_envio_id_a94bf936" BEFORE INSERT OR UPDATE OF "envio_id", "organizacion_id"
  ON "whatsapp_envio_ejecucion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('whatsapp_envio', 'envio_id', 'id');
-- WhatsappEnvioEjecucion.solicitante
CREATE TRIGGER "sme_whatsapp_envio_ejecucion_solicitada_por_f64f8488" BEFORE INSERT OR UPDATE OF "solicitada_por", "organizacion_id"
  ON "whatsapp_envio_ejecucion" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'solicitada_por', 'id');
-- WhatsappEnvioEntrega.ejecucion
CREATE TRIGGER "sme_whatsapp_envio_entrega_ejecucion_id_3c947efd" BEFORE INSERT OR UPDATE OF "ejecucion_id", "organizacion_id"
  ON "whatsapp_envio_entrega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('whatsapp_envio_ejecucion', 'ejecucion_id', 'id');
-- WhatsappEnvioEntrega.usuario
CREATE TRIGGER "sme_whatsapp_envio_entrega_usuario_id_7f9d64ef" BEFORE INSERT OR UPDATE OF "usuario_id", "organizacion_id"
  ON "whatsapp_envio_entrega" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('usuario', 'usuario_id', 'id');
-- ZonaDistrito.zona
CREATE TRIGGER "sme_zona_distrito_zona_id_96e43b84" BEFORE INSERT OR UPDATE OF "zona_id", "organizacion_id"
  ON "zona_distrito" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('zona', 'zona_id', 'id');

CREATE TRIGGER "usuario_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "usuario" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "mensajero_documento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "mensajero_documento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "usuario_preferencia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "usuario_preferencia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "push_suscripcion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "push_suscripcion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "push_envio_dia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "push_envio_dia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "asistente_uso_diario_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "asistente_uso_diario" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "vista_filtro_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "vista_filtro" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "api_key_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "api_key" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "webhook_suscripcion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "webhook_suscripcion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "postulacion_recurso_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "postulacion_recurso" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "zona_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "zona" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "zona_distrito_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "zona_distrito" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "tarifas_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "tarifas" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "tarifa_zona_mensajero_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "tarifa_zona_mensajero" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "premio_ranking_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "premio_ranking" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gasto_fijo_plantilla_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gasto_fijo_plantilla" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "carga_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "carga" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_mensajero_meta_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_mensajero_meta" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_nota_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_nota" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_habilitacion_api_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_habilitacion_api" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_historial_estado_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_historial_estado" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_dia_reparto_cambio_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_dia_reparto_cambio" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_traspaso_mensajero_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_traspaso_mensajero" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_evento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_evento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_incidente_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_incidente" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "orden_incidente_evidencia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "orden_incidente_evidencia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gestion_orden_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_orden" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gestion_orden_evidencia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_orden_evidencia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gestion_orden_pago_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_orden_pago" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gestion_fecha_reprogramacion_cambio_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gestion_fecha_reprogramacion_cambio" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "ruta_optimizada_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "ruta_optimizada" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "ruta_optimizada_parada_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "ruta_optimizada_parada" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_dia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_dia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_bodega_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_bodega" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_detail_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_detail" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_sin_gestion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_sin_gestion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cierre_rechazo_tienda_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cierre_rechazo_tienda" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "wallet_movimiento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "wallet_movimiento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "wallet_tienda_movimiento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "wallet_tienda_movimiento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "pago_mensajero_movimiento_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_mensajero_movimiento" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "liquidacion_pago_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "liquidacion_pago" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "liquidacion_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "liquidacion_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "liquidacion_reparto_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "liquidacion_reparto" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "pago_por_cuenta_tienda_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_por_cuenta_tienda" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "pago_por_cuenta_tienda_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "pago_por_cuenta_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "cobro_tienda_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "cobro_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "ajuste_caja_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "ajuste_caja_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "wallet_anotacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "wallet_anotacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "rechazo_tienda_cobro_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "rechazo_tienda_cobro" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "rechazo_tienda_cobro_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "rechazo_tienda_cobro_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "wallet_comprobante_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "wallet_comprobante" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "abono_tienda_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "abono_tienda" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "abono_tienda_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "abono_tienda_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "aporte_capital_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "aporte_capital" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "aporte_capital_anulacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "aporte_capital_anulacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "gasto_fijo_cobro_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "gasto_fijo_cobro" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "devolucion_tienda_comprobante_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "devolucion_tienda_comprobante" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "devolucion_tienda_evidencia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "devolucion_tienda_evidencia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "devolucion_tienda_orden_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "devolucion_tienda_orden" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "plantilla_mensaje_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "plantilla_mensaje" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "chat_conversacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "chat_conversacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "chat_mensaje_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "chat_mensaje" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "notificacion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "notificacion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "notificacion_lectura_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "notificacion_lectura" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "whatsapp_envio_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "whatsapp_envio" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "whatsapp_envio_destinatario_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "whatsapp_envio_destinatario" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "whatsapp_envio_ejecucion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "whatsapp_envio_ejecucion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "whatsapp_envio_entrega_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "whatsapp_envio_entrega" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "historial_accion_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "historial_accion" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "analytics_daily_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "analytics_daily" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "ranking_snapshot_dia_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "ranking_snapshot_dia" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
CREATE TRIGGER "ranking_snapshot_fila_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "ranking_snapshot_fila" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();

COMMIT;
