// Feature 90 (design §4) — contrato del servicio drenador de la cola de jobs. Logica de
// negocio pura (sin HTTP ni Prisma directo): orquesta claim -> handler -> complete /
// backoff / dead-letter / recurrencia. El controller `procesar-jobs` la invoca.
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";

/** Ejecuta la logica de un tipo de job. Lanza si falla (el service traduce a fail/backoff). */
export type JobHandler = (job: JobDTO) => Promise<void>;

/**
 * Metadatos de recurrencia por tipo. Calcula el reencolado de la PROXIMA ocurrencia a partir del
 * momento de la corrida. La idempotencia la garantiza el `dedupeKey` + `ON CONFLICT DO NOTHING`
 * del `enqueue` (R25 de la 90).
 *
 * SLT-42 (design §6.1; R25, R26): `zonas` son las zonas horarias de los paises con empresas, que
 * la cola lee antes de llamar. Los diarios agendan la zona que antes llega a su hora; las
 * recurrencias que no son diarias la ignoran.
 *
 * Decision del humano tras el bloque 6: las series diarias por zona cuentan desde el instante
 * ORIGINAL de la corrida (`corridaOriginal`), no desde el drenado. Asi una corrida retrasada por
 * reintentos no salta la zona siguiente. Las demas cuentan desde el drenado, como siempre.
 */
export interface RecurrenciaSpec {
  /** `desde`: el instante original de la corrida si la serie tiene `corridaOriginal`; si no, el del drenado. */
  siguiente(desde: Date, zonas: readonly string[]): { runAfter: Date; dedupeKey: string };
  /**
   * Solo las series diarias por zona: el instante con que se agendo esta corrida. No es
   * `job.runAfter`, que un reintento con backoff pisa. Si existe, la cola avisa de un error cuando
   * no hay zonas con empresas.
   */
  corridaOriginal?(job: JobDTO): Date;
}

/**
 * Conteos agregados de una corrida del drenador (R18, gate F1.4-5). SIN PII ni secretos:
 * `procesados` = reclamados; `ok` = completados; `fallidos` = handler lanzo (reintentado o
 * muerto); `reintentados` = re-agendados con backoff; `muertos` = dead-letter (`failed`).
 */
export interface DrenarResult {
  procesados: number;
  ok: number;
  fallidos: number;
  reintentados: number;
  muertos: number;
  /** SL-23 (R20): jobs de un módulo apagado para su empresa; ni ok ni fallidos. */
  descartados: number;
}

export interface IJobQueueService {
  /**
   * R14-R16/R23-R25: reclama hasta `limit` jobs vencidos y por cada uno ejecuta su handler.
   * Exito -> `complete` (+ re-agenda la proxima ocurrencia si es recurrente, R23). Fallo ->
   * si quedan intentos, backoff `min(cap, base*2^(intentos-1))` (R15); si se agotaron,
   * dead-letter (R16) Y re-agenda la proxima ocurrencia si es recurrente (R24). Devuelve
   * conteos agregados sin PII.
   */
  drenar(limit: number): Promise<DrenarResult>;
}
