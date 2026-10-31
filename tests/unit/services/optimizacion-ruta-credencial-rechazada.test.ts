import { describe, it, expect, vi } from "vitest";
import type { JobTipo } from "@prisma/client";
import {
  OptimizacionRutaService,
  RutaCredencialRechazadaError,
  RutaIntentoFallidoError,
  type ParadasRepo,
} from "@/lib/services/OptimizacionRutaService";
import { crearOptimizacionRutaHandler } from "@/lib/services/jobs/optimizacion-ruta-handler";
import { JobFallidoPermanente } from "@/lib/services/jobs/job-fallido-permanente";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { GoogleRouteOptimizationClient } from "@/lib/clients/google-route-optimization";
import type {
  IRutaOptimizadaRepository,
  RutaOptimizadaDTO,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { IRouteOptimizationClient } from "@/lib/interfaces/external/IRouteOptimizationClient";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import type { JobsConfig } from "@/lib/config/jobs";

// SLT-59 · T4.2 (design §4 pasos 1-2; R29, R30, R35) — un 401/403 de `optimizeTours` no se
// arregla reintentando: cada reintento es otra llamada FACTURADA que vuelve a fallar igual.
// Se prueba la cadena entera con el cliente real de Google y un `fetch` doble: servicio ->
// handler -> cola, para que el motivo que queda en el dead-letter sea el que de verdad se escribe.

const MENSAJERO = "m-1";
const T0 = new Date("2026-10-29T12:00:00.000Z");
const TOKEN = "tok-secreto-ya29";
const PROYECTO = "proyecto-secreto-123";
// Coordenadas con decimales reconocibles para detectar si alguna se cuela en el motivo.
const LAT = 9.937_51;
const LNG = -84.081_37;

const CONFIG: RouteOptimizationConfig = {
  ROUTE_OPT_TIMEOUT_MS: 20_000,
  RUTA_DEBOUNCE_S: 60,
  RUTA_ORIGEN_TTL_MIN: 120,
  RUTA_SYNC_MIN_INTERVALO_S: 10,
  RUTA_MAX_PARADAS: 100,
  RUTA_ORIGEN_MAX_KM: 200,
  ROUTES_ROUTING_PREFERENCE: "TRAFFIC_UNAWARE",
  RUTA_REOPT_DISTANCIA_M: 1000,
  RUTA_OPT_MAX_INTENTOS: 3,
  RUTA_RECUPERACION_ENFRIAMIENTO_MIN: 5,
  RUTA_PRIMERA_MIN_RECOGIDO_PCT: 80,
};

const JOBS_CONFIG = {
  JOBS_BATCH_SIZE: 10,
  JOBS_MAX_ATTEMPTS: 5,
  JOBS_BACKOFF_BASE_MS: 30_000,
  JOBS_BACKOFF_CAP_MS: 3_600_000,
  JOBS_VISIBILITY_TIMEOUT_MS: 300_000,
} as JobsConfig;

function parada(id: string, i: number): ParadaRutaRow {
  return { ordenId: id, latitud: LAT + i / 1000, longitud: LNG, createdAt: T0 };
}

/** Ruta con un orden previo VALIDO de o1,o2; la gestion trae o3 nueva, asi que hay que reoptimizar. */
function rutaPrevia(): RutaOptimizadaDTO {
  return {
    id: "r1",
    mensajeroId: MENSAJERO,
    estado: "vigente",
    calculadaAt: new Date(T0.getTime() - 100_000),
    origenLat: null,
    origenLng: null,
    origenAt: null,
    origenFuente: null,
    huellaSet: "huella-previa",
    ultimoError: null,
    secuenciaFuente: "proveedor",
    trazado: null,
    tramoVivoAt: null,
    tramoPorOrden: new Map(),
    secuenciaPorOrden: new Map([
      ["o1", 1],
      ["o2", 2],
    ]),
  };
}

function build(http: number) {
  const rutas = {
    findByMensajero: vi.fn(async () => rutaPrevia()),
    upsertOrigen: vi.fn(async () => {}),
    reemplazarSecuencia: vi.fn(async () => {}),
    guardarTrazado: vi.fn(async () => {}),
    marcarTramoVivo: vi.fn(async () => {}),
    reducirSecuencia: vi.fn(async () => true),
    marcarDesactualizada: vi.fn<(m: string, e: string) => Promise<void>>(async () => {}),
  };
  const paradasRepo: ParadasRepo = {
    findParadasEnReparto: vi.fn(async () => [parada("o1", 1), parada("o2", 2), parada("o3", 3)]),
  };
  const fetchImpl = vi.fn(async () => new Response("{}", { status: http }));
  const client: IRouteOptimizationClient = new GoogleRouteOptimizationClient({
    projectId: PROYECTO,
    timeoutMs: 1_000,
    getToken: async () => TOKEN,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const service = new OptimizacionRutaService(
    rutas as unknown as IRutaOptimizadaRepository,
    paradasRepo,
    client,
    CONFIG,
    () => T0,
  );
  return { service, rutas, fetchImpl };
}

function jobOptimizacion(intentos: number, maxIntentos: number): JobDTO {
  return {
    id: "j-1",
    tipo: "optimizacion_ruta",
    payload: { mensajeroId: MENSAJERO },
    estado: "processing",
    intentos,
    maxIntentos,
    runAfter: T0,
    lockedAt: T0,
    lastError: null,
    dedupeKey: null,
    createdAt: T0,
    updatedAt: T0,
  };
}

function colaCon(job: JobDTO) {
  const fail: { id: string; error: string; runAfter: Date | null }[] = [];
  const repo: IJobRepository = {
    claimBatch: async () => [job],
    complete: async () => {},
    fail: async (id, error, runAfter) => {
      fail.push({ id, error, runAfter });
    },
    descartar: async () => {},
    findByDedupeKeys: async () => [],
    enqueue: async () => null,
  };
  return { repo, fail };
}

describe.each([401, 403])("SLT-59 — `optimizeTours` responde HTTP %i", (http) => {
  it("R30: el servicio conserva el orden previo, marca la ruta desactualizada y lanza el error tipado", async () => {
    const { service, rutas, fetchImpl } = build(http);

    const err = await service.ejecutar(MENSAJERO, { motivo: "debounce", jobCreatedAt: T0 }).catch((e) => e);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(RutaCredencialRechazadaError);
    // Subclase: el borde manual la sigue atrapando como cualquier fallo del proveedor (R31).
    expect(err).toBeInstanceOf(RutaIntentoFallidoError);
    expect(rutas.reemplazarSecuencia).not.toHaveBeenCalled();
    expect(rutas.reducirSecuencia).not.toHaveBeenCalled();
    expect(rutas.guardarTrazado).not.toHaveBeenCalled();
    expect(rutas.marcarDesactualizada).toHaveBeenCalledTimes(1);
    expect(rutas.marcarDesactualizada.mock.calls[0][0]).toBe(MENSAJERO);
  });

  it("R29: el handler la traduce a `JobFallidoPermanente`", async () => {
    const { service } = build(http);
    const handler = crearOptimizacionRutaHandler(service);

    await expect(handler(jobOptimizacion(1, 3))).rejects.toBeInstanceOf(JobFallidoPermanente);
  });

  it("R29/R35: la cola lo deja en dead-letter en el intento 1 de 3, con un motivo sin token, URL ni coordenadas", async () => {
    const { service, fetchImpl } = build(http);
    const { repo, fail } = colaCon(jobOptimizacion(1, 3));
    const handlers = new Map<JobTipo, JobHandler>([
      ["optimizacion_ruta", crearOptimizacionRutaHandler(service)],
    ]);

    const r = await new JobQueueService(repo, handlers, new Map(), JOBS_CONFIG, () => T0, {
      warn: () => {},
    }).drenar(10);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ fallidos: 1, muertos: 1, reintentados: 0 });
    expect(fail).toHaveLength(1);
    expect(fail[0].runAfter).toBeNull();
    const motivo = fail[0].error;
    expect(motivo).toBe(`optimizar ruta: credencial rechazada (HTTP ${http})`);
    for (const prohibido of [TOKEN, PROYECTO, "http://", "https://", "googleapis", String(LAT).slice(0, 5), String(LNG).slice(1, 6)]) {
      expect(motivo).not.toContain(prohibido);
    }
  });
});

describe("SLT-59 R33 — un fallo transitorio del proveedor NO es permanente", () => {
  it("HTTP 503 -> el handler re-lanza el error del servicio (no `JobFallidoPermanente`)", async () => {
    const { service } = build(503);
    const err = await crearOptimizacionRutaHandler(service)(jobOptimizacion(1, 3)).catch((e) => e);
    expect(err).toBeInstanceOf(RutaIntentoFallidoError);
    expect(err).not.toBeInstanceOf(RutaCredencialRechazadaError);
    expect(err).not.toBeInstanceOf(JobFallidoPermanente);
  });
});
