import { z } from "zod";

import { emailContacto } from "@/lib/config/email";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { empresaDelJob, type IJobRepository, type JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { AvisoCorreoPlan, CambioPendiente, IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { plantillaCambioPlan } from "@/lib/services/email/plantillas/cambio-plan";

// SL-24 (design §16.3, §16.4; R38, R39, R44) — los trabajos del cambio programado de un plan, con su
// composition root. Los cablea `app/api/cron/procesar-jobs/route.ts` (`buildHandlers` y
// `buildRecurrencias`). Los cuatro tipos son de núcleo (`MODULO_POR_JOB`, R44).
//
//   · `plan_aplicar_cambio` (T11): puntual, sin empresa. Lo encola la programación en su misma
//     transacción con `run_after = vigente_desde`. Payload `{ planId, cambioId }`.
//   · `plan_cambios_vencidos` (T11): recurrente cada hora, sin empresa. El barrido de seguridad:
//     aplica lo que siga pendiente con `vigente_desde <= ahora` (un trabajo perdido).
//   · `plan_recordatorio_cambio` (T12): puntual, sin empresa, 7×24 h y 24 h antes de la fecha.
//     Reparte un `plan_aviso_correo` por empresa con el plan en ese momento.
//   · `plan_aviso_correo` (T12): puntual, con la empresa destino. Un correo por maestro activo.
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
/* T12: plan_recordatorio_cambio y plan_aviso_correo (§16.4; R41, R42, R45)     */
/* -------------------------------------------------------------------------- */
// Ninguno es recurrente. Los encola `PlanesRepository` en la transacción de guardar, cancelar o
// archivar (outbox), y el recordatorio encola los avisos. El correo nunca tumba la edición (R41): va
// fuera de su transacción, por la cola. Entrega «al menos una vez» (§16.4, residuo anotado): si el
// SMTP envía y el trabajo falla antes de marcarse hecho, el reintento reenvía.

/** Lo que necesita el envío: el emisor real y el contacto del pie. */
export interface DepsAvisoCorreo {
  sender: IEmailSender;
  contacto: string | null;
}

/** Composition root del envío: el emisor que elige el entorno (`crearEmailSender`, que ya compone `EnrutadorEmailSender`). */
export function buildDepsAvisoCorreo(): DepsAvisoCorreo {
  return { sender: crearEmailSender(), contacto: emailContacto() };
}

const recordatorioSchema = z.object({
  planId: z.string().min(1),
  cambioId: z.string().min(1),
  dias: z.union([z.literal(7), z.literal(1)]),
});

/**
 * `plan_recordatorio_cambio` (sin empresa, en plataforma): si ESA programación sigue pendiente,
 * encola un `plan_aviso_correo` por empresa que tiene el plan AHORA (R42). Cancelada, reemplazada o
 * aplicada: termina sin hacer nada (R39).
 */
export function crearPlanRecordatorioCambioHandler(repo: Pick<IPlanesRepository, "repartirRecordatorio">): JobHandler {
  return async (job) => {
    const p = recordatorioSchema.safeParse(job.payload);
    if (!p.success) throw new Error("plan_recordatorio_cambio: el payload no trae planId, cambioId y dias (7 o 1)");
    await repo.repartirRecordatorio({ planId: p.data.planId, cambioId: p.data.cambioId }, p.data.dias);
  };
}

const tipoAvisoSchema = z.enum(["guardado", "recordatorio_7", "recordatorio_1", "cancelado"]);
const fechaIsoSchema = z.iso.datetime().nullable();
const avisoSchema = z.object({
  cambioId: z.string().min(1).nullable(),
  planId: z.string().min(1),
  planNombre: z.string(),
  tipo: tipoAvisoSchema,
  cambios: z.record(z.string(), z.object({ antes: z.unknown(), despues: z.unknown() })),
  vigenteDesde: fechaIsoSchema,
  reemplazaA: fechaIsoSchema,
  topesPasados: z.array(
    z.object({ empresa: z.string(), tope: z.string(), usados: z.number(), maximo: z.number() }),
  ),
});

/** El payload de `plan_aviso_correo`. Uno malformado falla el trabajo con su motivo en `last_error`. */
export function avisoDelPayload(job: Pick<JobDTO, "payload">): AvisoCorreoPlan {
  const p = avisoSchema.safeParse(job.payload);
  if (!p.success) throw new Error("plan_aviso_correo: el payload no es un aviso de cambio de plan");
  if (p.data.tipo !== "guardado" && p.data.cambioId === null) {
    throw new Error("plan_aviso_correo: un recordatorio o una cancelación necesitan su cambioId");
  }
  return p.data as AvisoCorreoPlan;
}

/**
 * `plan_aviso_correo` (en la empresa destino, `conEmpresa`): un correo por maestro activo (P7).
 *   1. lee la empresa y sus maestros activos;
 *   2. si es un recordatorio, comprueba que la programación sigue pendiente; si no, termina. El
 *      `cancelado` no lo comprueba: el cambio ya no existe;
 *   3. envía. Si un envío falla, sigue con los demás y DESPUÉS falla el trabajo, para el backoff.
 */
export function crearPlanAvisoCorreoHandler(
  repo: Pick<IPlanesRepository, "destinatariosDelAviso">,
  deps: () => DepsAvisoCorreo,
): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) throw new Error("plan_aviso_correo: el trabajo no tiene empresa destino");
    const aviso = avisoDelPayload(job);
    const esRecordatorio = aviso.tipo === "recordatorio_7" || aviso.tipo === "recordatorio_1";
    const destino = await repo.destinatariosDelAviso(organizacionId, esRecordatorio ? aviso.cambioId : null);
    if (destino === null || destino.maestros.length === 0) return;

    const { sender, contacto } = deps();
    let fallidos = 0;
    for (const maestro of destino.maestros) {
      try {
        await sender.enviar(
          plantillaCambioPlan({
            to: maestro.email,
            nombre: maestro.nombre,
            empresaNombre: destino.empresaNombre,
            planNombre: aviso.planNombre,
            cambios: aviso.cambios as CambioDelPlanParaCorreo,
            vigenteDesde: aviso.vigenteDesde === null ? null : new Date(aviso.vigenteDesde),
            reemplazaA: aviso.reemplazaA === null ? null : new Date(aviso.reemplazaA),
            topesPasados: aviso.topesPasados,
            tipo: aviso.tipo,
            contacto,
          }),
        );
      } catch {
        // Sin el email en el motivo: `last_error` no lleva datos personales.
        fallidos += 1;
      }
    }
    if (fallidos > 0) {
      throw new Error(
        `plan_aviso_correo: fallaron ${fallidos} de ${destino.maestros.length} envío(s) a la empresa ${organizacionId}`,
      );
    }
  };
}
