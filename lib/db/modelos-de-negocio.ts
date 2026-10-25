// Clasificacion de los modelos de `db/schema.prisma` (SL-17, design §2): la UNICA lista que leen la
// extension de aislamiento, las guardias y el generador de migraciones.
//
//   · negocio    (75): llevan `organizacion_id`; la extension filtra y la RLS manda.
//   · plataforma (15): catalogos, geografia, autenticacion previa a la empresa, cache tecnica y el
//                      valor global del cobro por orden (SL-40).
//   · diferidos   (1): tienen ficha propia que decide su aislamiento.
//
// Modulo puro: sin Prisma ni next, para que lo importen la extension, los scripts y los tests.
// Un modelo nuevo en el esquema tiene que entrar en una de las tres listas (R5, guardia R23).

export type ModeloClasificado = {
  /** Nombre del modelo en Prisma, tal cual llega a `$allOperations` (p. ej. "Orden"). */
  readonly modelo: string;
  /** Nombre real de la tabla (`@@map`), p. ej. "orden" o "Session". */
  readonly tabla: string;
};

export type ModeloDiferido = ModeloClasificado & {
  readonly ficha: `SL-${number}`;
  readonly motivo: string;
};

// §2.1. Orden por area, como en el design.
export const MODELOS_DE_NEGOCIO: readonly ModeloClasificado[] = [
  // Personas
  { modelo: "Usuario", tabla: "usuario" },
  { modelo: "MensajeroDocumento", tabla: "mensajero_documento" },
  { modelo: "UsuarioPreferencia", tabla: "usuario_preferencia" },
  { modelo: "PushSuscripcion", tabla: "push_suscripcion" },
  { modelo: "PushEnvioDia", tabla: "push_envio_dia" },
  { modelo: "AsistenteUsoDiario", tabla: "asistente_uso_diario" },
  { modelo: "VistaFiltro", tabla: "vista_filtro" },
  { modelo: "ApiKey", tabla: "api_key" },
  { modelo: "WebhookSuscripcion", tabla: "webhook_suscripcion" },
  { modelo: "PostulacionRecurso", tabla: "postulacion_recurso" },
  // Zonas y tarifas
  { modelo: "Zona", tabla: "zona" },
  { modelo: "ZonaDistrito", tabla: "zona_distrito" },
  { modelo: "DistritoZonaEspecial", tabla: "distrito_zona_especial" }, // SL-38
  { modelo: "Tarifa", tabla: "tarifas" },
  { modelo: "TarifaZonaMensajero", tabla: "tarifa_zona_mensajero" },
  { modelo: "PremioRanking", tabla: "premio_ranking" },
  { modelo: "GastoFijoPlantilla", tabla: "gasto_fijo_plantilla" },
  // Ordenes
  { modelo: "Orden", tabla: "orden" },
  { modelo: "Carga", tabla: "carga" },
  { modelo: "OrdenMensajeroMeta", tabla: "orden_mensajero_meta" },
  { modelo: "OrdenNota", tabla: "orden_nota" },
  { modelo: "OrdenHabilitacionApi", tabla: "orden_habilitacion_api" },
  { modelo: "OrdenHistorialEstado", tabla: "orden_historial_estado" },
  { modelo: "OrdenDiaRepartoCambio", tabla: "orden_dia_reparto_cambio" },
  { modelo: "OrdenTraspasoMensajero", tabla: "orden_traspaso_mensajero" },
  { modelo: "OrdenEvento", tabla: "orden_evento" },
  { modelo: "OrdenIncidente", tabla: "orden_incidente" },
  { modelo: "OrdenIncidenteEvidencia", tabla: "orden_incidente_evidencia" },
  // Gestion
  { modelo: "GestionOrden", tabla: "gestion_orden" },
  { modelo: "GestionOrdenEvidencia", tabla: "gestion_orden_evidencia" },
  { modelo: "GestionOrdenPago", tabla: "gestion_orden_pago" },
  { modelo: "GestionFechaReprogramacionCambio", tabla: "gestion_fecha_reprogramacion_cambio" },
  { modelo: "RutaOptimizada", tabla: "ruta_optimizada" },
  { modelo: "RutaOptimizadaParada", tabla: "ruta_optimizada_parada" },
  // Cierres
  { modelo: "CierreDia", tabla: "cierre_dia" },
  { modelo: "CierreBodega", tabla: "cierre_bodega" },
  { modelo: "CierreDetail", tabla: "cierre_detail" },
  { modelo: "CierreSinGestion", tabla: "cierre_sin_gestion" },
  { modelo: "CierreRechazoTienda", tabla: "cierre_rechazo_tienda" },
  // Dinero
  { modelo: "WalletMovimiento", tabla: "wallet_movimiento" },
  { modelo: "WalletTiendaMovimiento", tabla: "wallet_tienda_movimiento" },
  { modelo: "PagoMensajeroMovimiento", tabla: "pago_mensajero_movimiento" },
  { modelo: "LiquidacionPago", tabla: "liquidacion_pago" },
  { modelo: "LiquidacionAnulacion", tabla: "liquidacion_anulacion" },
  { modelo: "LiquidacionReparto", tabla: "liquidacion_reparto" },
  { modelo: "PagoPorCuentaTienda", tabla: "pago_por_cuenta_tienda" },
  { modelo: "PagoPorCuentaTiendaAnulacion", tabla: "pago_por_cuenta_tienda_anulacion" },
  { modelo: "CobroTiendaAnulacion", tabla: "cobro_tienda_anulacion" },
  { modelo: "AjusteCajaAnulacion", tabla: "ajuste_caja_anulacion" },
  { modelo: "WalletAnotacion", tabla: "wallet_anotacion" },
  { modelo: "RechazoTiendaCobro", tabla: "rechazo_tienda_cobro" },
  { modelo: "RechazoTiendaCobroAnulacion", tabla: "rechazo_tienda_cobro_anulacion" },
  { modelo: "WalletComprobante", tabla: "wallet_comprobante" },
  { modelo: "AbonoTienda", tabla: "abono_tienda" },
  { modelo: "AbonoTiendaAnulacion", tabla: "abono_tienda_anulacion" },
  { modelo: "AporteCapital", tabla: "aporte_capital" },
  { modelo: "AporteCapitalAnulacion", tabla: "aporte_capital_anulacion" },
  { modelo: "GastoFijoCobro", tabla: "gasto_fijo_cobro" },
  // Cobro de la plataforma a la empresa por orden (SL-40): lo escribe solo el trigger de `orden`
  { modelo: "CobroPlataformaMovimiento", tabla: "cobro_plataforma_movimiento" },
  // Devoluciones
  { modelo: "DevolucionTiendaComprobante", tabla: "devolucion_tienda_comprobante" },
  { modelo: "DevolucionTiendaEvidencia", tabla: "devolucion_tienda_evidencia" },
  { modelo: "DevolucionTiendaOrden", tabla: "devolucion_tienda_orden" },
  // Comunicacion
  { modelo: "PlantillaMensaje", tabla: "plantilla_mensaje" },
  { modelo: "ChatConversacion", tabla: "chat_conversacion" },
  { modelo: "ChatMensaje", tabla: "chat_mensaje" },
  { modelo: "Notificacion", tabla: "notificacion" },
  { modelo: "NotificacionLectura", tabla: "notificacion_lectura" },
  { modelo: "WhatsappEnvio", tabla: "whatsapp_envio" },
  { modelo: "WhatsappEnvioDestinatario", tabla: "whatsapp_envio_destinatario" },
  { modelo: "WhatsappEnvioEjecucion", tabla: "whatsapp_envio_ejecucion" },
  { modelo: "WhatsappEnvioEntrega", tabla: "whatsapp_envio_entrega" },
  // Rastro y analitica
  { modelo: "HistorialAccion", tabla: "historial_accion" },
  { modelo: "AnalyticsDaily", tabla: "analytics_daily" },
  { modelo: "RankingSnapshotDia", tabla: "ranking_snapshot_dia" },
  { modelo: "RankingSnapshotFila", tabla: "ranking_snapshot_fila" },
];

// §2.2. Sin `organizacion_id` (R4).
export const MODELOS_DE_PLATAFORMA: readonly ModeloClasificado[] = [
  // Catalogos del sistema: solo lectura para `servi_app` (R40)
  { modelo: "TipoIdentificacion", tabla: "tipo_identificacion" },
  { modelo: "Rol", tabla: "rol" },
  { modelo: "Permiso", tabla: "permiso" },
  { modelo: "RolPermiso", tabla: "rol_permiso" },
  { modelo: "OrderStatus", tabla: "order_status" },
  // Geografia (D2): solo lectura (R40)
  { modelo: "Provincia", tabla: "provincia" },
  { modelo: "Canton", tabla: "canton" },
  { modelo: "Distrito", tabla: "distrito" },
  // Catalogo de vehiculos (D12): solo lectura (R40)
  { modelo: "Vehiculo", tabla: "vehiculos" },
  // Autenticacion: «el dueno es usuario visible» (R22)
  { modelo: "Session", tabla: "Session" },
  { modelo: "TrustedDevice", tabla: "trusted_device" },
  { modelo: "EmailOtpChallenge", tabla: "email_otp_challenge" },
  { modelo: "LoginAttempt", tabla: "login_attempt" },
  // Cache tecnica sin dato de empresa
  { modelo: "GeocodeCache", tabla: "geocode_cache" },
  // Valor global del cobro por orden (SL-40): sin acceso para `servi_app`; lo edita el superadmin
  { modelo: "CobroPlataformaTarifa", tabla: "cobro_plataforma_tarifa" },
];

// §2.3.
export const MODELOS_DIFERIDOS: readonly ModeloDiferido[] = [
  {
    modelo: "Job",
    tabla: "jobs",
    ficha: "SL-19",
    motivo:
      "outbox compartido: encola dentro de transacciones de empresa y el drenador corre cada job con su empresa",
  },
];

/** R3: la unica tabla de negocio con `organizacion_id` nulable (el superadmin). */
export const MODELO_NEGOCIO_NULABLE = "Usuario";

// Claves normalizadas con la inicial en mayuscula: `$allOperations` entrega "Orden", y algunos
// llamadores usan la propiedad del cliente ("orden").
const NOMBRES_DE_NEGOCIO: ReadonlySet<string> = new Set(
  MODELOS_DE_NEGOCIO.map((m) => m.modelo),
);

function conInicialMayuscula(nombre: string): string {
  return nombre.length === 0 ? nombre : nombre[0].toUpperCase() + nombre.slice(1);
}

export function esModeloDeNegocio(modelo: string): boolean {
  return NOMBRES_DE_NEGOCIO.has(modelo) || NOMBRES_DE_NEGOCIO.has(conInicialMayuscula(modelo));
}
