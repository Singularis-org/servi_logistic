// Feature 90 (design §6, R17-R19) — Route Handler del drenador de la cola de jobs. Capa
// Controller: solo HTTP + autorizacion por `CRON_SECRET` (el MISMO que corte-diario /
// liberar-reprogramadas); delega TODA la logica en `JobQueueService`. Sin queries ni logica
// de negocio aqui. NUNCA loguea el secreto ni PII (R18/R19). Clon estructural EXACTO de
// `liberar-reprogramadas/route.ts`. Unico disparador temporal del drenado: Vercel Cron
// cada minuto (`* * * * *`, R20).
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import type { IJobQueueService } from "@/lib/interfaces/services/IJobQueueService";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { JobRepository, empresaDelJob } from "@/lib/repositories/JobRepository";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { loadCronConfig } from "@/lib/config/cron";
import { loadJobsConfig } from "@/lib/config/jobs";
import type { JobTipo } from "@prisma/client";
import { primerModuloApagado } from "@/lib/modulos/exigir-modulo";
import { type Destino, MODULO_POR_JOB, esCalculoContinuo, modulosDe } from "@/lib/modulos/reparto";
import { JobDescartado } from "@/lib/services/jobs/job-descartado";
import {
  buildLiberarReprogramadasService,
  crearLiberarReprogramadasHandler,
  recurrenciaLiberarReprogramadas,
} from "@/lib/services/jobs/liberar-reprogramadas-handler";
import {
  buildGeocodificacionService,
  crearGeocodificacionHandler,
} from "@/lib/services/jobs/geocodificacion-handler";
import {
  buildOptimizacionRutaService,
  crearOptimizacionRutaHandler,
} from "@/lib/services/jobs/optimizacion-ruta-handler";
import {
  buildWebhookEstadoService,
  crearWebhookEstadoHandler,
} from "@/lib/services/jobs/webhook-estado-handler";
import {
  buildWebhookEventoService,
  crearWebhookEventoHandler,
} from "@/lib/services/jobs/webhook-evento-handler";
import { crearWhatsappTemplateSyncHandler } from "@/lib/services/jobs/whatsapp-template-sync-handler";
import { crearWhatsappChatEnvioHandler } from "@/lib/services/jobs/whatsapp-chat-envio-handler";
import { crearWhatsappBienvenidaHandler } from "@/lib/services/jobs/whatsapp-bienvenida-handler";
import {
  buildAnaliticaRollupService,
  crearAnaliticaRollupDiarioHandler,
  recurrenciaAnaliticaRollupDiario,
} from "@/lib/services/jobs/analitica-rollup-diario-handler";
import { crearAnaliticaInvalidacionCacheHandler } from "@/lib/services/jobs/analitica-invalidacion-cache-handler";
import { crearAnaliticaCacheDeNext } from "@/lib/cache/next-analitica-cache";
import { buildPushWebService, crearPushWebHandler } from "@/lib/services/jobs/push-web-handler";
import { crearWhatsappEnvioProgramadoHandler } from "@/lib/services/jobs/whatsapp-envio-programado-handler";
import { crearWhatsappEnvioEventoHandler } from "@/lib/services/jobs/whatsapp-envio-evento-handler";
import { crearWhatsappEnvioEjecucionHandler } from "@/lib/services/jobs/whatsapp-envio-ejecucion-handler";
import { crearWhatsappEnvioReintentoHandler } from "@/lib/services/jobs/whatsapp-envio-reintento-handler";
import {
  crearWhatsappEnvioMantenimientoHandler,
  recurrenciaWhatsappEnvioMantenimiento,
} from "@/lib/services/jobs/whatsapp-envio-mantenimiento-handler";
import {
  buildDepsAvisoCorreo,
  buildPlanesRepositoryDeJobs,
  crearPlanAplicarCambioHandler,
  crearPlanAvisoCorreoHandler,
  crearPlanCambiosVencidosHandler,
  crearPlanRecordatorioCambioHandler,
  recurrenciaPlanCambiosVencidos,
} from "@/lib/planes/jobs-cambio-plan";

export interface ProcesarJobsDeps {
  // Secreto esperado (inyectable en tests). Por defecto, `CRON_SECRET` del entorno.
  getSecret?: () => string | null;
  service?: IJobQueueService;
  // Reloj inyectable (tests): por defecto `new Date()`.
  now?: () => Date;
  // SL-17 (R16): fuente de empresas de los recurrentes sin empresa (un doble en tests).
  empresas?: ClienteDeOrganizaciones;
}

export interface OpcionesDeEmpresa {
  empresas?: ClienteDeOrganizaciones;
}

/**
 * SL-17 (D16, R42, R16) — corre el handler de un job con la empresa que lo encolo. El reclamo y el
 * cierre van fuera, en plataforma (`handleProcesarJobs`), porque `jobs` no es de negocio.
 *
 *  - Con empresa: `conEmpresa`, asi el filtro y la RLS le aplican igual que a la peticion que lo
 *    encolo, y lo que encole a su vez hereda la empresa por el DEFAULT de M4.
 *  - Sin empresa y recurrente: lo dispara el reloj, no una empresa, asi que corre una vez por
 *    empresa. Si alguna falla, el job falla DESPUES de correr las demas, para que el backoff lo
 *    reintente; los tres recurrentes de hoy son idempotentes por fecha, y repetir las que fueron
 *    bien no duplica nada.
 *  - Sin empresa y por evento (filas previas a M4, o encoladas desde un script en plataforma):
 *    en plataforma, como dice R42.
 *
 * SL-23 (design §5.4; R19–R21, R30) — `modulo` es el del tipo (`MODULO_POR_JOB`). Con empresa y el
 * módulo apagado, lanza `JobDescartado` sin llamar al handler; sin empresa y recurrente, se salta
 * las empresas que lo tienen apagado. `"nucleo"` (y los de cálculo continuo, que lo reciben) corre
 * siempre. Sin empresa y por evento corre como hoy: no hay empresa contra la que comprobar.
 */
export function conSuEmpresa(
  handler: JobHandler,
  recurrente: boolean,
  opciones: OpcionesDeEmpresa = {},
  modulo: Destino = "nucleo",
): JobHandler {
  const claves = modulosDe(modulo);
  return async (job) => {
    const empresa = empresaDelJob(job);
    if (empresa !== null) {
      await conEmpresa(empresa, async () => {
        const apagado = claves.length > 0 ? await primerModuloApagado([claves[0], ...claves.slice(1)]) : null;
        if (apagado !== null) throw new JobDescartado(apagado);
        await handler(job);
      });
      return;
    }
    if (!recurrente) {
      await comoPlataforma("SL-17", "job sin empresa", () => handler(job));
      return;
    }
    const resumen = await paraCadaEmpresa(() => handler(job), { cliente: opciones.empresas, modulo: claves[0] });
    if (resumen.fallidas.length > 0) {
      const ids = resumen.fallidas.map((f) => f.organizacionId).join(", ");
      throw new Error(`fallo en ${resumen.fallidas.length} empresa(s): ${ids}`);
    }
  };
}

/**
 * SL-23 (design §5.4, §3.8; R19, R30) — el módulo que `conSuEmpresa` exige a un tipo de job. Los de
 * cálculo continuo siguen clasificados en su módulo, pero corren con él apagado: reciben `"nucleo"`.
 */
export function moduloDeEjecucion(tipo: JobTipo): Destino {
  return esCalculoContinuo(tipo) ? "nucleo" : MODULO_POR_JOB[tipo];
}

/**
 * Registro de handlers por tipo de job. La 91 anade `geocodificacion`; falta la 92.
 * Exportada para que el test de registro (R32) verifique que el tipo esta enganchado sin
 * levantar el endpoint entero. Construir el service NO abre conexion (singleton perezoso).
 */
export function buildHandlers(
  now: () => Date,
  opciones: OpcionesDeEmpresa = {},
): Map<JobTipo, JobHandler> {
  // SL-17: todo handler sale envuelto en `conSuEmpresa`; la recurrencia decide si un job sin
  // empresa itera las empresas. Se envuelve aqui para que `scripts/drenar-jobs.ts`, que reutiliza
  // este registro, ejecute igual que el cron.
  const recurrentes = buildRecurrencias();
  const handlers = new Map<JobTipo, JobHandler>();
  handlers.set(
    "liberar_reprogramadas",
    crearLiberarReprogramadasHandler(buildLiberarReprogramadasService(), now),
  );
  // Feature 91 (R32): geocodificacion de la direccion de UNA orden. NO se registra en
  // `buildRecurrencias()`: se encola por EVENTO, no por reloj. Un fallo suyo (p. ej. una
  // empresa sin Google Maps, SL-36) lo captura `JobQueueService.drenar` job a job, asi que NO
  // afecta al drenado de `liberar_reprogramadas`, que comparte este cron. La clave se lee en el
  // job, dentro de `conSuEmpresa`: el service se construye una vez para todas las empresas.
  handlers.set("geocodificacion", crearGeocodificacionHandler(buildGeocodificacionService(now)));
  // Feature 92 (R21): reoptimizacion de la ruta de UN mensajero. Como la geocodificacion,
  // NO se registra en `buildRecurrencias()`: se encola por EVENTO (recogida con debounce,
  // gestion inmediata), nunca por reloj. Un fallo suyo (p. ej. sin credencial de service
  // account) lo captura `JobQueueService.drenar` job a job, asi que NO afecta al drenado
  // de `liberar_reprogramadas` ni de `geocodificacion`, que comparten este cron.
  handlers.set(
    "optimizacion_ruta",
    crearOptimizacionRutaHandler(buildOptimizacionRutaService(now)),
  );
  // Feature 99 (R26): entrega firmada del cambio de estado a un integrador suscrito. Como la
  // geocodificacion y la optimizacion, NO se registra en `buildRecurrencias()`: se encola por
  // EVENTO (transicion de estado con owner suscrito), nunca por reloj. Un fallo suyo (callback
  // caido, clave de cifrado ausente) lo captura `JobQueueService.drenar` job a job, asi que NO
  // afecta al drenado de los otros tipos, que comparten este cron.
  handlers.set("webhook_estado", crearWebhookEstadoHandler(buildWebhookEstadoService(now)));
  // FICHA 454 (design §12.1, R33): entrega firmada de UN hecho de orden (gestion registrada/
  // anulada/corregida, ayuda solicitada/resuelta). Como el de estado, NO es recurrente: se encola
  // por EVENTO, en la misma transaccion que el hecho. Un fallo suyo lo captura el drenado job a job.
  handlers.set("webhook_evento", crearWebhookEventoHandler(buildWebhookEventoService(now)));
  // Integracion WhatsApp: reintento de una op de plantilla (create/update/delete) que fallo en
  // linea. Encolado por EVENTO (fallo de la propagacion sincrona), no por reloj -> fuera de
  // `buildRecurrencias()`. Las deps (config de WhatsApp) se cargan perezosamente en el handler:
  // un env ausente falla ESTE job (recuperable), no el drenado de los demas tipos.
  handlers.set("whatsapp_template_sync", crearWhatsappTemplateSyncHandler());
  // Feature 109 (D1/F3): reintento del envio saliente de un mensaje de chat que devolvio
  // `transitorio` en linea. Encolado por EVENTO (fallo transitorio), no por reloj -> fuera de
  // `buildRecurrencias()`. Las deps (config de WhatsApp) se cargan perezosamente en el
  // handler: un env ausente falla ESTE job (recuperable), no el drenado de los demas tipos.
  handlers.set("whatsapp_chat_envio", crearWhatsappChatEnvioHandler());
  // MENSAJE DE BIENVENIDA: envia al cliente la plantilla marcada cuando su paquete es recogido.
  // Encolado por EVENTO (la transicion `recoleccion -> en_reparto`, desde el choke point de
  // estado), no por reloj -> fuera de `buildRecurrencias()`: re-agendarlo mandaria una
  // bienvenida por minuto al mismo cliente. Como sus hermanos de WhatsApp, las deps se cargan
  // perezosamente en el handler: un env ausente falla ESTE job (con su motivo en `last_error`),
  // no el drenado de los demas tipos.
  handlers.set("whatsapp_bienvenida", crearWhatsappBienvenidaHandler());
  // Feature 124 (D4->C1, R36): agrega en el rollup diario la fecha CR que acaba de cerrar.
  // A DIFERENCIA de geocodificacion / optimizacion / webhook / whatsapp, este tipo SI se
  // registra en `buildRecurrencias()`: no lo dispara ningun evento del dominio —nadie "crea"
  // un dia—, lo dispara el RELOJ, una vez por dia CR. Sin recurrencia la cola se vaciaria
  // tras la primera corrida y el rollup dejaria de escribirse en silencio, que es el modo de
  // fallo mas caro de esta feature: la tabla no se rompe, simplemente deja de crecer.
  handlers.set(
    "analitica_rollup_diario",
    // Feature 128 (R10): el 4.º argumento es el invalidador de la cache por tag. Su default es
    // una cache NULA para que los tests de la 124 no arrastren el runtime de Next, asi que
    // pasarlo aqui NO es opcional: sin el, el rollup se reescribiria y el tablero seguiria
    // sirviendo las cifras de ayer hasta que expirase el TTL, sin que nada fallara.
    crearAnaliticaRollupDiarioHandler(
      buildAnaliticaRollupService(now),
      now,
      undefined,
      crearAnaliticaCacheDeNext(),
    ),
  );
  // Feature 128 (R14): invalidacion de la cache de analitica tras un recomputo del backfill
  // (125). A DIFERENCIA de `analitica_rollup_diario`, este tipo NO se registra en
  // `buildRecurrencias()`: es PUNTUAL, lo encola el script del backfill cuando una corrida
  // ESCRIBIO. Re-agendarlo vaciaria la cache operativa cada minuto.
  handlers.set(
    "analitica_invalidacion_cache",
    crearAnaliticaInvalidacionCacheHandler(crearAnaliticaCacheDeNext()),
  );
  // FICHA 410 (R36): entrega de UNA notificacion ya creada a las suscripciones push de sus
  // destinatarios. Como la geocodificacion y el webhook, NO se registra en `buildRecurrencias()`:
  // se encola por EVENTO —la creacion de un aviso elegible, desde el decorador del repositorio de
  // notificaciones—, nunca por reloj. Re-agendarlo mandaria un push por minuto a la misma persona.
  //
  // Sus deps se resuelven perezosamente y SIN LANZAR si faltan las claves VAPID: un entorno sin
  // configurar falla ESTE job —que termina dejando constancia del nombre de la variable ausente—,
  // no el drenado de los otros nueve tipos, que comparten este cron.
  handlers.set("push_web", crearPushWebHandler(buildPushWebService(now)));
  // FICHA 474 (design §4, R22): los cinco tipos de los envios automaticos por WhatsApp. Sus deps
  // (repos, almacen y la credencial de Meta) se construyen PEREZOSAMENTE dentro de cada handler:
  // un env ausente falla ESE job con su motivo en `last_error`, no el drenado de los demas tipos.
  //   - `whatsapp_envio_programado`: una ocurrencia a hora fija; la cadena se re-encola SOLA desde
  //     el propio handler (no es recurrente de la cola: lleva payload propio).
  //   - `whatsapp_envio_evento`: un aviso interno puenteado (lo encola el decorador de `repoReal()`).
  //   - `whatsapp_envio_ejecucion`: ejecuta una ejecucion de evento ya creada.
  //   - `whatsapp_envio_reintento`: una entrega con fallo transitorio de Meta.
  //   - `whatsapp_envio_mantenimiento`: RECURRENTE (ver `buildRecurrencias`).
  handlers.set("whatsapp_envio_programado", crearWhatsappEnvioProgramadoHandler());
  handlers.set("whatsapp_envio_evento", crearWhatsappEnvioEventoHandler());
  handlers.set("whatsapp_envio_ejecucion", crearWhatsappEnvioEjecucionHandler());
  handlers.set("whatsapp_envio_reintento", crearWhatsappEnvioReintentoHandler());
  handlers.set("whatsapp_envio_mantenimiento", crearWhatsappEnvioMantenimientoHandler());
  // SL-24 (design §16.3, R38): el cambio programado de un plan. `plan_aplicar_cambio` es PUNTUAL:
  // lo encola la programación, en su transacción, para `vigente_desde`. `plan_cambios_vencidos` es
  // el barrido RECURRENTE (cada hora) de lo que siga pendiente y ya rija. Un solo repositorio para
  // los cuatro; `getPrismaClient()` es perezoso. Los dos de correo (T12, §16.4) son PUNTUALES:
  // `plan_recordatorio_cambio` (sin empresa) reparte un `plan_aviso_correo` por empresa, y este corre
  // en la empresa destino. El emisor real se construye perezosamente, al enviar: un SMTP mal
  // configurado falla ESE trabajo, no el drenado de los demás tipos.
  const planes = buildPlanesRepositoryDeJobs();
  handlers.set("plan_aplicar_cambio", crearPlanAplicarCambioHandler(planes, now));
  handlers.set("plan_cambios_vencidos", crearPlanCambiosVencidosHandler(planes, now));
  handlers.set("plan_recordatorio_cambio", crearPlanRecordatorioCambioHandler(planes));
  handlers.set("plan_aviso_correo", crearPlanAvisoCorreoHandler(planes, buildDepsAvisoCorreo));
  return new Map(
    [...handlers].map(([tipo, h]) => [
      tipo,
      conSuEmpresa(
        h,
        recurrentes.has(tipo) && !RECURRENTES_DE_PLATAFORMA.has(tipo),
        opciones,
        moduloDeEjecucion(tipo),
      ),
    ]),
  );
}

/**
 * SL-24 (design §16.3) — recurrentes SIN empresa que corren UNA vez, en plataforma, y no una vez por
 * empresa como los demás (`conSuEmpresa`): su trabajo es del catálogo de planes, no de una empresa.
 * Barrer los cambios vencidos una vez por empresa repetiría el mismo barrido N veces, y con cero
 * empresas no correría nunca. Siguen re-agendándose por `buildRecurrencias`.
 */
export const RECURRENTES_DE_PLATAFORMA: ReadonlySet<JobTipo> = new Set<JobTipo>(["plan_cambios_vencidos"]);

/**
 * Registro de recurrencia por tipo. Recurrentes son los tipos que dispara el RELOJ:
 * `liberar_reprogramadas` (00:00 CR) y, desde la 124, `analitica_rollup_diario` (00:30 CR).
 * La geocodificacion, la optimizacion de ruta, el webhook de estado y los dos de WhatsApp se
 * encolan por EVENTO y NO deben re-agendarse (R32/R21). Exportada por el mismo motivo que
 * `buildHandlers`.
 */
export function buildRecurrencias(): Map<JobTipo, RecurrenciaSpec> {
  const recurrencias = new Map<JobTipo, RecurrenciaSpec>();
  recurrencias.set("liberar_reprogramadas", recurrenciaLiberarReprogramadas);
  // Feature 124 (D4->C1, R36): el rollup diario es RECURRENTE porque nada en el dominio lo
  // dispara —el hecho de que un dia cierre no genera ningun evento—. Cada corrida re-agenda
  // la siguiente a las 00:30 CR con el `dedupe_key` de la fecha que agregara, asi que la
  // cola se auto-perpetua y un fallo terminal de una ocurrencia no detiene la serie.
  recurrencias.set("analitica_rollup_diario", recurrenciaAnaliticaRollupDiario);
  // FICHA 474 (R25/R44): el mantenimiento diario de los envios por WhatsApp (03:30 CR). Lo dispara
  // el RELOJ; su primera fila la siembra la migracion `20261005120200`. Los otros cuatro tipos de la
  // 474 NO van aqui: re-agendarlos con payload `{}` no significaria nada.
  recurrencias.set("whatsapp_envio_mantenimiento", recurrenciaWhatsappEnvioMantenimiento);
  // SL-24 (design §16.3): el barrido de cambios de plan vencidos, cada hora en punto. Corre una vez
  // en plataforma (`RECURRENTES_DE_PLATAFORMA`); su primera fila la siembra `SIEMBRAS_RECURRENTES`.
  recurrencias.set("plan_cambios_vencidos", recurrenciaPlanCambiosVencidos);
  return recurrencias;
}

function buildService(now: () => Date, opciones: OpcionesDeEmpresa): IJobQueueService {
  const prisma = getPrismaClient();
  return new JobQueueService(
    new JobRepository(prisma),
    buildHandlers(now, opciones),
    buildRecurrencias(),
    loadJobsConfig(),
    now,
  );
}

// Extrae el token `Bearer <token>` del header Authorization; null si ausente/mal formado.
function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * Logica del endpoint, extraida de `GET` para inyeccion de dependencias en tests (secreto +
 * service fake + reloj) sin DB real ni entorno. R17: sin/incorrecto secreto (o no
 * configurado) -> 401 sin efectos (ni siquiera se construye el service). R19: nunca se
 * loguea el secreto. R18: 200 con conteos agregados (sin PII).
 */
export async function handleProcesarJobs(
  req: Request,
  deps: ProcesarJobsDeps = {},
): Promise<NextResponse> {
  // R17: autorizacion ANTES de cualquier efecto. Secreto no configurado -> 401.
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await withErrorHandler(async () => {
    const now = deps.now ?? (() => new Date());
    const service = deps.service ?? buildService(now, { empresas: deps.empresas });
    // R18: drena hasta JOBS_BATCH_SIZE jobs; devuelve conteos agregados SIN PII.
    // SL-17 (R42): el reclamo (`FOR UPDATE SKIP LOCKED`), el cierre, el backoff y el re-agendado de
    // recurrentes tocan solo `jobs`, que no es de negocio: van en plataforma. Cada handler cambia a
    // la empresa de su job dentro de `conSuEmpresa`.
    return comoPlataforma("SL-17", "drenador: reclamo y cierre de jobs", () =>
      service.drenar(loadJobsConfig().JOBS_BATCH_SIZE),
    );
  });

  if (isAppErrorShape(result)) return appErrorToResponse(result); // R19: sin secreto ni PII
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleProcesarJobs(req);
}
