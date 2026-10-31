// Feature 90 (design §3) — contrato del repositorio de la cola de jobs. Solo queries
// Prisma (docs/architecture.md): sin logica de negocio (el backoff, la decision terminal y
// la recurrencia viven en `JobQueueService`). La interfaz NO expone `PrismaClient`.
import type { JobEstado, JobTipo } from "@prisma/client";

/**
 * DTO plano de un job (nunca la entidad Prisma cruda). `payload` se tipa como
 * `Record<string, unknown>` (JSONB); el handler de cada tipo lo interpreta.
 */
export interface JobDTO {
  id: string;
  tipo: JobTipo;
  payload: Record<string, unknown>;
  estado: JobEstado;
  intentos: number;
  maxIntentos: number;
  runAfter: Date;
  lockedAt: Date | null;
  lastError: string | null;
  dedupeKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SL-17 (D16, R42) — el job con la empresa que lo encolo. NO entra en `JobDTO` para no tocar los
 * dobles de la cola de las otras fichas: el campo es un anadido estructural que `JobRepository`
 * rellena desde la fila y que se lee con `empresaDelJob`.
 *
 * Vive en este modulo de contratos (y `JobRepository` lo reexporta) para que un SERVICE pueda
 * leer la empresa del job sin importar el repositorio concreto, que arrastra Prisma
 * (SL-36 R42/R43: `GeocodificacionService` filtra la salud de la geocodificacion por empresa).
 */
export type JobConEmpresa = JobDTO & { organizacionId: string | null };

/** La empresa del job, o `null` si no la tiene (o si viene de un doble sin el campo). */
export function empresaDelJob(job: JobDTO): string | null {
  const id = (job as Partial<JobConEmpresa>).organizacionId;
  return typeof id === "string" && id.trim() !== "" ? id : null;
}

/** Opciones del encolado (R7/R8). Todo opcional: `enqueue` rellena los defaults. */
export interface EnqueueOpts {
  /** Cuando puede reclamarse el job. Default `now()` de la DB (encolado inmediato). */
  runAfter?: Date;
  /** `max_intentos` por-fila (override por tipo, gate F1.4-2). Default `JOBS_MAX_ATTEMPTS`. */
  maxIntentos?: number;
  /** Clave de idempotencia; si ya existe una fila con ella, el insert se omite (R8). */
  dedupeKey?: string;
  /**
   * Motivo del fallo que motivo el encolado, para dejarlo en `last_error` DESDE la creacion
   * (no solo tras el primer drenado). Sin secretos. Util cuando el job nace de un fallo
   * sincrono ya diagnosticado (p. ej. la propagacion de plantillas a Meta).
   */
  lastError?: string;
}

/** SLT-59 (D29): sin `dedupeKey` no hay fila que mover, asi que aqui es obligatoria. */
export interface EncolarOMoverOpts {
  runAfter: Date;
  dedupeKey: string;
  /** Solo cuenta al CREAR la fila; mover no la cambia. Default `JOBS_MAX_ATTEMPTS`. */
  maxIntentos?: number;
}

/** Reloj/umbrales inyectados al claim para tests deterministas (R12/R13). */
export interface ClaimOpts {
  /** Momento de la corrida. Filtra `pending` vencidos (`run_after <= now`) y sella `locked_at`. */
  now: Date;
  /** `now - JOBS_VISIBILITY_TIMEOUT_MS`: `processing` con `locked_at` mas antiguo se rescata. */
  visibilityCutoff: Date;
}

/**
 * Cliente Prisma minimo consumido por el repo (patron `ApiKeyRepository`). Incluye
 * `$queryRawUnsafe`/`$executeRaw` para el claim atomico y `job` para el CRUD sencillo.
 */
export interface IJobRepository {
  /**
   * R7/R8/R9: inserta una fila `pending` (`intentos = 0`, `run_after` = `opts.runAfter ??
   * now()`). Con `ON CONFLICT ("dedupe_key") DO NOTHING`: si la `dedupeKey` ya existe, NO
   * crea fila y NO falla (idempotencia). Si se pasa `tx`, ejecuta la insercion dentro de esa
   * transaccion externa (soporte transactional-outbox para 91/92), sin abrir una propia.
   * Devuelve el `JobDTO` insertado, o `null` si el conflicto lo omitio.
   */
  enqueue(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts?: EnqueueOpts,
    tx?: JobTxClient,
  ): Promise<JobDTO | null>;

  /**
   * R10-R13: reclama atomicamente hasta `limit` jobs candidatos con `FOR UPDATE SKIP
   * LOCKED` (pendientes vencidos O `processing` colgados por visibility timeout), marcandolos
   * `processing`, sellando `locked_at = now` e incrementando `intentos`. Devuelve exactamente
   * las filas reclamadas. Dos workers concurrentes nunca reciben la misma fila (SKIP LOCKED).
   */
  claimBatch(limit: number, opts: ClaimOpts): Promise<JobDTO[]>;

  /** R14: marca el job `done`. */
  complete(id: string): Promise<void>;

  /**
   * R15/R16: persiste el desenlace de un fallo. Si `runAfter` NO es null -> re-agenda
   * (`estado = 'pending'`, `run_after = runAfter`, `last_error = error`). Si `runAfter` es
   * null -> dead-letter (`estado = 'failed'`, `last_error = error`). La DECISION (backoff vs
   * terminal) la toma el service; el repo solo persiste.
   */
  fail(id: string, error: string, runAfter: Date | null): Promise<void>;

  /**
   * SL-23 (design §4.2, R20): el job es de un módulo apagado para su empresa. `estado = 'descartado'`
   * y `last_error = motivo`. No vuelve a reclamarse: el reclamo solo toma `pending`.
   */
  descartar(id: string, motivo: string): Promise<void>;

  /**
   * Feature 92 (design §8, R4): devuelve los jobs cuya `dedupe_key` esta en `keys`. UNA
   * sola consulta por lote; `keys` vacio -> `[]` SIN consultar.
   *
   * ⚠️ POR QUE ES BUSQUEDA POR IGUALDAD Y NO POR PREFIJO (design §0.2). La tentacion es
   * buscar `LIKE 'geocodificacion:<ordenId>:%'` porque el consumidor no conocia el hash.
   * Si lo conoce: `hashDireccion` esta exportado y la clave se RECONSTRUYE exacta desde
   * `orden.direccion`. La igualdad es mejor en las cuatro dimensiones:
   *  - usa el indice unico YA existente (`jobs_dedupe_key_key`); el `LIKE` exigiria crear
   *    otro con `text_pattern_ops` bajo collation no-C;
   *  - `WHERE dedupe_key IN (...)` indexa; `LIKE ANY(array)` degenera en seq scan;
   *  - el prefijo devuelve tambien jobs de direcciones HISTORICAS, que responden por una
   *    direccion que ya no existe, y obligaria a inventar un desempate;
   *  - con prefijo, un job `failed` de la direccion VIEJA bloquearia una orden cuya
   *    direccion ya se corrigio.
   *
   * NO se anaden `cancel` ni `reschedule` a esta interfaz (design §4.1, alternativa D
   * descartada): la guarda de obsolescencia del handler (R20) resuelve el mismo problema
   * sin tocar un contrato compartido con las features 90 y 91.
   */
  findByDedupeKeys(keys: string[]): Promise<JobDTO[]>;
}

/**
 * SLT-59 (R76, R77, design §12.2 nota D29) — la cola con encolado de debounce DESLIZANTE. Va en un
 * contrato aparte para no obligar a los dobles de `IJobRepository` de las demas fichas a
 * implementarlo: solo lo exige quien lo usa (`GestionOrdenRepository`). `JobRepository` cumple los dos.
 */
export interface IJobRepositoryMovible extends IJobRepository {
  /**
   * Igual que `enqueue`, pero si la `dedupeKey` ya existe y esa fila sigue `pending`, le MUEVE
   * `run_after` y le reescribe `payload` en vez de no hacer nada. Si la fila ya no esta `pending`
   * (en curso, hecha, muerta o descartada) no crea otra ni la toca: devuelve `null`. Mismo `tx`.
   */
  encolarOMoverPendiente(
    tipo: JobTipo,
    payload: Record<string, unknown>,
    opts: EncolarOMoverOpts,
    tx?: JobTxClient,
  ): Promise<JobDTO | null>;
}

/**
 * SLT-74 — lectura del job `pending` de una `dedupeKey`, o `null`. Contrato aparte por la misma
 * razon que `IJobRepositoryMovible`: solo lo exige quien lo usa (`OptimizacionRutaService`, para
 * decir cuanto falta para la primera ruta). Acotada a la empresa en curso.
 */
export interface ILectorJobPendiente {
  findPendienteByDedupeKey(dedupeKey: string): Promise<JobDTO | null>;
}

/**
 * Cliente transaccional aceptado por `enqueue(..., tx)`: el `tx` que Prisma pasa al
 * callback de `$transaction`. Se tipa por lo que el repo usa (`$executeRaw`/`$queryRaw`),
 * evitando acoplar la interfaz a `PrismaClient` completo.
 */
export type JobTxClient = {
  $executeRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<number>;
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};
