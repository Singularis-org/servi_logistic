import type { IJobRepository, JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { CambioPendiente, IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";

// SL-24 (design §16.3, §16.4; R38, R39, R44) — los trabajos del cambio programado de un plan, con su
// composition root. Los cablea `app/api/cron/procesar-jobs/route.ts` (`buildHandlers` y
// `buildRecurrencias`). Los cuatro tipos son de núcleo (`MODULO_POR_JOB`, R44).
//
//   · `plan_aplicar_cambio` (T11): puntual, sin empresa. Lo encola la programación en su misma
//     transacción con `run_after = vigente_desde`. Payload `{ planId, cambioId }`.
//   · `plan_cambios_vencidos` (T11): recurrente cada hora, sin empresa. El barrido de seguridad:
//     aplica lo que siga pendiente con `vigente_desde <= ahora` (un trabajo perdido).
//   · `plan_recordatorio_cambio` y `plan_aviso_correo`: T12, en este mismo archivo (sección de abajo).
//
// Todo lo que aplica pasa por `PlanesRepository.aplicarCambioProgramado`, que es idempotente: el
// trabajo y el barrido pueden coincidir sin aplicar dos veces.

/* -------------------------------------------------------------------------- */
/* Composition root                                                           */
/* -------------------------------------------------------------------------- */

/** El repositorio real. `getPrismaClient()` es perezoso: construirlo no abre conexión. */
export function buildPlanesRepositoryDeJobs(): IPlanesRepository {
  return new PlanesRepository(getPrismaClient());
}

/* -------------------------------------------------------------------------- */
/* plan_aplicar_cambio                                                         */
/* -------------------------------------------------------------------------- */

/** El payload de `plan_aplicar_cambio`. Uno malformado falla el trabajo con su motivo en `last_error`. */
export function cambioDelPayload(job: Pick<JobDTO, "payload">): CambioPendiente {
  const { planId, cambioId } = job.payload;
  if (typeof planId !== "string" || planId === "" || typeof cambioId !== "string" || cambioId === "") {
    throw new Error("plan_aplicar_cambio: el payload no trae planId y cambioId");
  }
  return { planId, cambioId };
}

/**
 * R38: aplica ESA programación cuando rige. Reemplazada, cancelada o ya aplicada → termina sin hacer
 * nada (R39); con el reloj por detrás de `vigente_desde` también, y la recoge el barrido.
 */
export function crearPlanAplicarCambioHandler(
  repo: Pick<IPlanesRepository, "aplicarCambioProgramado">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async (job) => {
    await repo.aplicarCambioProgramado(cambioDelPayload(job), now());
  };
}

/* -------------------------------------------------------------------------- */
/* plan_cambios_vencidos (recurrente)                                          */
/* -------------------------------------------------------------------------- */

export const DEDUPE_PREFIX_CAMBIOS_VENCIDOS = "plan_cambios_vencidos";

/** La siguiente hora en punto (UTC) estrictamente posterior a `now`. */
export function proximaCorridaCambiosVencidos(now: Date): Date {
  const hora = new Date(now.getTime());
  hora.setUTCMinutes(0, 0, 0);
  return new Date(hora.getTime() + 60 * 60 * 1000);
}

/** `plan_cambios_vencidos:<AAAA-MM-DDTHH>`: una corrida por hora, aunque se siembre o re-agende dos veces. */
export function dedupeKeyCambiosVencidos(runAfter: Date): string {
  return `${DEDUPE_PREFIX_CAMBIOS_VENCIDOS}:${runAfter.toISOString().slice(0, 13)}`;
}

export const recurrenciaPlanCambiosVencidos: RecurrenciaSpec = {
  siguiente(now: Date) {
    const runAfter = proximaCorridaCambiosVencidos(now);
    return { runAfter, dedupeKey: dedupeKeyCambiosVencidos(runAfter) };
  },
};

/**
 * La primera fila de la serie (ficha 313: un recurrente sin primera fila no arranca nunca). Con la
 * MISMA `dedupe_key` que la recurrencia: sembrar en cada despliegue no duplica ni adelanta la corrida.
 * La registra `scripts/siembra-jobs-recurrentes.ts > SIEMBRAS_RECURRENTES`.
 */
export function sembrarPlanCambiosVencidos(repo: IJobRepository, now: Date = new Date()): Promise<JobDTO | null> {
  const { runAfter, dedupeKey } = recurrenciaPlanCambiosVencidos.siguiente(now);
  return repo.enqueue(DEDUPE_PREFIX_CAMBIOS_VENCIDOS, {}, { runAfter, dedupeKey });
}

/**
 * El barrido (§16.3): aplica cada pendiente vencido. Un fallo de uno no frena a los demás; si alguno
 * falló, el trabajo falla DESPUÉS, para que el backoff lo reintente (aplicar es idempotente).
 *
 * Corre UNA vez, en plataforma, no una por empresa: el cambio es del plan, no de una empresa
 * (`RECURRENTES_DE_PLATAFORMA` en `procesar-jobs/route.ts`).
 */
export function crearPlanCambiosVencidosHandler(
  repo: Pick<IPlanesRepository, "cambiosVencidos" | "aplicarCambioProgramado">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async () => {
    const ahora = now();
    const fallidos: string[] = [];
    for (const cambio of await repo.cambiosVencidos(ahora)) {
      try {
        await repo.aplicarCambioProgramado(cambio, ahora);
      } catch {
        fallidos.push(cambio.cambioId);
      }
    }
    if (fallidos.length > 0) {
      throw new Error(`plan_cambios_vencidos: fallo al aplicar ${fallidos.length} cambio(s): ${fallidos.join(", ")}`);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* T12: plan_recordatorio_cambio y plan_aviso_correo (§16.4)                   */
/* -------------------------------------------------------------------------- */
// Pendiente de T12. Sus handlers van aquí, con su composition root (el emisor real de
// `lib/services/EmailProvider.ts > crearEmailSender()`), y se cablean en `buildHandlers` junto a los
// dos de arriba. Ninguno es recurrente.
