import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { INivelesEmpresaRepository } from "@/lib/interfaces/repositories/INivelesEmpresaRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { NivelesEmpresaRepository } from "@/lib/repositories/NivelesEmpresaRepository";

// SLT-215 (design §5; R29, R30) — el cierre diario de los niveles por volumen, con su composition root. Calcado de
// `jobs-factura-plataforma.ts`. Lo cablea `app/api/cron/procesar-jobs/route.ts` (`buildHandlers`,
// `buildRecurrencias` y `RECURRENTES_DE_PLATAFORMA`); su primera fila la siembra
// `scripts/siembra-jobs-recurrentes.ts`. De núcleo (`MODULO_POR_JOB`).
//
//   · `plan_niveles_cerrar`: recurrente una vez al día a las 06:20 UTC (00:20 de la plataforma, P1), sin empresa,
//     UNA vez en plataforma. Corre todos los días aunque solo el día 1 haya meses que cerrar: un día 1 caído lo
//     recoge el día 2, y los días sin pendientes la lista de empresas sale vacía.

/* -------------------------------------------------------------------------- */
/* Composition root                                                           */
/* -------------------------------------------------------------------------- */

/** El repositorio real. `getPrismaClient()` es perezoso: construirlo no abre conexión. */
export function buildNivelesEmpresaRepositoryDeJobs(): INivelesEmpresaRepository {
  return new NivelesEmpresaRepository(getPrismaClient());
}

/* -------------------------------------------------------------------------- */
/* Recurrencia y siembra                                                       */
/* -------------------------------------------------------------------------- */

export const DEDUPE_PREFIX_CIERRE_NIVELES = "plan_niveles_cerrar";

/** Hora y minuto UTC de la corrida diaria (P1: 00:20 de la plataforma, −06:00). */
export const HORA_DEL_CIERRE_NIVELES_UTC = 6;
export const MINUTO_DEL_CIERRE_NIVELES = 20;

/** El siguiente 06:20 UTC estrictamente posterior a `now`. */
export function proximaCorridaCierreNiveles(now: Date): Date {
  const corrida = new Date(now.getTime());
  corrida.setUTCHours(HORA_DEL_CIERRE_NIVELES_UTC, MINUTO_DEL_CIERRE_NIVELES, 0, 0);
  return corrida.getTime() > now.getTime() ? corrida : new Date(corrida.getTime() + 24 * 60 * 60 * 1000);
}

/** `plan_niveles_cerrar:<AAAA-MM-DD>`: una corrida por día, aunque se siembre o re-agende dos veces. */
export function dedupeKeyCierreNiveles(runAfter: Date): string {
  return `${DEDUPE_PREFIX_CIERRE_NIVELES}:${runAfter.toISOString().slice(0, 10)}`;
}

// Diaria y de plataforma: ignora las `zonas` de la cola (como `factura_plataforma_cerrar`).
export const recurrenciaCierreNiveles: RecurrenciaSpec = {
  siguiente(now: Date) {
    const runAfter = proximaCorridaCierreNiveles(now);
    return { runAfter, dedupeKey: dedupeKeyCierreNiveles(runAfter) };
  },
};

/**
 * La primera fila de la serie (ficha 313: un recurrente sin primera fila no arranca nunca), con la MISMA
 * `dedupe_key` que la recurrencia: sembrar en cada despliegue no duplica ni adelanta la corrida. La registra
 * `scripts/siembra-jobs-recurrentes.ts > SIEMBRAS_RECURRENTES`.
 */
export function sembrarCierreNiveles(repo: IJobRepository, now: Date = new Date()): Promise<JobDTO | null> {
  const { runAfter, dedupeKey } = recurrenciaCierreNiveles.siguiente(now, []);
  return repo.enqueue(DEDUPE_PREFIX_CIERRE_NIVELES, {}, { runAfter, dedupeKey });
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * R29, R30: cierra empresa por empresa, cada una en su transacción, con un solo «ahora» para toda la corrida. Un
 * fallo de una no frena a las demás; si alguna falló, el trabajo falla DESPUÉS, con sus ids y causas, para que el
 * backoff lo reintente. Las que cerraron no se repiten: el reintento ya no las encuentra con meses pendientes.
 */
export function crearCierreNivelesHandler(
  repo: Pick<INivelesEmpresaRepository, "empresasConMesPendiente" | "cerrarMeses">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async () => {
    const ahora = now();
    const fallidas: { organizacionId: string; causa: string }[] = [];
    for (const organizacionId of await repo.empresasConMesPendiente(ahora)) {
      try {
        await repo.cerrarMeses(organizacionId, ahora);
      } catch (err) {
        fallidas.push({ organizacionId, causa: err instanceof Error ? err.message : String(err) });
      }
    }
    if (fallidas.length > 0) {
      const ids = fallidas.map((f) => f.organizacionId).join(", ");
      const causas = fallidas.map((f) => `${f.organizacionId}: ${f.causa}`).join("; ");
      throw new Error(`plan_niveles_cerrar: fallo al cerrar ${fallidas.length} empresa(s): ${ids} — ${causas}`);
    }
  };
}
