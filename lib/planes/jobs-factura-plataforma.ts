import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";

// SLT-118 (design §4; R3, R11, R12, R25, R39) — el cierre de las facturas de la plataforma, con su
// composition root. Lo cablea `app/api/cron/procesar-jobs/route.ts` (`buildHandlers`, `buildRecurrencias` y
// `RECURRENTES_DE_PLATAFORMA`); su primera fila la siembra `scripts/siembra-jobs-recurrentes.ts`. De núcleo
// (`MODULO_POR_JOB`).
//
//   · `factura_plataforma_cerrar`: recurrente cada hora a los :10, sin empresa, UNA vez en plataforma. Para
//     cada empresa, `factura_plataforma_cerrar(empresa, ahora)` en su transacción. Los :10 dejan atrás el
//     margen de cierre de 5 minutos (§4.3) de una emisión a las 00:00 y la cola del cambio de plan, que
//     aplica a las 00:00 (§4.4). Sin correos ni avisos (R25).

/* -------------------------------------------------------------------------- */
/* Composition root                                                           */
/* -------------------------------------------------------------------------- */

/** El repositorio real. `getPrismaClient()` es perezoso: construirlo no abre conexión. */
export function buildFacturaPlataformaRepositoryDeJobs(): IFacturaPlataformaRepository {
  return new FacturaPlataformaRepository(getPrismaClient());
}

/* -------------------------------------------------------------------------- */
/* Recurrencia y siembra                                                       */
/* -------------------------------------------------------------------------- */

export const DEDUPE_PREFIX_CIERRE_FACTURAS = "factura_plataforma_cerrar";

/** Minuto de cada hora en que corre el cierre (R25). */
export const MINUTO_DEL_CIERRE = 10;

/** El siguiente HH:10 (UTC) estrictamente posterior a `now`. */
export function proximaCorridaCierreFacturas(now: Date): Date {
  const corrida = new Date(now.getTime());
  corrida.setUTCMinutes(MINUTO_DEL_CIERRE, 0, 0);
  return corrida.getTime() > now.getTime() ? corrida : new Date(corrida.getTime() + 60 * 60 * 1000);
}

/** `factura_plataforma_cerrar:<AAAA-MM-DDTHH>`: una corrida por hora, aunque se siembre o re-agende dos veces. */
export function dedupeKeyCierreFacturas(runAfter: Date): string {
  return `${DEDUPE_PREFIX_CIERRE_FACTURAS}:${runAfter.toISOString().slice(0, 13)}`;
}

// Horaria y de plataforma: ignora las `zonas` de la cola (como `plan_cambios_vencidos`).
export const recurrenciaCierreFacturas: RecurrenciaSpec = {
  siguiente(now: Date) {
    const runAfter = proximaCorridaCierreFacturas(now);
    return { runAfter, dedupeKey: dedupeKeyCierreFacturas(runAfter) };
  },
};

/**
 * La primera fila de la serie (ficha 313: un recurrente sin primera fila no arranca nunca). Con la MISMA
 * `dedupe_key` que la recurrencia: sembrar en cada despliegue no duplica ni adelanta la corrida (R25). La
 * registra `scripts/siembra-jobs-recurrentes.ts > SIEMBRAS_RECURRENTES`.
 */
export function sembrarCierreFacturas(repo: IJobRepository, now: Date = new Date()): Promise<JobDTO | null> {
  const { runAfter, dedupeKey } = recurrenciaCierreFacturas.siguiente(now, []);
  return repo.enqueue(DEDUPE_PREFIX_CIERRE_FACTURAS, {}, { runAfter, dedupeKey });
}

/* -------------------------------------------------------------------------- */
/* Handler                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * R12: cierra empresa por empresa, cada una en su transacción. Un fallo de una no frena a las demás; si
 * alguna falló, el trabajo falla DESPUÉS, con sus ids, para que el backoff lo reintente. Las que cerraron
 * no se repiten ni se deshacen: el reintento no les encuentra nada vencido (R11). Una factura en espera de
 * un cambio de plan (R39) no es un fallo: `cerrar` se detiene sin lanzar.
 *
 * Corre UNA vez, en plataforma (`RECURRENTES_DE_PLATAFORMA`): el cierre es de todas las empresas, y con una
 * por empresa la que nunca tuvo factura no la abriría. Un solo «ahora» para toda la corrida.
 */
export function crearCierreFacturasHandler(
  repo: Pick<IFacturaPlataformaRepository, "empresasACerrar" | "cerrar">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async () => {
    const ahora = now();
    const fallidas: string[] = [];
    for (const organizacionId of await repo.empresasACerrar()) {
      try {
        await repo.cerrar(organizacionId, ahora);
      } catch {
        fallidas.push(organizacionId);
      }
    }
    if (fallidas.length > 0) {
      throw new Error(
        `factura_plataforma_cerrar: fallo al cerrar ${fallidas.length} empresa(s): ${fallidas.join(", ")}`,
      );
    }
  };
}
