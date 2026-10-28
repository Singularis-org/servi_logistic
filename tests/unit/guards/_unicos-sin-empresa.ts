/**
 * SL-18 (design §5, R22, R23, R30): lista de los índices únicos de negocio que no empiezan por
 * `organizacion_id`. Vive en `tests/` y no en `lib/db/excepciones-aislamiento.ts` a propósito: solo
 * la usan la guardia `unicos-por-empresa.guardia.test.ts` y su detector `_unicos-por-empresa.ts`, y
 * los nombres de tabla e índice que contiene pondrían en rojo las guardias que censan qué archivos de
 * `lib/` nombran ciertas tablas (`analytics_daily`, `gestion_orden_pago`).
 */
/**
 * SL-18 (design §5, R22, R23): un índice único de una tabla de negocio que no empieza por
 * `organizacion_id`. `global` = único en toda la plataforma a propósito; `docs/architecture.md >
 * Multi-empresa` lo nombra (R30). `anclado` = una de sus columnas es una FK NOT NULL (o exigida por el
 * predicado del índice) a una fila de negocio, que ya es de una empresa: los triggers de misma empresa
 * (M3) impiden mezclar empresas, así que el único global no choca entre ellas.
 */
export type UnicoSinEmpresa = {
  /** Nombre del índice o de la restricción en Postgres. */
  readonly indice: string;
  readonly tabla: string;
  readonly tipo: "global" | "anclado";
  readonly motivo: string;
};

function anclado(tabla: string, indice: string, tablaReferida: string): UnicoSinEmpresa {
  return { indice, tabla, tipo: "anclado", motivo: `FK NOT NULL a \`${tablaReferida}\`` };
}

/**
 * La guardia `tests/unit/guards/unicos-por-empresa.guardia.test.ts` exige que todo único final de
 * negocio sin `organizacion_id` primero esté aquí, y que toda entrada exista. Se sembró con su mismo
 * detector (`_unicos-por-empresa.ts`) sobre la tabla de SL-17 T3.9; dentro de cada bloque, ordenada
 * por tabla e índice. Como las listas de `lib/db/excepciones-aislamiento.ts`, solo puede bajar: una
 * entrada cuyo índice ya empieza por `organizacion_id`, o que ya no existe, pone la guardia en rojo
 * hasta que se quita.
 */
export const UNICOS_SIN_EMPRESA: readonly UnicoSinEmpresa[] = [
  // Globales a propósito (T3.9, SL-18 decisión 1). `usuario.email` y `usuario.cedula` ya no están:
  // son por empresa desde `20261026090000_usuario_unico_por_empresa`.
  {
    indice: "api_key_key_hash_key",
    tabla: "api_key",
    tipo: "global",
    motivo: "el resumen de la key identifica a la empresa en la API, antes de conocerla",
  },
  {
    indice: "chat_mensaje_wa_message_id_key",
    tabla: "chat_mensaje",
    tipo: "global",
    motivo: "id externo de Meta: un mensaje de WhatsApp es de una sola conversación",
  },
  {
    indice: "orden_num_guia_key",
    tabla: "orden",
    tipo: "global",
    motivo: "rastreo público por guía sin sesión ni empresa; la guía sale de orden_num_guia_seq (R29)",
  },
  {
    indice: "push_suscripcion_endpoint_key",
    tabla: "push_suscripcion",
    tipo: "global",
    motivo: "id externo del servicio de push: un navegador, un dueño; el último registro gana (R26)",
  },
  {
    indice: "whatsapp_envio_entrega_wa_message_id_key",
    tabla: "whatsapp_envio_entrega",
    tipo: "global",
    motivo: "id externo de Meta: un mensaje de WhatsApp es de una sola entrega",
  },
  // Globales a propósito creados después de `20261023090000` (los calculó el detector, T4.1).
  {
    indice: "integracion_whatsapp_numero_id_key",
    tabla: "integracion",
    tipo: "global",
    motivo: "SL-36 R11: el webhook de WhatsApp necesita que un número lleve a una sola empresa",
  },
  {
    indice: "integracion_whatsapp_resumen_verificacion_key",
    tabla: "integracion",
    tipo: "global",
    motivo: "SL-36 R19: el GET del webhook busca por resumen sin sesión; lleva a una sola integración",
  },
  {
    indice: "usuario_un_solo_superadmin",
    tabla: "usuario",
    tipo: "global",
    motivo: "SL-32 R27: un único superadmin en la plataforma; el superadmin no tiene empresa",
  },
  // Anclados por una FK de negocio (T3.9).
  anclado("abono_tienda_anulacion", "abono_tienda_anulacion_abono_id_key", "abono_tienda"),
  anclado("ajuste_caja_anulacion", "ajuste_caja_anulacion_movimiento_id_key", "wallet_movimiento"),
  anclado("analytics_daily", "analytics_daily_grano_key", "zona"),
  anclado("api_key", "api_key_usuario_id_key", "usuario"),
  anclado("aporte_capital_anulacion", "aporte_capital_anulacion_aporte_id_key", "aporte_capital"),
  anclado("asistente_uso_diario", "asistente_uso_diario_usuario_id_fecha_key", "usuario"),
  anclado("carga", "carga_usuario_carga_name_key", "usuario"),
  anclado("chat_conversacion", "chat_conversacion_orden_id_telefono_e164_key", "orden"),
  anclado("cierre_detail", "cierre_detail_cierre_id_orden_id_key", "cierre_dia"),
  anclado("cierre_rechazo_tienda", "cierre_rechazo_tienda_gestion_id_key", "gestion_orden"),
  anclado("cierre_sin_gestion", "cierre_sin_gestion_cierre_id_orden_id_key", "cierre_dia"),
  anclado("cobro_tienda_anulacion", "cobro_tienda_anulacion_cobro_id_key", "wallet_tienda_movimiento"),
  anclado("devolucion_tienda_evidencia", "devolucion_tienda_evidencia_comprobante_id_indice_key", "devolucion_tienda_comprobante"),
  anclado("gasto_fijo_cobro", "gasto_fijo_cobro_movimiento_uq", "wallet_movimiento"),
  anclado("gestion_orden_evidencia", "gestion_orden_evidencia_gestion_id_indice_key", "gestion_orden"),
  anclado("gestion_orden_pago", "gestion_orden_pago_gestion_id_metodo_key", "gestion_orden"),
  anclado("liquidacion_anulacion", "liquidacion_anulacion_pago_id_key", "liquidacion_pago"),
  anclado("mensajero_documento", "mensajero_documento_usuario_id_tipo_key", "usuario"),
  anclado("notificacion_lectura", "notificacion_lectura_notificacion_id_usuario_id_key", "notificacion"),
  anclado("orden", "orden_tienda_id_num_remision_key", "usuario"),
  anclado("orden_evento", "orden_evento_gestion_registrada_uq", "gestion_orden"),
  anclado("orden_incidente", "orden_incidente_orden_vivo_uq", "orden"),
  anclado("orden_incidente_evidencia", "orden_incidente_evidencia_incidente_id_indice_key", "orden_incidente"),
  anclado("orden_mensajero_meta", "orden_mensajero_meta_usuario_id_orden_id_key", "usuario"),
  anclado("pago_mensajero_movimiento", "pago_mensajero_movimiento_origen_uq", "usuario"),
  anclado("pago_mensajero_movimiento", "pago_mensajero_movimiento_premio_dia_uq", "usuario"),
  anclado("pago_mensajero_movimiento", "pago_mensajero_movimiento_premio_reverso_uq", "usuario"),
  anclado("pago_por_cuenta_tienda_anulacion", "pago_por_cuenta_tienda_anulacion_pago_id_key", "pago_por_cuenta_tienda"),
  anclado("push_envio_dia", "push_envio_dia_cupo", "usuario"),
  anclado("ranking_snapshot_fila", "ranking_snapshot_fila_snapshot_id_mensajero_id_key", "ranking_snapshot_dia"),
  anclado("ranking_snapshot_fila", "ranking_snapshot_fila_snapshot_id_posicion_uq", "ranking_snapshot_dia"),
  anclado("ranking_snapshot_fila", "ranking_snapshot_fila_snapshot_id_puesto_key", "ranking_snapshot_dia"),
  anclado("rechazo_tienda_cobro", "rechazo_tienda_cobro_gestion_uq", "gestion_orden"),
  anclado("rechazo_tienda_cobro_anulacion", "rechazo_tienda_cobro_anulacion_cobro_id_key", "rechazo_tienda_cobro"),
  anclado("ruta_optimizada", "ruta_optimizada_mensajero_id_key", "usuario"),
  anclado("ruta_optimizada_parada", "ruta_optimizada_parada_ruta_id_orden_id_key", "ruta_optimizada"),
  anclado("ruta_optimizada_parada", "ruta_optimizada_parada_ruta_id_secuencia_key", "ruta_optimizada"),
  anclado("tarifa_zona_mensajero", "tarifa_zona_mensajero_zona_id_vehiculo_id_key", "zona"),
  anclado("usuario_preferencia", "usuario_preferencia_usuario_id_key", "usuario"),
  anclado("vista_filtro", "vista_filtro_dueno_superficie_nombre_key", "usuario"),
  anclado("wallet_anotacion", "wallet_anotacion_movimiento_id_key", "wallet_movimiento"),
  anclado("wallet_comprobante", "wallet_comprobante_caja_movimiento_id_key", "wallet_movimiento"),
  anclado("wallet_comprobante", "wallet_comprobante_liquidacion_pago_id_key", "liquidacion_pago"),
  anclado("wallet_comprobante", "wallet_comprobante_tienda_movimiento_id_key", "wallet_tienda_movimiento"),
  anclado("wallet_tienda_movimiento", "wallet_tienda_movimiento_origen_uq", "usuario"),
  anclado("webhook_suscripcion", "webhook_suscripcion_owner_usuario_id_key", "usuario"),
  anclado("whatsapp_envio_destinatario", "whatsapp_envio_destinatario_rol_key", "whatsapp_envio"),
  anclado("whatsapp_envio_destinatario", "whatsapp_envio_destinatario_usuario_key", "whatsapp_envio"),
  anclado("whatsapp_envio_ejecucion", "whatsapp_envio_ejecucion_evento_key", "whatsapp_envio"),
  anclado("whatsapp_envio_ejecucion", "whatsapp_envio_ejecucion_programado_key", "whatsapp_envio"),
  anclado("whatsapp_envio_entrega", "whatsapp_envio_entrega_ejecucion_usuario_key", "whatsapp_envio_ejecucion"),
  anclado("zona_distrito", "zona_distrito_zona_id_distrito_id_key", "zona"),
];
