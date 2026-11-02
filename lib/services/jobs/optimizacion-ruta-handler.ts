// Feature 92 (design §4.4, R21) — handler DELGADO del job `optimizacion_ruta` y su fabrica
// de dependencias reales. Espejo de `geocodificacion-handler.ts`.
//
// Este tipo de job NO es recurrente: NO se registra en `buildRecurrencias()`. Se encola por
// EVENTO (recogida con debounce, gestion inmediata), no por reloj.
import { z } from "zod";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { IRoutesClient } from "@/lib/interfaces/external/IRoutesClient";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import {
  OptimizacionRutaService,
  RutaCredencialRechazadaError,
} from "@/lib/services/OptimizacionRutaService";
import { JobFallidoPermanente } from "@/lib/services/jobs/job-fallido-permanente";
import { ORIGENES_JOB_RUTA } from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { GoogleRouteOptimizationClient } from "@/lib/clients/google-route-optimization";
import { GoogleRoutesClient } from "@/lib/clients/google-routes";
import { HaversineRouteOptimizationClient } from "@/lib/clients/haversine-route-optimization";
import { FallbackRouteOptimizationClient } from "@/lib/clients/fallback-route-optimization";
import { RutaOptimizadaRepository } from "@/lib/repositories/RutaOptimizadaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";
import { credencialesIntegracionReales } from "@/lib/services/integraciones/credencial-de-la-empresa";
import { RutasPorEmpresa } from "@/lib/services/integraciones/rutas-de-la-empresa";
import { optlog, opterror } from "@/lib/logging/optimizer-log";

/**
 * R21/PII: el payload lleva el id del mensajero y, desde SLT-59 (D28/D29), opcionalmente el
 * `origen` del evento que lo encolo (no es PII). Un `origen` fuera de la lista es un error.
 * Sin `origen` es valido: los encolados antes del despliegue, que registran `job_sin_origen`.
 */
const payloadSchema = z.object({
  mensajeroId: z.string().min(1),
  origen: z.enum(ORIGENES_JOB_RUTA).optional(),
});

/**
 * Adapta `OptimizacionRutaService.ejecutar` a la firma `JobHandler`.
 *
 * R20: se pasa `job.createdAt` como `jobCreatedAt`. Es la pieza que hace funcionar la
 * guarda de obsolescencia: sin ella, el debounce en vuelo pagaria una reoptimizacion que
 * un disparo inmediato posterior ya hizo.
 */
export function crearOptimizacionRutaHandler(service: OptimizacionRutaService): JobHandler {
  return async (job: JobDTO) => {
    optlog("job — recibido", { jobId: job.id, createdAt: job.createdAt.toISOString() });
    const parsed = payloadSchema.safeParse(job.payload);
    if (!parsed.success) {
      optlog("job — payload invalido", { jobId: job.id });
      throw new Error("optimizacion_ruta: payload invalido (se esperaba { mensajeroId })");
    }
    try {
      await service.ejecutar(parsed.data.mensajeroId, {
        motivo: "debounce",
        jobCreatedAt: job.createdAt,
        // SLT-59 (D27, D28; R70): el motivo sale del `origen` y cada intento registra el suyo.
        // `job.intentos` ya viene incrementado por el claim: es el numero de ESTE intento.
        job: {
          origen: parsed.data.origen ?? null,
          intento: job.intentos,
          maxIntentos: job.maxIntentos,
        },
      });
      optlog("job — completado", { jobId: job.id });
    } catch (error) {
      if (error instanceof RutaCredencialRechazadaError) {
        // SLT-59 (R29): reintentar una credencial rechazada solo repite la llamada pagada; la
        // cola lo manda a dead-letter en este intento. El mensaje ya va saneado (R35).
        opterror("job — credencial rechazada; fallo terminal sin reintento", error, { jobId: job.id });
        throw new JobFallidoPermanente(error.message);
      }
      // Se traza y se RE-LANZA: la cola necesita el fallo para su backoff y su dead-letter.
      opterror("job — fallo; la cola aplicara backoff", error, { jobId: job.id });
      throw error;
    }
  };
}

/** Lo que el composition root deja cambiar a un test: de donde salen la credencial y el `fetch`. */
export interface OptimizacionRutaDeps {
  credenciales?: ICredencialesIntegracion;
  /** El `fetch` de los tres extremos de Google (token, optimizacion y trazado). */
  fetchImpl?: typeof fetch;
  /** La empresa de la sesion, para la action del mensajero (inyectable en tests). */
  empresaDeLaSesion?: () => Promise<string | null>;
}

/**
 * Construye el service real con sus repos y los clientes HTTP.
 *
 * SL-36 (design §9.1; R23, R26, R28): aqui NO se lee ninguna credencial. Este service se construye
 * una vez por corrida del drenador (y una por pulsacion del boton del mensajero) y atiende jobs de
 * VARIAS empresas, asi que la credencial se resuelve en cada llamada a Google con la empresa en curso
 * (`RutasPorEmpresa`), y el token se cachea por empresa. Antes habia aqui un `tokenProvider ??=` de
 * proceso: con credenciales por empresa, el primer job habria fijado el token de su empresa para
 * todos los demas.
 *
 * Construir NUNCA lanza por falta de credencial: `RutaNoConfiguradoError` sale al pedir el token,
 * DESPUES de todas las guardas de coste, y `FallbackRouteOptimizationClient` lo convierte en el orden
 * local aproximado (R26). Asi una empresa sin la integracion no tumba el drenado de la cola.
 */
export function buildOptimizacionRutaService(
  now: () => Date = () => new Date(),
  deps: OptimizacionRutaDeps = {},
) {
  const prisma = getPrismaClient();
  const config = loadRouteOptimizationConfig();
  optlog("build — config cargada", {
    timeoutMs: config.ROUTE_OPT_TIMEOUT_MS,
    maxParadas: config.RUTA_MAX_PARADAS,
    debounceS: config.RUTA_DEBOUNCE_S,
    origenTtlMin: config.RUTA_ORIGEN_TTL_MIN,
    syncMinIntervaloS: config.RUTA_SYNC_MIN_INTERVALO_S,
    routingPreference: config.ROUTES_ROUTING_PREFERENCE,
    reoptDistanciaM: config.RUTA_REOPT_DISTANCIA_M,
    optMaxIntentos: config.RUTA_OPT_MAX_INTENTOS,
  });

  // UNA instancia para los dos clientes: optimizacion y trazado usan el MISMO token de la empresa.
  // ⚠️ ESTA LINEA ES R23: sin el lector real no hay de donde sacar la clave de la empresa.
  const rutas = new RutasPorEmpresa({
    credenciales: deps.credenciales ?? credencialesIntegracionReales(),
    fetchBase: deps.fetchImpl,
    empresaDeLaSesion: deps.empresaDeLaSesion,
  });

  // El proyecto va en la URL de `optimizeTours` y es de la empresa: el cliente se arma por llamada.
  // `GoogleRouteOptimizationClient` pide el token lo primero, asi que armarlo aqui dentro no adelanta
  // ninguna llamada respecto a antes.
  const google: IRouteOptimizationClient = {
    async optimizar(input, contexto) {
      const empresa = await rutas.deLaEmpresa();
      return new GoogleRouteOptimizationClient({
        projectId: empresa.projectId,
        timeoutMs: config.ROUTE_OPT_TIMEOUT_MS,
        getToken: empresa.getToken,
        fetchImpl: empresa.fetchOptimizacion,
        // SLT-59 (R69): la empresa de la linea `[google-api]` es la que puso la credencial.
        empresaId: () => empresa.organizacionId,
      }).optimizar(input, contexto);
    },
  };

  // El trazado no necesita proyecto: un cliente basta, y su token se resuelve PEREZOSAMENTE en la
  // empresa en curso, en el mismo punto donde el cliente lo pedia antes (despues de sus guardas).
  //
  // SLT-59 (R69): un cliente por llamada para que la linea `[google-api]` lleve la empresa que
  // resolvio el token de ESA llamada. Se fija al pedir el token, antes de la peticion HTTP; si el
  // token falla no hay peticion ni linea (R72).
  const routes: IRoutesClient = {
    trazar(input, contexto) {
      let empresaId: string | null = null;
      return new GoogleRoutesClient({
        getToken: async () => {
          const empresa = await rutas.deLaEmpresa();
          empresaId = empresa.organizacionId;
          return empresa.getToken();
        },
        timeoutMs: config.ROUTE_OPT_TIMEOUT_MS,
        routingPreference: config.ROUTES_ROUTING_PREFERENCE,
        fetchImpl: deps.fetchImpl,
        empresaId: () => empresaId,
      }).trazar(input, contexto);
    },
  };

  // Fallback (design §9.A): sin credencial de la empresa, `google.optimizar` propaga
  // `RutaNoConfiguradoError` y el compuesto cae a un orden local aproximado (Haversine + vecino mas
  // cercano) en vez de dejar la ruta sin ordenar. Cualquier otro fallo del proveedor se propaga.
  const client: IRouteOptimizationClient = new FallbackRouteOptimizationClient(
    google,
    new HaversineRouteOptimizationClient(),
  );

  return new OptimizacionRutaService(
    new RutaOptimizadaRepository(prisma),
    new OrdenRepository(prisma),
    client,
    config,
    now,
    undefined,
    routes,
    // SLT-74: el aviso de `recogida_insuficiente` dice cuanto falta para la primera ruta.
    new JobRepository(prisma),
  );
}
