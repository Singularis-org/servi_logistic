// Feature 124 (D4->C1, design §8, R36/R37/R38) — handler DELGADO del job recurrente
// `analitica_rollup_diario` + su `RecurrenciaSpec`. Patron calcado de
// `liberar-reprogramadas-handler.ts` (feature 90).
//
// El handler NO agrega nada por su cuenta: deriva la fecha objetivo del reloj INYECTADO y
// delega TODO en `AnaliticaRollupService.agregarFecha(fecha)`, que es idempotente (R27) y
// todo-o-nada (R30), asi que un re-claim por visibility timeout o un reintento con backoff
// son seguros.
//
// Este modulo NO nombra la tabla del rollup ni la consulta de ninguna forma: la unica puerta a
// esa tabla es `lib/repositories/AnaliticaRollupRepository.ts` (guardia de frontera, R42).
import type { IAnaliticaRollupService } from "@/lib/interfaces/services/IAnaliticaRollupService";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { AnaliticaRollupService } from "@/lib/services/AnaliticaRollupService";
import { AnaliticaRollupRepository } from "@/lib/repositories/AnaliticaRollupRepository";
import { OrdenHistorialService } from "@/lib/services/OrdenHistorialService";
import { OrdenHistorialRepository } from "@/lib/repositories/OrdenHistorialRepository";
import { OrdenDiaRepartoCambioRepository } from "@/lib/repositories/OrdenDiaRepartoCambioRepository";
import { OrdenTraspasoRepository } from "@/lib/repositories/OrdenTraspasoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import { fechaObjetivo } from "@/lib/analytics/rollup-dia";
import { dedupeKeyRollup } from "@/lib/services/jobs/analitica-rollup-diario-encolado";
// Feature 128 (R10/R11): la invalidacion de la cache de analitica cuelga de aqui. Entra por
// PUERTO (`IAnaliticaCache`), no por `next/cache`: este modulo lo importan tests unitarios que
// corren sin runtime de Next, donde `revalidateTag` lanza (R21).
import { cacheNula } from "@/lib/cache/cache-nula";
import { TAGS_OPERATIVA } from "@/lib/analytics/cache-tags";
import type { IAnaliticaCache } from "@/lib/interfaces/external/IAnaliticaCache";

import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { zonaDeLaEmpresa } from "@/lib/services/zona-de-la-empresa";
import { sumarDiasCalendario } from "@/lib/utils/calendario-zona";
import {
  corridaOriginalDeLaClave,
  instanteDeLaCorrida,
  leerClaveConZona,
  proximaCorridaPorZona,
  zonaLlegaALaHora,
  type HoraObjetivo,
} from "@/lib/services/jobs/serie-diaria-por-zona";
import { DEDUPE_PREFIX } from "@/lib/services/jobs/analitica-rollup-diario-encolado";

/** 00:30 locales: la hora objetivo de la serie (D3). */
export const HORA_ROLLUP: HoraObjetivo = { hora: 0, minuto: 30 };

/**
 * D3 — proxima corrida = **00:30 locales del dia siguiente**, ESTRICTAMENTE posterior a `now`, de
 * la zona que antes llega a esa hora entre las de los paises con empresas (SLT-42, R25). Con solo
 * Costa Rica, las 06:30 UTC de siempre (R26).
 *
 * Por que 00:30 y no 00:00: `vercel.json` arranca `corte-diario` y `generar-gastos-fijos` a
 * las `0 6 * * *` (00:00 CR). Media hora de margen contra el ARRANQUE del corte —no contra su
 * final, que nadie ha medido—. Bajo D1->A2 ese margen ya no decide el `estatus_id` (las
 * transiciones `corte_sin_gestionar` caen en el corte exacto y la cota estricta las deja
 * fuera), pero si la deriva de las tres coordenadas que NO se congelan: cuanto antes corra,
 * menos deriva acumulan.
 */
export function proximaCorridaRollup(now: Date, zonas: readonly string[]): { runAfter: Date; zona: string } {
  return proximaCorridaPorZona(now, zonas, HORA_ROLLUP);
}

/**
 * R36 — registro de recurrencia. El `dedupeKey` lleva la zona de la corrida y la fecha que ESA
 * corrida agregara en esa zona (D-1 respecto de la corrida), no la fecha de la corrida: ver
 * `analitica-rollup-diario-encolado.ts`.
 */
export const recurrenciaAnaliticaRollupDiario: RecurrenciaSpec = {
  siguiente(desde: Date, zonas: readonly string[]) {
    const { runAfter, zona } = proximaCorridaRollup(desde, zonas);
    return { runAfter, dedupeKey: dedupeKeyRollup(fechaObjetivo(runAfter, zona), zona) };
  },
  // La clave lleva la fecha OBJETIVO: la corrida es el dia siguiente a las 00:30 de su zona.
  corridaOriginal: (job) => corridaOriginalDeLaClave(job, DEDUPE_PREFIX, HORA_ROLLUP, 1),
};

/** Sumidero del resumen de la corrida, inyectable para test. NUNCA registra PII (R37). */
export interface RollupJobLogger {
  info(mensaje: string): void;
}

const defaultLogger: RollupJobLogger = { info: (m) => console.log(m) };

/**
 * R22/R37/R38 — handler delgado.
 *
 * - Deriva la fecha objetivo con `fechaObjetivo(now())` (D3: el dia que acaba de cerrar) y
 *   delega en el servicio. Ni una linea de agregacion vive aqui.
 * - Registra el resumen de la corrida con **conteos agregados y nada mas** (R37): fecha,
 *   filas escritas, filas retiradas y ms. Sin ids, sin destinatarios, sin telefonos.
 * - `JSON.stringify` del registro es DELIBERADO (R32): si alguien metiera aqui un `BigInt`
 *   —`seg_ciclo_acum` lo es en la base— la serializacion lanzaria `TypeError` y el job
 *   moriria. Que el test lo cace aqui, en un handler de dos lineas, y no en produccion.
 * - Feature 128 (R10): tras agregar, INVALIDA la cache del dominio operativa. El
 *   `invalidador` tiene default `cacheNula()` para que los tests de la 124 sigan corriendo sin
 *   tocarlos y sin arrastrar el runtime de Next. Ese default es un no-op, asi que el riesgo
 *   real —que el composition root se olvide de pasar el puerto de verdad— no lo cubre el tipo:
 *   lo cubre una asercion estatica sobre `app/api/cron/procesar-jobs/route.ts` en
 *   `tests/unit/analytics/cache-invalidacion-job.test.ts`.
 * - NO hay `try/catch` (R38): un fallo del servicio se propaga tal cual, con su fecha y su
 *   etapa dentro del `AnaliticaRollupError`, para que `JobQueueService` lo cuente como fallo,
 *   aplique el backoff y acabe en dead-letter si toca. Tragarselo dejaria el dia sin agregar
 *   y el job marcado como completado con exito.
 */
export function crearAnaliticaRollupDiarioHandler(
  service: IAnaliticaRollupService,
  now: () => Date = () => new Date(),
  logger: RollupJobLogger = defaultLogger,
  invalidador: IAnaliticaCache = cacheNula(),
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
): JobHandler {
  return async (job) => {
    // SLT-42 (design §6.1; R25, R26, R28): corre dentro de la empresa. Sin zona en su pais, falla
    // esa empresa. Una corrida de otra zona (que no llega a las 00:30 en ese instante) no hace
    // nada; una clave vieja, sin zona, corre para todas. La fecha objetivo, en la zona de la empresa.
    const zona = await zonaDeLaEmpresa(reglasPais, "analitica_rollup_diario");
    const corrida = leerClaveConZona(job.dedupeKey, DEDUPE_PREFIX);
    if (corrida !== null) {
      // La clave lleva la fecha OBJETIVO; la corrida es la del dia siguiente.
      const instante = instanteDeLaCorrida(sumarDiasCalendario(corrida.fecha, 1), corrida.zona, HORA_ROLLUP);
      if (!zonaLlegaALaHora(zona, instante, HORA_ROLLUP)) return;
    }
    const fecha = fechaObjetivo(now(), zona);
    const resumen = await service.agregarFecha(fecha);
    // Feature 128 (R10/R11) — la invalidacion va DESPUES de que `agregarFecha` resuelva y
    // SIN `try/catch`. Si el agregado fallo no hay nada que invalidar; y si la invalidacion
    // falla, el job NO puede reportar exito: el error sube para que `JobQueueService` lo
    // cuente como fallo y aplique su backoff. Una invalidacion que falla en silencio deja la
    // cifra congelada para siempre y sin senal — el modo de fallo mas caro de esta feature.
    await invalidador.invalidar("job_rollup_diario", TAGS_OPERATIVA);
    const registro = {
      job: "analitica_rollup_diario",
      fecha: resumen.fecha,
      filasEscritas: resumen.filasEscritas,
      filasRetiradas: resumen.filasRetiradas,
      ms: resumen.ms,
    };
    logger.info(`[analitica_rollup_diario] ${JSON.stringify(registro)}`);
  };
}

/**
 * Construye el servicio real con sus repos (patron de `buildLiberarReprogramadasService`).
 * `getPrismaClient()` es un singleton perezoso: llamarlo aqui NO abre conexion, que es lo que
 * permite que `buildHandlers` se construya en un test sin base.
 */
export function buildAnaliticaRollupService(now: () => Date): IAnaliticaRollupService {
  const prisma = getPrismaClient();
  return new AnaliticaRollupService(
    new AnaliticaRollupRepository(prisma),
    new OrdenHistorialService(
      new OrdenRepository(prisma),
      new OrdenHistorialRepository(prisma),
      new OrdenDiaRepartoCambioRepository(prisma),
      new OrdenTraspasoRepository(prisma),
    ),
    { now },
    construirReglasPaisEmpresa(prisma), // SLT-42 (R22, R28): la zona horaria del pais de la empresa.
  );
}
