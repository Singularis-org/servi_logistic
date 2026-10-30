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
import { OptimizacionRutaService } from "@/lib/services/OptimizacionRutaService";
import { GoogleRouteOptimizationClient } from "@/lib/clients/google-route-optimization";
import { GoogleRoutesClient } from "@/lib/clients/google-routes";
import { HaversineRouteOptimizationClient } from "@/lib/clients/haversine-route-optimization";
import { FallbackRouteOptimizationClient } from "@/lib/clients/fallback-route-optimization";
import { RutaOptimizadaRepository } from "@/lib/repositories/RutaOptimizadaRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { loadRouteOptimizationConfig } from "@/lib/config/route-optimization";
import { credencialesIntegracionReales } from "@/lib/services/integraciones/credencial-de-la-empresa";
import { RutasPorEmpresa } from "@/lib/services/integraciones/rutas-de-la-empresa";
import { optlog, opterror } from "@/lib/logging/optimizer-log";

/** R21/PII: el payload lleva SOLO el id del mensajero. Cualquier otra forma es un error. */
const payloadSchema = z.object({ mensajeroId: z.string().min(1) });

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
      });
      optlog("job — completado", { jobId: job.id });
    } catch (error) {
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
    async optimizar(input) {
      const empresa = await rutas.deLaEmpresa();
      return new GoogleRouteOptimizationClient({
        projectId: empresa.projectId,
        timeoutMs: config.ROUTE_OPT_TIMEOUT_MS,
        getToken: empresa.getToken,
        fetchImpl: empresa.fetchOptimizacion,
      }).optimizar(input);
    },
  };

  // El trazado no necesita proyecto: un cliente basta, y su token se resuelve PEREZOSAMENTE en la
  // empresa en curso, en el mismo punto donde el cliente lo pedia antes (despues de sus guardas).
  const routes: IRoutesClient = new GoogleRoutesClient({
    getToken: async () => (await rutas.deLaEmpresa()).getToken(),
    timeoutMs: config.ROUTE_OPT_TIMEOUT_MS,
    routingPreference: config.ROUTES_ROUTING_PREFERENCE,
    fetchImpl: deps.fetchImpl,
  });

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
  );
}
