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
    archivo: "app/api/webhooks/whatsapp/route.ts",
    ficha: "SL-36",
    motivo: "webhook entrante de WhatsApp: llega sin sesion; su aislamiento lo decide SL-36",
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
];
