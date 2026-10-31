import { describe, it, expect, vi } from "vitest";
import type { JobTipo } from "@prisma/client";
import { OptimizacionRutaService } from "@/lib/services/OptimizacionRutaService";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { crearOptimizacionRutaHandler } from "@/lib/services/jobs/optimizacion-ruta-handler";
import { encolarOptimizacionDebounce } from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { codificarPolilinea, distanciaHaversineKm } from "@/lib/geo/polilinea";
import type { RouteOptimizationConfig } from "@/lib/config/route-optimization";
import type { JobsConfig } from "@/lib/config/jobs";
import type {
  IRouteOptimizationClient,
  OptimizarInput,
  OptimizarOutcome,
} from "@/lib/interfaces/external/IRouteOptimizationClient";
import type {
  IRoutesClient,
  TrazarRutaInput,
  TrazarRutaOutcome,
} from "@/lib/interfaces/external/IRoutesClient";
import type {
  EnqueueOpts,
  IJobRepository,
  JobDTO,
} from "@/lib/interfaces/repositories/IJobRepository";
import type {
  IRutaOptimizadaRepository,
  OrigenFuente,
  OrigenUbicacion,
  ReduccionSecuencia,
  ReemplazarSecuenciaMeta,
  RutaEstadoValue,
  RutaOptimizadaDTO,
  SecuenciaFuentePersistida,
  TramoPersistido,
  TrazadoPersistido,
} from "@/lib/interfaces/repositories/IRutaOptimizadaRepository";
import type { ParadaRutaRow } from "@/lib/interfaces/repositories/IOrdenRepository";

// SLT-59 (R37, design §8) — JORNADA DE REFERENCIA: cuantas llamadas facturadas paga un mensajero
// en un dia tipico. Cuenta llamadas, no dinero (D10).
//
// Todo lo que decide si se paga es CODIGO REAL: `OptimizacionRutaService`, el handler del job, la
// cola (`JobQueueService`, con su backoff y su dead-letter) y los helpers de encolado. Lo que se
// dobla es solo lo que sale del proceso: la base (repos en memoria con la misma semantica que las
// escrituras condicionadas de Prisma), los dos clientes de Google (espias) y el reloj.
//
// ═══ ESTADO DE ESTE ARCHIVO ═══
// T0.1 lo dejo midiendo la columna «Hoy» CONTRA EL CODIGO ANTERIOR A SLT-59: el test de «Hoy» no
// afirma los conteos (dejarian de valer en cuanto cambie el comportamiento); los REPORTA, y la
// medicion quedo anotada en `progress/impl_SLT-59.md`. T5.1 anade la variante «Nuevo» con los
// conteos de la tabla como aserciones exactas y BORRA la de «Hoy» —que usa
// `encolarOptimizacionInmediata`, retirado en T3.2—.
// ⏳ 2026-10-29 (SLT-59, T3.2): la variante «Hoy» se borro al retirar ese helper (adelantado a T3.2
// en vez de T5.1). Su medicion sigue en `progress/impl_SLT-59.md`, Tanda 1. El arnes de la jornada
// queda montado para la variante «Nuevo» de T5.1.
// ⏳ 2026-10-30 (SLT-59, T5.1): la variante «Nuevo» afirma la tabla del design §8 fila a fila; la
// gestion va por el camino nuevo (debounce condicionado a coordenadas + `reducirSinLlamadas`).

const T0 = new Date("2026-10-29T13:00:00.000Z"); // en minuto exacto: las ventanas del debounce
const MIN = 60_000;
const M = "m-1";

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
  RUTA_PRIMERA_DEBOUNCE_MIN: 10,
};

const JOBS_CONFIG: JobsConfig = {
  JOBS_BATCH_SIZE: 10,
  JOBS_MAX_ATTEMPTS: 5,
  JOBS_BACKOFF_BASE_MS: 60_000,
  JOBS_BACKOFF_CAP_MS: 3_600_000,
  JOBS_VISIBILITY_TIMEOUT_MS: 3_600_000,
};

// ── Geografia del escenario ───────────────────────────────────────────────────────────────
// Seis paradas en fila hacia el este, ~1,1 km entre una y otra, y el punto de partida A al oeste
// de s1. La septima orden no tiene coordenadas.
type Punto = { lat: number; lng: number };
const METROS_POR_GRADO_LAT = (6371 * 1000 * Math.PI) / 180;
const LAT = 9.93;
const A: Punto = { lat: LAT, lng: -84.1 };
const PARADAS: Record<string, Punto> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((i) => [`s${i}`, { lat: LAT, lng: -84.1 + 0.01 * i }]),
);
const SIN_COORDENADAS = "x";

const alNorte = (p: Punto, metros: number): Punto => ({
  lat: p.lat + metros / METROS_POR_GRADO_LAT,
  lng: p.lng,
});
const alEste = (p: Punto, metros: number): Punto => ({
  lat: p.lat,
  lng: p.lng + metros / (METROS_POR_GRADO_LAT * Math.cos((p.lat * Math.PI) / 180)),
});

// ── Dobles en memoria ─────────────────────────────────────────────────────────────────────

interface FilaParada {
  ordenId: string;
  secuencia: number;
  tramo: TramoPersistido | null;
}

interface FilaRuta {
  id: string;
  estado: RutaEstadoValue;
  calculadaAt: Date | null;
  origenLat: number | null;
  origenLng: number | null;
  origenAt: Date | null;
  origenFuente: OrigenFuente | null;
  huellaSet: string | null;
  ultimoError: string | null;
  secuenciaFuente: SecuenciaFuentePersistida | null;
  trazado: TrazadoPersistido | null;
  tramoVivoAt: Date | null;
  paradas: FilaParada[];
}

/**
 * `ruta_optimizada` + `ruta_optimizada_parada` de UN mensajero, con las mismas reglas que
 * `RutaOptimizadaRepository`: reemplazar limpia el trazado, `guardarTrazado` y
 * `reducirSecuencia` solo escriben si la huella encaja, y solo se lee como tramo el que existe.
 */
class RutasEnMemoria implements IRutaOptimizadaRepository {
  fila: FilaRuta | null = null;

  private cabecera(): FilaRuta {
    this.fila ??= {
      id: "ruta-1",
      estado: "vigente",
      calculadaAt: null,
      origenLat: null,
      origenLng: null,
      origenAt: null,
      origenFuente: null,
      huellaSet: null,
      ultimoError: null,
      secuenciaFuente: null,
      trazado: null,
      tramoVivoAt: null,
      paradas: [],
    };
    return this.fila;
  }

  async findByMensajero(mensajeroId: string): Promise<RutaOptimizadaDTO | null> {
    const f = this.fila;
    if (f === null) return null;
    return {
      id: f.id,
      mensajeroId,
      estado: f.estado,
      calculadaAt: f.calculadaAt,
      origenLat: f.origenLat,
      origenLng: f.origenLng,
      origenAt: f.origenAt,
      origenFuente: f.origenFuente,
      huellaSet: f.huellaSet,
      ultimoError: f.ultimoError,
      secuenciaFuente: f.secuenciaFuente,
      trazado: f.trazado === null ? null : { ...f.trazado },
      tramoVivoAt: f.tramoVivoAt,
      // SLT-59 (R54): la jornada no simula el reloj de `updated_at`; T7.8 decide si hace falta.
      actualizadaAt: new Date(0),
      secuenciaPorOrden: new Map(f.paradas.map((p) => [p.ordenId, p.secuencia])),
      tramoPorOrden: new Map(
        f.paradas
          .filter((p): p is FilaParada & { tramo: TramoPersistido } => p.tramo !== null)
          .map((p) => [p.ordenId, { ...p.tramo }]),
      ),
    };
  }

  async upsertOrigen(_m: string, u: OrigenUbicacion): Promise<void> {
    Object.assign(this.cabecera(), {
      origenLat: u.lat,
      origenLng: u.lng,
      origenAt: u.capturadaAt,
      origenFuente: u.fuente,
    });
  }

  async reemplazarSecuencia(
    _m: string,
    secuencia: string[],
    meta: ReemplazarSecuenciaMeta,
  ): Promise<void> {
    Object.assign(this.cabecera(), {
      estado: "vigente",
      calculadaAt: meta.calculadaAt,
      origenLat: meta.origen?.lat ?? null,
      origenLng: meta.origen?.lng ?? null,
      origenFuente: meta.origen?.fuente ?? null,
      huellaSet: meta.huellaSet,
      secuenciaFuente: meta.secuenciaFuente,
      ultimoError: null,
      trazado: null,
      paradas: secuencia.map((ordenId, i) => ({ ordenId, secuencia: i + 1, tramo: null })),
    });
  }

  async guardarTrazado(
    _m: string,
    huellaSet: string,
    trazado: TrazadoPersistido,
    tramos: TramoPersistido[] = [],
  ): Promise<void> {
    const f = this.fila;
    if (f === null || f.huellaSet !== huellaSet) return;
    f.trazado = { ...trazado };
    tramos.forEach((tramo, i) => {
      const parada = f.paradas.find((p) => p.secuencia === i + 1);
      if (parada !== undefined) parada.tramo = { ...tramo };
    });
  }

  async reducirSecuencia(
    _m: string,
    huellaPrevia: string,
    reduccion: ReduccionSecuencia,
  ): Promise<boolean> {
    const f = this.fila;
    if (f === null || f.huellaSet !== huellaPrevia) return false;
    f.huellaSet = reduccion.huellaSet;
    f.trazado = reduccion.trazado === null ? null : { ...reduccion.trazado };
    f.paradas = reduccion.paradas.map((p, i) => ({
      ordenId: p.ordenId,
      secuencia: i + 1,
      tramo: p.tramo === null ? null : { ...p.tramo },
    }));
    return true;
  }

  async marcarDesactualizada(_m: string, ultimoError: string): Promise<void> {
    Object.assign(this.cabecera(), { estado: "desactualizada", ultimoError });
  }

  async marcarTramoVivo(_m: string, at: Date): Promise<void> {
    if (this.fila !== null) this.fila.tramoVivoAt = at;
  }
}

/**
 * Las ordenes del mensajero en reparto. Una gestionada sale del conjunto en el acto, como hace
 * `OrdenRepository.findParadasEnReparto` desde la ficha 454 con la gestion pendiente.
 */
class ParadasEnMemoria {
  private readonly gestionadas = new Set<string>();
  private readonly filas: ParadaRutaRow[] = [
    ...Object.entries(PARADAS).map(([ordenId, p], i) => ({
      ordenId,
      latitud: p.lat,
      longitud: p.lng,
      createdAt: new Date(T0.getTime() - (10 - i) * MIN),
    })),
    { ordenId: SIN_COORDENADAS, latitud: null, longitud: null, createdAt: T0 },
  ];

  gestionar(ordenId: string): void {
    this.gestionadas.add(ordenId);
  }

  async findParadasEnReparto(): Promise<ParadaRutaRow[]> {
    return this.filas.filter((f) => !this.gestionadas.has(f.ordenId));
  }

  // SLT-59 (R64): la jornada no pulsa el boton con la primera ruta pendiente; T7.8 decide si hace falta.
  async contarAsignadasDelDia(): Promise<{ asignadas: number; recogidas: number }> {
    return { asignadas: 0, recogidas: 0 };
  }
}

/** La cola en memoria: `ON CONFLICT (dedupe_key) DO NOTHING` y el reclamo por `run_after`. */
class JobsEnMemoria implements IJobRepository {
  readonly filas: JobDTO[] = [];

  constructor(private readonly reloj: () => Date) {}

  async enqueue(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EnqueueOpts = {},
  ): Promise<JobDTO | null> {
    if (opts.dedupeKey !== undefined && this.filas.some((j) => j.dedupeKey === opts.dedupeKey)) {
      return null;
    }
    const ahora = this.reloj();
    const job: JobDTO = {
      id: `job-${this.filas.length + 1}`,
      tipo,
      payload,
      estado: "pending",
      intentos: 0,
      maxIntentos: opts.maxIntentos ?? JOBS_CONFIG.JOBS_MAX_ATTEMPTS,
      runAfter: opts.runAfter ?? ahora,
      lockedAt: null,
      lastError: null,
      dedupeKey: opts.dedupeKey ?? null,
      createdAt: ahora,
      updatedAt: ahora,
    };
    this.filas.push(job);
    return { ...job };
  }

  async claimBatch(limit: number, opts: { now: Date }): Promise<JobDTO[]> {
    const vencidos = this.pendientes()
      .filter((j) => j.runAfter <= opts.now)
      .slice(0, limit);
    for (const j of vencidos) {
      j.estado = "processing";
      j.intentos += 1;
      j.lockedAt = opts.now;
    }
    return vencidos.map((j) => ({ ...j }));
  }

  async complete(id: string): Promise<void> {
    this.porId(id).estado = "done";
  }

  async fail(id: string, error: string, runAfter: Date | null): Promise<void> {
    const j = this.porId(id);
    j.lastError = error;
    if (runAfter === null) {
      j.estado = "failed";
    } else {
      j.estado = "pending";
      j.runAfter = runAfter;
    }
  }

  async descartar(id: string, motivo: string): Promise<void> {
    Object.assign(this.porId(id), { estado: "descartado", lastError: motivo });
  }

  async findByDedupeKeys(keys: string[]): Promise<JobDTO[]> {
    return this.filas.filter((j) => j.dedupeKey !== null && keys.includes(j.dedupeKey));
  }

  pendientes(): JobDTO[] {
    return this.filas
      .filter((j) => j.estado === "pending")
      .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime());
  }

  private porId(id: string): JobDTO {
    const j = this.filas.find((f) => f.id === id);
    if (j === undefined) throw new Error(`job inexistente: ${id}`);
    return j;
  }
}

/** Optimizador: siempre el orden s1…s6 de las paradas que le lleguen. */
function optimizadorQueOrdena(): IRouteOptimizationClient {
  return {
    optimizar: async (input: OptimizarInput): Promise<OptimizarOutcome> => ({
      status: "ok",
      secuencia: input.paradas.map((p) => p.ordenId).sort(),
      fuente: "proveedor",
    }),
  };
}

/** Routes: tramos RECTOS entre los puntos pedidos; bastan para medir la desviacion. */
function routesRecto(): IRoutesClient {
  return {
    trazar: async (input: TrazarRutaInput): Promise<TrazarRutaOutcome> => {
      const puntos = [input.origen, ...input.paradasEnOrden.map((p) => ({ lat: p.lat, lng: p.lng }))];
      const tramos = puntos.slice(1).map((destino, i) => {
        const metros = Math.round(distanciaHaversineKm(puntos[i], destino) * 1000);
        return {
          encodedPolyline: codificarPolilinea([puntos[i], destino]),
          distanciaM: metros,
          duracionS: Math.round(metros / 8),
        };
      });
      return {
        status: "ok",
        encodedPolyline: codificarPolilinea(puntos),
        distanciaM: tramos.reduce((s, t) => s + t.distanciaM, 0),
        duracionS: tramos.reduce((s, t) => s + t.duracionS, 0),
        tramos,
      };
    },
  };
}

// ── El arnes de la jornada ────────────────────────────────────────────────────────────────

type Jornada = ReturnType<typeof montarJornada>;

/**
 * Como registra el mensajero una gestion. Es lo unico que cambia entre «Hoy» y «Nuevo»: el
 * resto del escenario —eventos, reloj, cola, servicio— es el mismo para los dos.
 */
type GestionVariante = (j: Jornada, ordenId: string, gps: Punto) => Promise<void>;

function montarJornada(cliente: IRouteOptimizationClient = optimizadorQueOrdena()) {
  let ahora = T0;
  const reloj = () => ahora;
  const rutas = new RutasEnMemoria();
  const paradas = new ParadasEnMemoria();
  const jobs = new JobsEnMemoria(reloj);
  const optimizar = vi.fn(cliente.optimizar);
  const routes = routesRecto();
  const trazar = vi.fn(routes.trazar);
  const service = new OptimizacionRutaService(
    rutas,
    paradas,
    { optimizar },
    CONFIG,
    reloj,
    undefined,
    { trazar },
  );
  const cola = new JobQueueService(
    jobs,
    new Map([["optimizacion_ruta" as JobTipo, crearOptimizacionRutaHandler(service)]]),
    new Map(),
    JOBS_CONFIG,
    reloj,
    { warn: () => {} },
  );

  return {
    rutas,
    paradas,
    jobs,
    optimizar,
    trazar,
    service,
    get ahora() {
      return ahora;
    },
    irA(t: Date) {
      ahora = t;
    },
    /**
     * Corre la cola como el cron: cada job al vencer su `runAfter`, en orden, hasta `t`. Un
     * reintento con backoff que vence antes de `t` tambien corre.
     */
    async avanzarHasta(t: Date): Promise<void> {
      for (let vueltas = 0; vueltas < 100; vueltas++) {
        const siguiente = jobs.pendientes().find((job) => job.runAfter <= t);
        if (siguiente === undefined) break;
        if (siguiente.runAfter > ahora) ahora = siguiente.runAfter;
        await cola.drenar(JOBS_CONFIG.JOBS_BATCH_SIZE);
      }
      ahora = t;
    },
    conteo(): Conteo {
      return {
        opt: optimizar.mock.calls.length,
        routes: trazar.mock.calls.length,
        jobs: jobs.filas.length,
      };
    },
  };
}

interface Conteo {
  opt: number;
  routes: number;
  jobs: number;
}

/** Recogida de las 7 (`recogerLote` + `registrarUbicacion`): origen GPS y un job con debounce. */
async function recoger(j: Jornada, gps: Punto): Promise<void> {
  await encolarOptimizacionDebounce(j.jobs, undefined, M, {
    ahora: j.ahora,
    debounceS: CONFIG.RUTA_DEBOUNCE_S,
  });
  await j.rutas.upsertOrigen(M, { ...gps, capturadaAt: j.ahora, fuente: "gps" });
}

/** Boton «sincronizar» (`lib/actions/ruta-mensajero.ts`): ejecucion manual con la ubicacion. */
async function sincronizar(j: Jornada, gps: Punto): Promise<void> {
  await j.service.ejecutar(M, { motivo: "manual", ubicacion: gps });
}

interface Evento {
  n: number;
  tMin: number;
  descripcion: string;
  correr: (j: Jornada, gestionar: GestionVariante) => Promise<void>;
}

/** design §8, fila a fila. Los minutos son desde T0; la fila 4 son dos entregas a 20 s. */
const JORNADA: Evento[] = [
  { n: 1, tMin: 0, descripcion: "Recoge las 7 (GPS en A)", correr: (j) => recoger(j, A) },
  {
    n: 2,
    tMin: 5,
    descripcion: "Sincroniza a mano, GPS a 50 m de A",
    correr: (j) => sincronizar(j, alNorte(A, 50)),
  },
  {
    n: 3,
    tMin: 10,
    descripcion: "Gestiona la orden sin coordenadas, GPS a 300 m, sobre la ruta",
    correr: (j, gestionar) => gestionar(j, SIN_COORDENADAS, alEste(A, 300)),
  },
  {
    n: 4,
    tMin: 20,
    descripcion: "Entrega s1 y s2 con 20 s de diferencia (misma ventana)",
    correr: async (j, gestionar) => {
      await gestionar(j, "s1", PARADAS.s1);
      await j.avanzarHasta(new Date(j.ahora.getTime() + 20_000));
      await gestionar(j, "s2", PARADAS.s2);
    },
  },
  { n: 5, tMin: 40, descripcion: "Entrega s3", correr: (j, g) => g(j, "s3", PARADAS.s3) },
  {
    n: 6,
    tMin: 50,
    descripcion: "Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6)",
    correr: (j) => sincronizar(j, alNorte(PARADAS.s3, 1500)),
  },
  {
    n: 7,
    tMin: 60,
    descripcion: "Entrega s5 antes que s4 (fuera de orden, 1 hueco)",
    correr: (j, g) => g(j, "s5", PARADAS.s5),
  },
  { n: 8, tMin: 80, descripcion: "Entrega s4 (queda s6)", correr: (j, g) => g(j, "s4", PARADAS.s4) },
  {
    n: 9,
    tMin: 85,
    descripcion: "Sincroniza a mano a 200 m de la ruta, 1 parada",
    correr: (j) => sincronizar(j, alNorte(PARADAS.s4, 200)),
  },
  { n: 10, tMin: 100, descripcion: "Entrega s6 (quedan 0)", correr: (j, g) => g(j, "s6", PARADAS.s6) },
];

/**
 * Corre la jornada y devuelve lo que costo CADA fila: su evento mas los jobs que encolo, que
 * corren antes del evento siguiente. La ultima fila deja vaciar la cola.
 */
async function medirJornada(gestionar: GestionVariante): Promise<{
  j: Jornada;
  filas: (Conteo & { n: number })[];
}> {
  const j = montarJornada();
  const filas: (Conteo & { n: number })[] = [];
  let inicio: Conteo | null = null;
  const cerrarFila = (n: number) => {
    if (inicio === null) return;
    const fin = j.conteo();
    filas.push({
      n,
      opt: fin.opt - inicio.opt,
      routes: fin.routes - inicio.routes,
      jobs: fin.jobs - inicio.jobs,
    });
  };

  for (const [i, evento] of JORNADA.entries()) {
    await j.avanzarHasta(new Date(T0.getTime() + evento.tMin * MIN));
    if (i > 0) cerrarFila(JORNADA[i - 1].n);
    inicio = j.conteo();
    await evento.correr(j, gestionar);
  }
  const ultima = JORNADA[JORNADA.length - 1];
  await j.avanzarHasta(new Date(T0.getTime() + (ultima.tMin + 120) * MIN));
  cerrarFila(ultima.n);
  return { j, filas };
}

function totales(filas: Conteo[]): Conteo {
  return filas.reduce(
    (s, f) => ({ opt: s.opt + f.opt, routes: s.routes + f.routes, jobs: s.jobs + f.jobs }),
    { opt: 0, routes: 0, jobs: 0 },
  );
}

/**
 * Fila 11: un job cuyo `optimizeTours` responde 401 en cada intento. Cuenta las llamadas hasta
 * que la cola lo deja en dead-letter.
 */
async function medirJobCon401(): Promise<{ llamadas: number; job: JobDTO }> {
  const rechazo: IRouteOptimizationClient = {
    optimizar: async () => ({ status: "config_invalida", detalle: "optimizar ruta: HTTP 401" }),
  };
  const j = montarJornada(rechazo);
  await recoger(j, A);
  await j.avanzarHasta(new Date(T0.getTime() + 24 * 60 * MIN));
  return { llamadas: j.optimizar.mock.calls.length, job: j.jobs.filas[0] };
}

/**
 * La gestion como la hace hoy la app: `registrarGestionPendiente` saca la orden del reparto y, en
 * la misma transaccion, encola con debounce SOLO si la orden tiene coordenadas (R21/R22); despues
 * `MisAsignacionesService` guarda el GPS como origen (92/R23) y la Server Action llama a
 * `reducirSinLlamadas` (R27).
 */
const gestionNuevo: GestionVariante = async (j, ordenId, gps) => {
  j.paradas.gestionar(ordenId);
  if (ordenId !== SIN_COORDENADAS) {
    await encolarOptimizacionDebounce(j.jobs, undefined, M, {
      ahora: j.ahora,
      debounceS: CONFIG.RUTA_DEBOUNCE_S,
    });
  }
  await j.rutas.upsertOrigen(M, { ...gps, capturadaAt: j.ahora, fuente: "gps" });
  await j.service.reducirSinLlamadas(M);
};

/**
 * design §8, columna «Nuevo»: opt / routes / jobs por fila.
 *
 * [2026-10-30, SLT-59, D16] Ajuste minimo de T6.1 (la reescritura a §8.0 es T7.8): la fila 7
 * (fuera de orden, 1 hueco) ya no paga un tramo puente sino la re-sincronizacion completa de
 * R42: 1 `optimizeTours` + 1 `computeRoutes` (antes 0 / 1). Total 2 / 3 / 6 -> 3 / 3 / 6.
 */
const NUEVO: (Conteo & { n: number })[] = [
  { n: 1, opt: 1, routes: 1, jobs: 1 },
  { n: 2, opt: 0, routes: 0, jobs: 0 },
  { n: 3, opt: 0, routes: 0, jobs: 0 },
  { n: 4, opt: 0, routes: 0, jobs: 1 },
  { n: 5, opt: 0, routes: 0, jobs: 1 },
  { n: 6, opt: 1, routes: 1, jobs: 0 },
  { n: 7, opt: 1, routes: 1, jobs: 1 },
  { n: 8, opt: 0, routes: 0, jobs: 1 },
  { n: 9, opt: 0, routes: 0, jobs: 0 },
  { n: 10, opt: 0, routes: 0, jobs: 1 },
];

describe("SLT-59/R37 — jornada de referencia (design §8)", () => {
  it("T5.1 — la columna «Nuevo» como aserciones exactas, fila a fila y en total (R37)", async () => {
    const { j, filas } = await medirJornada(gestionNuevo);
    const total = totales(filas);
    const fila11 = await medirJobCon401();
    console.info(
      [
        "[SLT-59 T5.1] jornada de referencia — columna «Nuevo» MEDIDA (opt / routes / jobs):",
        ...filas.map((f) => {
          const ev = JORNADA.find((e) => e.n === f.n);
          return `  ${f.n}. t=${ev?.tMin} min — ${ev?.descripcion}: ${f.opt} / ${f.routes} / ${f.jobs}`;
        }),
        `  Total: ${total.opt} / ${total.routes} / ${total.jobs}`,
        `  11. Un job recibe 401: ${fila11.llamadas} llamadas (job ${fila11.job.estado}, ` +
          `intentos ${fila11.job.intentos}/${fila11.job.maxIntentos})`,
      ].join("\n"),
    );

    expect(filas).toEqual(NUEVO);
    expect(total).toEqual({ opt: 3, routes: 3, jobs: 6 });

    // El arnes recorrio la jornada entera: sin paradas, cola vacia, y la orden sin coordenadas
    // nunca llega al proveedor.
    expect(j.rutas.fila?.paradas).toEqual([]);
    expect(j.jobs.pendientes()).toEqual([]);
    for (const [input] of j.optimizar.mock.calls) {
      expect(input.paradas.map((p) => p.ordenId)).not.toContain(SIN_COORDENADAS);
    }

    // Fila 11 (R29): el 401 deja el job en dead-letter tras UNA llamada, no tras 5.
    expect(fila11.llamadas).toBe(1);
    expect(fila11.job.estado).toBe("failed");
    expect(fila11.job.intentos).toBe(1);
  });
});
