import type { FichaJira } from "./contexto-empresa";

// SL-17 (design §8) — las dos listas que las guardias leen para tolerar un archivo que se sale
// del aislamiento por empresa. Cada entrada nombra el archivo (ruta desde la raiz del repo), la
// ficha que lo justifica y por que. Solo pueden BAJAR: un archivo nuevo que no filtra pone el
// gate en rojo hasta que alguien escribe aqui su motivo.

export type ExcepcionDeAislamiento = {
  readonly archivo: string;
  readonly ficha: FichaJira;
  readonly motivo: string;
};

// D7: la RLS de M2 ya acota a la empresa todo SQL a mano que corre como `servi_app`; lo que queda
// pendiente es revisar uno a uno si cada consulta deberia filtrar ademas en el texto.
const MOTIVO_D7 = "cubierto por RLS; revisión fina pendiente";

function porRls(archivo: string): ExcepcionDeAislamiento {
  return { archivo, ficha: "SL-17", motivo: MOTIVO_D7 };
}

/**
 * R25, R26: archivos con SQL a mano sobre tablas de negocio que no filtran por `organizacion_id`.
 * La lista salio del mismo detector que usa la guardia (`tests/unit/guards/_aislamiento-por-empresa.ts`),
 * no a mano; esta ordenada. Cuando un archivo ya filtra, la guardia exige quitarlo de aqui.
 */
export const EXCEPCIONES_SQL_A_MANO: readonly ExcepcionDeAislamiento[] = [
  porRls("lib/repositories/AnaliticaOperativaVivaRepository.ts"),
  porRls("lib/repositories/AnaliticaRollupRepository.ts"),
  porRls("lib/repositories/ApiKeyRepository.ts"),
  porRls("lib/repositories/AsistenteUsoRepository.ts"),
  porRls("lib/repositories/ChatConversacionRepository.ts"),
  porRls("lib/repositories/ChatMensajeRepository.ts"),
  porRls("lib/repositories/CicloVidaRepository.ts"),
  porRls("lib/repositories/CierreDiaRepository.ts"),
  porRls("lib/repositories/CierresAdminRepository.ts"),
  porRls("lib/repositories/CobroTiendaAnulacionRepository.ts"),
  porRls("lib/repositories/CohorteCargaRepository.ts"),
  porRls("lib/repositories/ComoQuedoRepository.ts"),
  porRls("lib/repositories/ConteoCargadasPorDiaRepository.ts"),
  porRls("lib/repositories/ConteoDevolucionesRepository.ts"),
  porRls("lib/repositories/ConteoHoyGestionRepository.ts"),
  porRls("lib/repositories/ConteoPorStatusRepository.ts"),
  porRls("lib/repositories/ConteoProductosRepository.ts"),
  porRls("lib/repositories/CorreccionFechaReprogramacionRepository.ts"),
  porRls("lib/repositories/CuentasPorPagarAnaliticaRepository.ts"),
  porRls("lib/repositories/DevolucionTiendaRepository.ts"),
  porRls("lib/repositories/DineroProductosRepository.ts"),
  porRls("lib/repositories/EstadoCuentaRepository.ts"),
  porRls("lib/repositories/FiltrosWalletRepository.ts"),
  porRls("lib/repositories/FinanzasDiarioRepository.ts"),
  porRls("lib/repositories/GestionOrdenRepository.ts"),
  porRls("lib/repositories/HistoricoConversacionesRepository.ts"),
  porRls("lib/repositories/InformeTransitoRepository.ts"),
  porRls("lib/repositories/IngresosAnaliticaRepository.ts"),
  porRls("lib/repositories/LiquidacionPagoRepository.ts"),
  porRls("lib/repositories/OrdenHistorialRepository.ts"),
  porRls("lib/repositories/OrdenIdentificadaRepository.ts"),
  porRls("lib/repositories/OrdenRepository.ts"),
  porRls("lib/repositories/PickingRepository.ts"),
  porRls("lib/repositories/ReprogramadaRetenidaRepository.ts"),
  porRls("lib/repositories/TableroDiaRepository.ts"),
  porRls("lib/repositories/WalletMovimientoRepository.ts"),
  porRls("lib/repositories/WhatsappEjecucionRepository.ts"),
  porRls("lib/repositories/WhatsappEnvioRepository.ts"),
  porRls("lib/repositories/ZonaRepository.ts"),
  porRls("lib/repositories/ayuda-abierta.ts"),
  porRls("lib/repositories/correccion-cierre.ts"),
  porRls("lib/repositories/gestion-pendiente.ts"),
  porRls("lib/repositories/libro-caja-a-quien-sql.ts"),
  porRls("lib/repositories/traspasar-conversaciones.ts"),
  porRls("lib/services/jobs/webhook-estado-encolado.ts"),
  porRls("lib/services/jobs/webhook-evento-encolado.ts"),
  porRls("lib/services/jobs/whatsapp-bienvenida-encolado.ts"),
];

/** R15, R27: archivos que llaman a `comoPlataforma` y por tanto operan sin filtro de empresa. */
export const EXCEPCIONES_DE_PLATAFORMA: readonly ExcepcionDeAislamiento[] = [
  {
    archivo: "lib/db/para-cada-empresa.ts",
    ficha: "SL-17",
    motivo: "listar las organizaciones para correr un cron o job una vez por empresa (R16)",
  },
  {
    archivo: "lib/auth/empresa-de-la-peticion.ts",
    ficha: "SL-17",
    motivo: "leer la empresa del usuario de la sesion antes de conocerla (R12)",
  },
  {
    archivo: "lib/auth/resolve-actor.ts",
    ficha: "SL-17",
    motivo: "resolver el actor y su empresa desde la sesion, antes de abrir su contexto",
  },
  {
    archivo: "lib/auth/session-guard.ts",
    ficha: "SL-17",
    motivo: "validar la sesion y su usuario antes de saber a que empresa pertenece",
  },
  {
    archivo: "lib/actions/auth.ts",
    ficha: "SL-17",
    motivo: "login: buscar el usuario por email o cedula sin empresa conocida",
  },
  {
    archivo: "lib/actions/password-reset.ts",
    ficha: "SL-17",
    motivo: "recuperar contrasena: buscar el usuario y su OTP sin sesion ni empresa",
  },
  {
    archivo: "lib/api/api-key-request.ts",
    ficha: "SL-17",
    motivo: "resolver la API key a su empresa antes de abrir su contexto (R13)",
  },
  {
    archivo: "lib/actions/rastreo-publico.ts",
    ficha: "SL-17",
    motivo: "rastreo publico por numero de guia: sin sesion, la guia lleva a su empresa",
  },
  {
    // SL-36 T6.2: el route del webhook ya no está en la lista (delega en `WebhookWhatsappService`);
    // lo único que queda en plataforma es esta traducción, que solo selecciona los dos ids (R22).
    archivo: "lib/repositories/IntegracionEnrutadoRepository.ts",
    ficha: "SL-36",
    motivo: "webhook de WhatsApp: traducir un numero o un resumen de token a su empresa, sin sesion (R22)",
  },
  {
    archivo: "app/api/cron/procesar-jobs/route.ts",
    ficha: "SL-17",
    motivo: "cron del drenador: reclama jobs de todas las empresas y corre cada uno en la suya",
  },
  {
    archivo: "scripts/drenar-jobs.ts",
    ficha: "SL-17",
    motivo: "drenador por consola: reclama jobs de todas las empresas (R42)",
  },
  {
    archivo: "scripts/siembra-jobs-recurrentes.ts",
    ficha: "SL-17",
    motivo: "siembra de jobs recurrentes en el build: sin sesion; la fila nace sin empresa (R16)",
  },
  {
    archivo: "scripts/seed-jobs-analitica-rollup-diario.ts",
    ficha: "SL-17",
    motivo: "siembra manual por consola de un job recurrente: sin sesion; la fila nace sin empresa",
  },
  {
    archivo: "scripts/seed-jobs-liberar-reprogramadas.ts",
    ficha: "SL-17",
    motivo: "siembra manual por consola de un job recurrente: sin sesion; la fila nace sin empresa",
  },
  {
    archivo: "scripts/seed-jobs-whatsapp-envio-mantenimiento.ts",
    ficha: "SL-17",
    motivo: "siembra manual por consola de un job recurrente: sin sesion; la fila nace sin empresa",
  },
  {
    archivo: "lib/actions/organizaciones.ts",
    ficha: "SL-17",
    motivo: "alta de empresa por el superadmin: crea la organizacion fuera de toda empresa (R44)",
  },
  {
    archivo: "lib/repositories/ArranqueSuperadminRepository.ts",
    ficha: "SL-32",
    motivo: "comando de arranque: crea el superadmin, que no tiene empresa, y comprueba email y documento en toda la base (R12, R15)",
  },
  {
    archivo: "lib/repositories/EmpresasPlataformaRepository.ts",
    ficha: "SL-32",
    motivo: "pantalla «Empresas» del superadmin: lista todas las organizaciones y sus maestros (R29)",
  },
  {
    archivo: "app/(app)/layout.tsx",
    ficha: "SL-32",
    motivo: "marco del portal: leer el nombre del superadmin, que no tiene empresa, para el pie (R6)",
  },
  {
    archivo: "lib/repositories/CobroPlataformaTarifaRepository.ts",
    ficha: "SL-40",
    motivo: "valor global y excepción por empresa del cobro por orden: los edita el superadmin, que no tiene empresa (R1, R2)",
  },
  {
    archivo: "scripts/migrar-storage-a-carpetas.ts",
    ficha: "SL-19",
    motivo: "comando de consola: lee las rutas guardadas de todas las empresas para mover sus archivos a su carpeta (R24)",
  },
  {
    // Vive en `tests/fabricas/` porque la comparten el E2E y la demo de QA; la importa el build
    // (`scripts/demo-qa/receta.ts`), así que se cuenta como código de producción.
    archivo: "tests/fabricas/empresa-y-usuarios.ts",
    ficha: "SL-43",
    motivo: "alta de una empresa (demo de QA y E2E) por el servicio del superadmin, que no tiene empresa (R11)",
  },
];

/**
 * SL-19 (R20): archivos de produccion (`app/`, `lib/`, `scripts/`) fuera de `lib/storage/` que tocan
 * Storage con el cliente de Supabase. Solo los adaptadores ponen la carpeta de la empresa en curso:
 * quien llama a `.storage` por su cuenta puede leer o borrar la carpeta de otra empresa.
 */
export const EXCEPCIONES_DE_STORAGE: readonly ExcepcionDeAislamiento[] = [
  {
    archivo: "scripts/migrar-storage-a-carpetas.ts",
    ficha: "SL-19",
    motivo: "comando de consola: mueve lo guardado antes de SL-19 entre la raiz y la carpeta de cada empresa (R23–R28)",
  },
];


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
 * por tabla e índice. Como las otras listas, solo puede bajar: una entrada cuyo índice ya empieza por
 * `organizacion_id`, o que ya no existe, pone la guardia en rojo hasta que se quita.
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
