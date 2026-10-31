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
    archivo: "lib/actions/geografia-plataforma.ts",
    ficha: "SL-20",
    motivo:
      "gestión de países y geografía por el superadmin, que no tiene empresa; conteo de órdenes de todas las empresas (D15)",
  },
  {
    archivo: "lib/repositories/PushEndpointPlataformaRepository.ts",
    ficha: "SL-18",
    motivo: "push, el último gana: borrar la suscripción de ese endpoint exacto si es de otra empresa (R26, R28)",
  },
  {
    // Vive en `tests/fabricas/` porque la comparten el E2E y la demo de QA; la importa el build
    // (`scripts/demo-qa/receta.ts`), así que se cuenta como código de producción.
    archivo: "tests/fabricas/empresa-y-usuarios.ts",
    ficha: "SL-43",
    motivo: "alta de una empresa (demo de QA y E2E) por el servicio del superadmin, que no tiene empresa (R11)",
  },
  {
    archivo: "lib/repositories/ModulosEmpresaRepository.ts",
    ficha: "SL-23",
    motivo: "encender y apagar módulos de una empresa: lo hace el superadmin, que no tiene empresa (R10)",
  },
  {
    archivo: "lib/repositories/PlanesRepository.ts",
    ficha: "SL-24",
    motivo:
      "catálogo de planes y su asignación: los escribe el superadmin, que no tiene empresa (R5); y los destinatarios de los correos del cambio de plan, los maestros activos de las empresas con el plan (R41, R45); y las lecturas del catálogo, el detalle de un plan y el plan de una empresa para el superadmin (SLT-58); y la vista previa de la primera asignación (SLT-58 §11)",
  },
  {
    archivo: "scripts/geo-backfill-nodo.ts",
    ficha: "SLT-43",
    motivo:
      "comando de consola por lotes: llena el nodo geográfico de las órdenes y zonas y el snapshot de los cierres de todas las empresas (R27)",
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
