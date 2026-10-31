import { describe, it, expect, vi } from "vitest";
import type { JobTipo } from "@prisma/client";
import { OptimizacionRutaService } from "@/lib/services/OptimizacionRutaService";
import { JobQueueService } from "@/lib/services/JobQueueService";
import { crearOptimizacionRutaHandler } from "@/lib/services/jobs/optimizacion-ruta-handler";
import {
  encolarOptimizacionDebounce,
  encolarPrimeraRutaPorRecogida,
  primeraRutaPendiente,
} from "@/lib/services/jobs/optimizacion-ruta-encolado";
import { codificarPolilinea, distanciaHaversineKm } from "@/lib/geo/polilinea";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
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
  EncolarOMoverOpts,
  EnqueueOpts,
  IJobRepositoryMovible,
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
import type { EjecutarOptimizacionResult } from "@/lib/interfaces/services/IOptimizacionRutaService";

// SLT-59 (R37, design §8.0) — JORNADA DE REFERENCIA: cuantas llamadas facturadas paga un mensajero
// en un dia tipico. Cuenta llamadas, no dinero (D10).
//
// Todo lo que decide si se paga es CODIGO REAL: `OptimizacionRutaService`, el handler del job, la
// cola (`JobQueueService`, con su backoff y su dead-letter) y los helpers de encolado de la
// recogida y la gestion. Lo que se dobla es solo lo que sale del proceso: la base (repos en memoria
// con la misma semantica que las escrituras condicionadas de Prisma), los dos clientes de Google
// (espias) y el reloj.
//
// Historia: T0.1 midio «Hoy» contra el codigo anterior (bitacora, Tanda 1); T5.1 afirmo la tabla de
// la revision 3 (design §8.1). T7.8 (2026-10-31) afirma las tablas vigentes de design §8.0: la
// carga en bodega, la salida y la recuperacion a mano (D21-D25).

const T0 = new Date("2026-10-29T13:00:00.000Z"); // 07:00 en CR, en minuto exacto
const MIN = 60_000;
const M = "m-1";
const en = (tMin: number) => new Date(T0.getTime() + tMin * MIN);

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
// Seis paradas en fila hacia el este, ~1,1 km entre una y otra, y la bodega B (= A, donde empieza
// la ruta tras la carga) al oeste de s1. La septima orden no tiene coordenadas.
type Punto = { lat: number; lng: number };
const METROS_POR_GRADO_LAT = (6371 * 1000 * Math.PI) / 180;
const LAT = 9.93;
const A: Punto = { lat: LAT, lng: -84.1 };
const B = A;
const PARADAS: Record<string, Punto> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((i) => [`s${i}`, { lat: LAT, lng: -84.1 + 0.01 * i }]),
);
const SIN_COORDENADAS = "x";
const TODAS = ["s1", "s2", "s3", "s4", "s5", "s6", SIN_COORDENADAS];

const alNorte = (p: Punto, metros: number): Punto => ({
  lat: p.lat + metros / METROS_POR_GRADO_LAT,
  lng: p.lng,
});
const alEste = (p: Punto, metros: number): Punto => ({
  lat: p.lat,
  lng: p.lng + metros / (METROS_POR_GRADO_LAT * Math.cos((p.lat * Math.PI) / 180)),
});
// La bodega queda al oeste de la fila de paradas: alejarse hacia el oeste nunca acerca a ninguna.
const alOeste = (p: Punto, metros: number): Punto => alEste(p, -metros);

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
  actualizadaAt: Date;
  paradas: FilaParada[];
}

/**
 * `ruta_optimizada` + `ruta_optimizada_parada` de UN mensajero, con las mismas reglas que
 * `RutaOptimizadaRepository`: reemplazar limpia el trazado, `guardarTrazado` y
 * `reducirSecuencia` solo escriben si la huella encaja, y solo se lee como tramo el que existe.
 * Cada escritura mueve `actualizadaAt` al reloj, como el `@updatedAt` de Prisma (R53, R54).
 */
class RutasEnMemoria implements IRutaOptimizadaRepository {
  fila: FilaRuta | null = null;

  constructor(private readonly reloj: () => Date) {}

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
      actualizadaAt: this.reloj(),
      paradas: [],
    };
    return this.fila;
  }

  private tocar(f: FilaRuta): void {
    f.actualizadaAt = this.reloj();
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
      actualizadaAt: f.actualizadaAt,
      secuenciaPorOrden: new Map(f.paradas.map((p) => [p.ordenId, p.secuencia])),
      tramoPorOrden: new Map(
        f.paradas
          .filter((p): p is FilaParada & { tramo: TramoPersistido } => p.tramo !== null)
          .map((p) => [p.ordenId, { ...p.tramo }]),
      ),
    };
  }

  async upsertOrigen(_m: string, u: OrigenUbicacion): Promise<void> {
    const f = this.cabecera();
    Object.assign(f, {
      origenLat: u.lat,
      origenLng: u.lng,
      origenAt: u.capturadaAt,
      origenFuente: u.fuente,
    });
    this.tocar(f);
  }

  async reemplazarSecuencia(
    _m: string,
    secuencia: string[],
    meta: ReemplazarSecuenciaMeta,
  ): Promise<void> {
    const f = this.cabecera();
    Object.assign(f, {
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
    this.tocar(f);
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
    this.tocar(f);
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
    this.tocar(f);
    return true;
  }

  async marcarDesactualizada(_m: string, ultimoError: string): Promise<void> {
    const f = this.cabecera();
    Object.assign(f, { estado: "desactualizada", ultimoError });
    this.tocar(f);
  }

  async marcarTramoVivo(_m: string, at: Date): Promise<void> {
    if (this.fila !== null) this.fila.tramoVivoAt = at;
  }
}

/**
 * Las ordenes asignadas del dia al mensajero. Solo las recogidas estan en reparto, y una gestionada
 * sale del conjunto en el acto, como hace `OrdenRepository.findParadasEnReparto` desde la ficha 454
 * con la gestion pendiente. `contarAsignadasDelDia` cuenta las 7 asignadas y las recogidas (R64).
 */
class ParadasEnMemoria {
  private readonly recogidas = new Set<string>();
  private readonly gestionadas = new Set<string>();
  private readonly filas: ParadaRutaRow[] = [
    ...Object.entries(PARADAS).map(([ordenId, p], i) => ({
      ordenId,
      latitud: p.lat,
      longitud: p.lng,
      createdAt: new Date(T0.getTime() - (20 - i) * MIN),
    })),
    { ordenId: SIN_COORDENADAS, latitud: null, longitud: null, createdAt: en(-13) },
  ];

  recoger(ids: string[]): void {
    for (const id of ids) this.recogidas.add(id);
  }

  quedanPorRecoger(): boolean {
    return this.filas.some((f) => !this.recogidas.has(f.ordenId));
  }

  tieneCoordenadas(ordenId: string): boolean {
    return this.filas.some((f) => f.ordenId === ordenId && f.latitud !== null);
  }

  gestionar(ordenId: string): void {
    this.gestionadas.add(ordenId);
  }

  async findParadasEnReparto(): Promise<ParadaRutaRow[]> {
    return this.filas.filter((f) => this.recogidas.has(f.ordenId) && !this.gestionadas.has(f.ordenId));
  }

  async contarAsignadasDelDia(): Promise<{ asignadas: number; recogidas: number }> {
    return { asignadas: this.filas.length, recogidas: this.recogidas.size };
  }
}

/**
 * La cola en memoria: `ON CONFLICT (dedupe_key) DO NOTHING`, el `DO UPDATE … WHERE estado =
 * 'pending'` de `encolarOMoverPendiente` (D29) y el reclamo por `run_after`.
 */
class JobsEnMemoria implements IJobRepositoryMovible {
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
    return this.crear(tipo, payload, opts);
  }

  async encolarOMoverPendiente(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EncolarOMoverOpts,
  ): Promise<JobDTO | null> {
    const previa = this.filas.find((j) => j.dedupeKey === opts.dedupeKey);
    if (previa === undefined) return this.crear(tipo, payload, opts);
    if (previa.estado !== "pending") return null;
    Object.assign(previa, { runAfter: opts.runAfter, payload, updatedAt: this.reloj() });
    return { ...previa };
  }

  private crear(tipo: JobTipo, payload: Record<string, unknown>, opts: EnqueueOpts): JobDTO {
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

/**
 * Optimizador: el orden s1…s6 de las paradas que le lleguen. `rechazar` lo pasa a responder 401
 * (la credencial rechazada de las filas 11-13).
 */
function optimizadorQueOrdena() {
  const estado = { rechazar: false };
  const cliente: IRouteOptimizationClient = {
    optimizar: async (input: OptimizarInput): Promise<OptimizarOutcome> =>
      estado.rechazar
        ? { status: "config_invalida", detalle: "optimizar ruta: HTTP 401" }
        : { status: "ok", secuencia: input.paradas.map((p) => p.ordenId).sort(), fuente: "proveedor" },
  };
  return { cliente, estado };
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

function montarJornada() {
  let ahora = en(-30);
  const reloj = () => ahora;
  const rutas = new RutasEnMemoria(reloj);
  const paradas = new ParadasEnMemoria();
  const jobs = new JobsEnMemoria(reloj);
  const proveedor = optimizadorQueOrdena();
  const optimizar = vi.fn(proveedor.cliente.optimizar);
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
    proveedor,
    optimizar,
    trazar,
    service,
    get ahora() {
      return ahora;
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
      if (t > ahora) ahora = t;
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

/**
 * Una recogida como la hace la app: `GestionOrdenRepository.recogerLote` pasa las ordenes a reparto
 * y, con la primera ruta del dia pendiente, deja o mueve el job del dia (R58, R76); despues
 * `registrarUbicacion` guarda el GPS como origen (92/R23).
 */
async function recoger(j: Jornada, ids: string[], gps: Punto): Promise<void> {
  j.paradas.recoger(ids);
  const diaCR = fechaCalendarioCR(j.ahora);
  if (primeraRutaPendiente(j.rutas.fila?.calculadaAt ?? null, diaCR)) {
    await encolarPrimeraRutaPorRecogida(j.jobs, undefined, M, {
      ahora: j.ahora,
      diaCR,
      quedanPorRecoger: j.paradas.quedanPorRecoger(),
    });
  }
  await j.rutas.upsertOrigen(M, { ...gps, capturadaAt: j.ahora, fuente: "gps" });
}

/** Recoge `ids` de una en una, una por minuto, empezando ahora. */
async function recogerDeUnaEnUna(j: Jornada, ids: string[], gps: Punto): Promise<void> {
  for (const [i, id] of ids.entries()) {
    if (i > 0) await j.avanzarHasta(new Date(j.ahora.getTime() + MIN));
    await recoger(j, [id], gps);
  }
}

/** Boton «sincronizar» (`lib/actions/ruta-mensajero.ts`): ejecucion manual con la ubicacion. */
async function sincronizar(j: Jornada, gps: Punto): Promise<EjecutarOptimizacionResult> {
  return j.service.ejecutar(M, { motivo: "manual", ubicacion: gps });
}

/** Disparo de salida (R62): la pantalla manda la posicion en vivo; el servidor decide (R63). */
async function salir(j: Jornada, gps: Punto): Promise<EjecutarOptimizacionResult> {
  return j.service.ejecutar(M, { motivo: "salida", ubicacion: gps });
}

/**
 * La gestion como la hace la app: `registrarGestionPendiente` saca la orden del reparto y, en la
 * misma transaccion, encola con debounce si la orden tiene coordenadas o la primera ruta del dia
 * esta pendiente (R21/R22, R59); despues `MisAsignacionesService` guarda el GPS como origen
 * (92/R23) y la Server Action llama a `reducirSinLlamadas` (R44).
 */
async function gestionar(j: Jornada, ordenId: string, gps: Punto): Promise<void> {
  j.paradas.gestionar(ordenId);
  const pendiente = primeraRutaPendiente(
    j.rutas.fila?.calculadaAt ?? null,
    fechaCalendarioCR(j.ahora),
  );
  if (j.paradas.tieneCoordenadas(ordenId) || pendiente) {
    await encolarOptimizacionDebounce(j.jobs, undefined, M, {
      ahora: j.ahora,
      debounceS: CONFIG.RUTA_DEBOUNCE_S,
      origen: "gestion",
    });
  }
  await j.rutas.upsertOrigen(M, { ...gps, capturadaAt: j.ahora, fuente: "gps" });
  await j.service.reducirSinLlamadas(M);
}

interface Evento {
  n: string;
  tMin: number;
  descripcion: string;
  correr: (j: Jornada) => Promise<unknown>;
}

/**
 * Corre los eventos y devuelve lo que costo CADA fila: su evento mas los jobs que encolo, que
 * corren antes del evento siguiente. La ultima fila deja vaciar la cola.
 */
async function medir(
  eventos: Evento[],
  j: Jornada = montarJornada(),
): Promise<{ j: Jornada; filas: (Conteo & { n: string })[]; desenlaces: unknown[] }> {
  const filas: (Conteo & { n: string })[] = [];
  const desenlaces: unknown[] = [];
  let inicio: Conteo | null = null;
  const cerrarFila = (n: string) => {
    if (inicio === null) return;
    const fin = j.conteo();
    filas.push({
      n,
      opt: fin.opt - inicio.opt,
      routes: fin.routes - inicio.routes,
      jobs: fin.jobs - inicio.jobs,
    });
  };

  for (const [i, evento] of eventos.entries()) {
    await j.avanzarHasta(en(evento.tMin));
    if (i > 0) cerrarFila(eventos[i - 1].n);
    inicio = j.conteo();
    desenlaces.push(await evento.correr(j));
  }
  const ultima = eventos[eventos.length - 1];
  await j.avanzarHasta(en(ultima.tMin + 120));
  cerrarFila(ultima.n);
  return { j, filas, desenlaces };
}

function totales(filas: Conteo[]): Conteo {
  return filas.reduce(
    (s, f) => ({ opt: s.opt + f.opt, routes: s.routes + f.routes, jobs: s.jobs + f.jobs }),
    { opt: 0, routes: 0, jobs: 0 },
  );
}

function informe(titulo: string, eventos: Evento[], filas: (Conteo & { n: string })[]): string {
  const total = totales(filas);
  return [
    `[SLT-59 T7.8] ${titulo} — MEDIDO (opt / routes / jobs):`,
    ...filas.map((f) => {
      const ev = eventos.find((e) => e.n === f.n);
      return `  ${f.n}. t=${ev?.tMin} min — ${ev?.descripcion}: ${f.opt} / ${f.routes} / ${f.jobs}`;
    }),
    `  Total: ${total.opt} / ${total.routes} / ${total.jobs}`,
  ].join("\n");
}

// ── Jornada A (design §8.0) ───────────────────────────────────────────────────────────────

const JORNADA_A: Evento[] = [
  {
    n: "0",
    tMin: -10,
    descripcion: "Recoge s1, s2, s3 y x de una en una, 1 por minuto (GPS en B)",
    correr: (j) => recogerDeUnaEnUna(j, ["s1", "s2", "s3", SIN_COORDENADAS], B),
  },
  {
    n: "1",
    tMin: -6,
    descripcion: "Pulsa «Sincronizar» con 4 de 7 recogidas (57 %)",
    correr: (j) => sincronizar(j, B),
  },
  {
    n: "1b",
    tMin: -5,
    descripcion: "«Recoger todas» con las 3 restantes (s4, s5, s6)",
    correr: (j) => recoger(j, ["s4", "s5", "s6"], B),
  },
  {
    n: "2",
    tMin: 5,
    descripcion: "Sincroniza a mano, GPS a 50 m de A",
    correr: (j) => sincronizar(j, alNorte(A, 50)),
  },
  {
    n: "3",
    tMin: 10,
    descripcion: "Gestiona x (sin coordenadas), GPS a 300 m",
    correr: (j) => gestionar(j, SIN_COORDENADAS, alEste(A, 300)),
  },
  {
    n: "4",
    tMin: 20,
    descripcion: "Entrega s1 y s2 con 20 s de diferencia",
    correr: async (j) => {
      await gestionar(j, "s1", PARADAS.s1);
      await j.avanzarHasta(new Date(j.ahora.getTime() + 20_000));
      await gestionar(j, "s2", PARADAS.s2);
    },
  },
  {
    n: "5",
    tMin: 40,
    descripcion: "Entrega s3 a 1,5 km de la ruta",
    correr: (j) => gestionar(j, "s3", alNorte(PARADAS.s3, 1500)),
  },
  {
    n: "6",
    tMin: 50,
    descripcion: "Sincroniza a mano a 1,5 km de la ruta (quedan s4, s5, s6)",
    correr: (j) => sincronizar(j, alNorte(PARADAS.s3, 1500)),
  },
  {
    n: "7",
    tMin: 60,
    descripcion: "Entrega s5 antes que s4 (fuera de orden)",
    correr: (j) => gestionar(j, "s5", PARADAS.s5),
  },
  { n: "8", tMin: 80, descripcion: "Entrega s4 (queda s6)", correr: (j) => gestionar(j, "s4", PARADAS.s4) },
  {
    n: "9",
    tMin: 85,
    descripcion: "Sincroniza a mano a 200 m de la ruta, 1 parada",
    correr: (j) => sincronizar(j, alNorte(PARADAS.s4, 200)),
  },
  { n: "10", tMin: 100, descripcion: "Entrega s6 (quedan 0)", correr: (j) => gestionar(j, "s6", PARADAS.s6) },
];

/** design §8.0, jornada A, columna «Nuevo». */
const NUEVO_A: (Conteo & { n: string })[] = [
  { n: "0", opt: 0, routes: 0, jobs: 0 },
  { n: "1", opt: 0, routes: 0, jobs: 0 },
  { n: "1b", opt: 1, routes: 1, jobs: 1 },
  { n: "2", opt: 0, routes: 0, jobs: 0 },
  { n: "3", opt: 0, routes: 0, jobs: 0 },
  { n: "4", opt: 0, routes: 0, jobs: 1 },
  { n: "5", opt: 0, routes: 0, jobs: 1 },
  { n: "6", opt: 1, routes: 1, jobs: 0 },
  { n: "7", opt: 1, routes: 1, jobs: 1 },
  { n: "8", opt: 0, routes: 0, jobs: 1 },
  { n: "9", opt: 0, routes: 0, jobs: 0 },
  { n: "10", opt: 0, routes: 0, jobs: 1 },
];

// ── Jornada B (respaldo de D25) ───────────────────────────────────────────────────────────
// 7 asignadas; s6 nunca se recoge. Las 6 recogidas van de t = -10 a t = -5.

const RECOGIDAS_B = ["s1", "s2", "s3", "s4", "s5", SIN_COORDENADAS];

const recogeB1: Evento = {
  n: "B1",
  tMin: -10,
  descripcion: "Recoge 6 de 7 de una en una, 1 por minuto (GPS en B)",
  correr: (j) => recogerDeUnaEnUna(j, RECOGIDAS_B, B),
};

const JORNADA_B: Evento[] = [
  recogeB1,
  {
    n: "B2",
    tMin: -4,
    descripcion: "Pantalla abierta, la posicion en vivo llega a 400 m de B",
    correr: (j) => salir(j, alOeste(B, 400)),
  },
  {
    n: "B3",
    tMin: -3,
    descripcion: "La posicion en vivo pasa de 1000 m de B",
    correr: (j) => salir(j, alOeste(B, 1100)),
  },
  {
    n: "B4",
    tMin: -2,
    descripcion: "Otra lectura a 1,5 km, o se recarga la pagina",
    correr: (j) => salir(j, alOeste(B, 1500)),
  },
];

const NUEVO_B: (Conteo & { n: string })[] = [
  { n: "B1", opt: 0, routes: 0, jobs: 0 },
  { n: "B2", opt: 0, routes: 0, jobs: 0 },
  { n: "B3", opt: 1, routes: 1, jobs: 0 },
  { n: "B4", opt: 0, routes: 0, jobs: 0 },
];

describe("SLT-59/R37 — jornada de referencia (design §8.0)", () => {
  it("jornada A: la columna «Nuevo» fila a fila y en total {3, 3, 6}", async () => {
    const { j, filas, desenlaces } = await medir(JORNADA_A);
    console.info(informe("jornada A", JORNADA_A, filas));

    expect(filas).toEqual(NUEVO_A);
    expect(totales(filas)).toEqual({ opt: 3, routes: 3, jobs: 6 });

    // Fila 1 (R64): el boton con el 57 % no paga y dice cuantas lleva.
    expect(desenlaces[1]).toEqual({
      status: "omitida",
      razon: "recogida_insuficiente",
      recogidas: 4,
      asignadas: 7,
    });
    // El arnes recorrio la jornada entera: sin paradas, cola vacia, y la orden sin coordenadas
    // nunca llega al proveedor.
    expect(j.rutas.fila?.paradas).toEqual([]);
    expect(j.jobs.pendientes()).toEqual([]);
    for (const [input] of j.optimizar.mock.calls) {
      expect(input.paradas.map((p) => p.ordenId)).not.toContain(SIN_COORDENADAS);
    }
  });

  it("filas 11-13: el 401 cuesta 1 llamada; el boton respeta el enfriamiento y luego recupera", async () => {
    // Fila 11 (R29): un job cuyo `optimizeTours` responde 401 queda en dead-letter tras UNA llamada.
    const j11 = montarJornada();
    j11.proveedor.estado.rechazar = true;
    await j11.avanzarHasta(en(-10));
    await recoger(j11, TODAS, B);
    await j11.avanzarHasta(en(24 * 60));
    expect(j11.optimizar).toHaveBeenCalledTimes(1);
    expect(j11.jobs.filas).toHaveLength(1);
    expect(j11.jobs.filas[0]).toMatchObject({ estado: "failed", intentos: 1 });

    // Filas 12 y 13 (R53): con la ruta del dia hecha, una sincronizacion a mano falla con 401
    // (fuera de las filas). Despues, el boton sin cambios ni desvio espera el enfriamiento.
    const j = montarJornada();
    await j.avanzarHasta(en(-10));
    await recoger(j, TODAS, B);
    await j.avanzarHasta(en(30));
    j.proveedor.estado.rechazar = true;
    await expect(sincronizar(j, alNorte(PARADAS.s3, 1500))).rejects.toThrow();
    expect(j.rutas.fila?.estado).toBe("desactualizada");
    j.proveedor.estado.rechazar = false;

    const { filas, desenlaces } = await medir(
      [
        { n: "12", tMin: 32, descripcion: "Pulsa 2 min despues del fallo", correr: (jj) => sincronizar(jj, alNorte(A, 50)) },
        { n: "13", tMin: 36, descripcion: "Pulsa a los 6 min", correr: (jj) => sincronizar(jj, alNorte(A, 50)) },
      ],
      j,
    );
    expect(filas).toEqual([
      { n: "12", opt: 0, routes: 0, jobs: 0 },
      { n: "13", opt: 1, routes: 1, jobs: 0 },
    ]);
    expect(desenlaces[0]).toMatchObject({ status: "omitida", razon: "enfriamiento" });
    expect(desenlaces[1]).toMatchObject({ status: "ok" });
  });

  it("jornada B: la salida a mas de 1000 m paga la primera ruta y nada mas, {1, 1, 0}", async () => {
    const { filas } = await medir(JORNADA_B);
    console.info(informe("jornada B", JORNADA_B, filas));
    expect(filas).toEqual(NUEVO_B);
    expect(totales(filas)).toEqual({ opt: 1, routes: 1, jobs: 0 });
  });

  it("variante B: la primera gestion antes de alejarse -> 1 / 1 / 1 (R59)", async () => {
    const eventos: Evento[] = [
      recogeB1,
      {
        n: "B-gestion",
        tMin: -4,
        descripcion: "Gestiona s1 antes de alejarse",
        correr: (j) => gestionar(j, "s1", alOeste(B, 100)),
      },
    ];
    const { filas } = await medir(eventos);
    console.info(informe("variante B, primera gestion", eventos, filas));
    expect(totales(filas)).toEqual({ opt: 1, routes: 1, jobs: 1 });
  });

  it("variante B: el boton con 6 de 7 recogidas (86 %) -> 1 / 1 / 0 (R64)", async () => {
    const eventos: Evento[] = [
      recogeB1,
      { n: "B-boton", tMin: -4, descripcion: "Pulsa con el 86 %", correr: (j) => sincronizar(j, B) },
    ];
    const { filas, desenlaces } = await medir(eventos);
    console.info(informe("variante B, boton 86 %", eventos, filas));
    expect(desenlaces[1]).toMatchObject({ status: "ok" });
    expect(totales(filas)).toEqual({ opt: 1, routes: 1, jobs: 0 });
  });

  it("variante B: el boton con 5 de 7 recogidas (71 %) no paga y dice «5 de 7» (R64)", async () => {
    const j = montarJornada();
    await j.avanzarHasta(en(-10));
    await recogerDeUnaEnUna(j, ["s1", "s2", "s3", "s4", "s5"], B);
    const antes = j.conteo();
    const desenlace = await sincronizar(j, B);
    expect(desenlace).toEqual({
      status: "omitida",
      razon: "recogida_insuficiente",
      recogidas: 5,
      asignadas: 7,
    });
    const despues = j.conteo();
    expect({ opt: despues.opt - antes.opt, routes: despues.routes - antes.routes }).toEqual({
      opt: 0,
      routes: 0,
    });
  });
});
