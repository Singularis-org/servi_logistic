import { z } from "zod";

import { emailContacto } from "@/lib/config/email";
import { destinatariosAlertaPlan } from "@/lib/config/reporte-bug";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { empresaDelJob, type IJobRepository, type JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type {
  AvisoCorreoPlan,
  AvisoNoAplicadaPlan,
  CambioDeEmpresaPendiente,
  CambioPendiente,
  IPlanesRecepcionesRepository,
  IPlanesRepository,
} from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { fechaCalendarioPlataforma } from "@/lib/planes/ciclo";
import { MOTIVOS_NO_APLICADA, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { plantillaCambioPlan, plantillaCambioPlanNoAplicado } from "@/lib/services/email/plantillas/cambio-plan";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import { zonaDeLaEmpresa } from "@/lib/services/zona-de-la-empresa";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";

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
//   · `plan_aviso_correo` (T12): puntual, con la empresa destino. Un correo por maestro activo. SLT-128 (§14.4;
//     R28): SIN empresa solo el tipo `no_aplicada`, a cada dirección de `PLAN_CHANGE_ALERT_EMAILS`.
//   · `plan_aplicar_cambio_empresa` (SLT-86 §5.2; R17, R20): puntual, CON la empresa. Lo encola el
//     cambio de empresa con fecha futura, en su transacción, con `run_after` = sus 00:00. Payload
//     `{ cambioId }`; la empresa es la del trabajo.
//
// Todo lo que aplica pasa por `PlanesRepository.aplicarCambioProgramado` o `aplicarCambioDeEmpresa`, que
// son idempotentes: el trabajo y el barrido pueden coincidir sin aplicar dos veces.
//
// SLT-128 (design §4; R5, R22, R27): `plan_aplicar_cambio` y `plan_recordatorio_cambio` tienen además un uso
// CON empresa, sin tipos nuevos (siguen siendo de núcleo). Con empresa, el cambio llega a ESA empresa en su
// recepción (`recibirCambio`) y su recordatorio cuenta desde ella (`repartirRecordatorioDeEmpresa`); sin
// empresa, los trabajos encolados antes de SLT-128 siguen haciendo lo de siempre. El uso lo decide
// `empresaDelJob`, no el payload.

/* -------------------------------------------------------------------------- */
/* Composition root                                                           */
/* -------------------------------------------------------------------------- */

/** Lo que usan los trabajos: el catálogo y, desde SLT-128, las recepciones por empresa. */
export type PlanesRepositoryDeJobs = IPlanesRepository & IPlanesRecepcionesRepository;

/** El repositorio real. `getPrismaClient()` es perezoso: construirlo no abre conexión. */
export function buildPlanesRepositoryDeJobs(): PlanesRepositoryDeJobs {
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

const recibeAtSchema = z.iso.datetime();

/**
 * SLT-128 (§4): el payload de `plan_aplicar_cambio` CON empresa, `{ planId, cambioId, recibeAt }`. `recibeAt` no
 * llega al repositorio: `recibirCambio` ya no hace nada con una recepción movida a más tarde (aún no rige) ni
 * con una ya recibida. Se exige para que un trabajo sin su fecha falle a la vista en `last_error`.
 */
export function recepcionDelPayload(job: Pick<JobDTO, "payload">): CambioPendiente {
  const cambio = cambioDelPayload(job);
  if (!recibeAtSchema.safeParse(job.payload.recibeAt).success) {
    throw new Error("plan_aplicar_cambio: un trabajo con empresa necesita recibeAt");
  }
  return cambio;
}

/**
 * R38: aplica ESA programación cuando rige. Reemplazada, cancelada o ya aplicada → termina sin hacer
 * nada (R39); con el reloj por detrás de `vigente_desde` también, y la recoge el barrido.
 *
 * SLT-128 (§4; R5): con empresa, ESA empresa recibe ESA programación (`recibirCambio`). Sin empresa es un
 * trabajo anterior a SLT-128 y promueve el plan (`aplicarCambioProgramado`, que espera si alguna empresa aún
 * no lo recibió).
 */
export function crearPlanAplicarCambioHandler(
  repo: Pick<PlanesRepositoryDeJobs, "aplicarCambioProgramado" | "recibirCambio">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) {
      await repo.aplicarCambioProgramado(cambioDelPayload(job), now());
      return;
    }
    await repo.recibirCambio(recepcionDelPayload(job), organizacionId, now());
  };
}

/* -------------------------------------------------------------------------- */
/* plan_aplicar_cambio_empresa (SLT-86)                                        */
/* -------------------------------------------------------------------------- */

/**
 * ESE pendiente de empresa: la empresa del trabajo y el `cambioId` del payload. Un trabajo sin empresa o
 * con el payload malformado falla con su motivo en `last_error`.
 */
export function cambioDeEmpresaDelJob(job: JobDTO): CambioDeEmpresaPendiente {
  const organizacionId = empresaDelJob(job);
  const { cambioId } = job.payload;
  if (organizacionId === null) throw new Error("plan_aplicar_cambio_empresa: el trabajo no tiene empresa");
  if (typeof cambioId !== "string" || cambioId === "") {
    throw new Error("plan_aplicar_cambio_empresa: el payload no trae cambioId");
  }
  return { organizacionId, cambioId };
}

/**
 * R17, R20: aplica ESE pendiente de la empresa cuando rige. Reemplazado, cancelado o ya aplicado →
 * termina sin hacer nada; con el reloj por detrás de la fecha también, y lo recoge el barrido.
 */
export function crearPlanAplicarCambioEmpresaHandler(
  repo: Pick<IPlanesRepository, "aplicarCambioDeEmpresa">,
  now: () => Date = () => new Date(),
): JobHandler {
  return async (job) => {
    await repo.aplicarCambioDeEmpresa(cambioDeEmpresaDelJob(job), now());
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

// SLT-42 (design §6.1): horaria y de plataforma, ignora las `zonas` de la cola.
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
  const { runAfter, dedupeKey } = recurrenciaPlanCambiosVencidos.siguiente(now, []);
  return repo.enqueue(DEDUPE_PREFIX_CAMBIOS_VENCIDOS, {}, { runAfter, dedupeKey });
}

/**
 * El barrido (§16.3): aplica cada pendiente vencido. Un fallo de uno no frena a los demás; si alguno
 * falló, el trabajo falla DESPUÉS, para que el backoff lo reintente (aplicar es idempotente).
 *
 * Corre UNA vez, en plataforma, no una por empresa: el cambio es del plan, no de una empresa
 * (`RECURRENTES_DE_PLATAFORMA` en `procesar-jobs/route.ts`).
 *
 * SLT-86 (R20): una segunda pasada, la de los cambios de empresa vencidos. Va después de la de los
 * planes, para que un cambio de empresa que rige a la vez que una edición del plan se aplique con el
 * plan ya editado.
 *
 * SLT-128 (§4; R5): antes de todo, las recepciones vencidas, empresa por empresa. Así la promoción del plan
 * (segunda pasada) no espera a quien ya debía tenerlo, y un cambio de empresa que rige a la vez (tercera)
 * entra con el plan ya promovido.
 */
export function crearPlanCambiosVencidosHandler(
  repo: Pick<
    PlanesRepositoryDeJobs,
    | "recepcionesVencidas"
    | "recibirCambio"
    | "cambiosVencidos"
    | "aplicarCambioProgramado"
    | "cambiosDeEmpresaVencidos"
    | "aplicarCambioDeEmpresa"
  >,
  now: () => Date = () => new Date(),
): JobHandler {
  return async () => {
    const ahora = now();
    const fallidos: string[] = [];
    for (const { organizacionId, ...cambio } of await repo.recepcionesVencidas(ahora)) {
      try {
        await repo.recibirCambio(cambio, organizacionId, ahora);
      } catch {
        fallidos.push(`${cambio.cambioId}@${organizacionId}`);
      }
    }
    for (const cambio of await repo.cambiosVencidos(ahora)) {
      try {
        await repo.aplicarCambioProgramado(cambio, ahora);
      } catch {
        fallidos.push(cambio.cambioId);
      }
    }
    for (const cambio of await repo.cambiosDeEmpresaVencidos(ahora)) {
      try {
        await repo.aplicarCambioDeEmpresa(cambio, ahora);
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
  /**
   * SLT-42 (R22, R28): el país de la empresa destino, para pintar las fechas del correo en su zona.
   * El trabajo corre en `conEmpresa` con esa empresa. Sin zona en el país, el trabajo falla (R28).
   */
  reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">;
  /**
   * SLT-128 (§14.4; R28, P13): la lista de alertas del aviso `no_aplicada`, leída AL ENVIAR (un cambio de la
   * variable vale para los avisos aún en cola). Ausente = `PLAN_CHANGE_ALERT_EMAILS`.
   */
  destinatariosAlerta?: () => readonly string[];
}

/** Composition root del envío: el emisor que elige el entorno (`crearEmailSender`, que ya compone `EnrutadorEmailSender`). */
export function buildDepsAvisoCorreo(): DepsAvisoCorreo {
  return {
    sender: crearEmailSender(),
    contacto: emailContacto(),
    reglasPais: construirReglasPaisEmpresa(getPrismaClient()),
  };
}

const recordatorioSchema = z.object({
  planId: z.string().min(1),
  cambioId: z.string().min(1),
  dias: z.union([z.literal(7), z.literal(1)]),
});

// SLT-128 (§4; R21): con empresa, también el de 3 días, y la recepción a la que avisa.
const recordatorioDeEmpresaSchema = z.object({
  planId: z.string().min(1),
  cambioId: z.string().min(1),
  dias: z.union([z.literal(7), z.literal(3), z.literal(1)]),
  recibeAt: recibeAtSchema,
});

/**
 * `plan_recordatorio_cambio` (sin empresa, en plataforma): si ESA programación sigue pendiente,
 * encola un `plan_aviso_correo` por empresa que tiene el plan AHORA (R42). Cancelada, reemplazada o
 * aplicada: termina sin hacer nada (R39).
 *
 * SLT-128 (§4; R22): con empresa, el aviso va solo a ella y solo si su recepción sigue sin recibir con ESE
 * `recibeAt` (una recepción movida, R19, deja este recordatorio sin nada que avisar).
 */
export function crearPlanRecordatorioCambioHandler(
  repo: Pick<PlanesRepositoryDeJobs, "repartirRecordatorio" | "repartirRecordatorioDeEmpresa">,
): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) {
      const p = recordatorioSchema.safeParse(job.payload);
      if (!p.success) throw new Error("plan_recordatorio_cambio: el payload no trae planId, cambioId y dias (7 o 1)");
      await repo.repartirRecordatorio({ planId: p.data.planId, cambioId: p.data.cambioId }, p.data.dias);
      return;
    }
    const p = recordatorioDeEmpresaSchema.safeParse(job.payload);
    if (!p.success) {
      throw new Error("plan_recordatorio_cambio: el payload con empresa no trae planId, cambioId, dias (7, 3 o 1) y recibeAt");
    }
    await repo.repartirRecordatorioDeEmpresa(
      { planId: p.data.planId, cambioId: p.data.cambioId },
      organizacionId,
      p.data.dias,
      new Date(p.data.recibeAt),
    );
  };
}

const tipoAvisoSchema = z.enum(["guardado", "recordatorio_7", "recordatorio_3", "recordatorio_1", "cancelado"]);
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

// SLT-128 (§14.4; R28): el aviso sin empresa de una recepción no aplicada.
const avisoNoAplicadaSchema = z.object({
  tipo: z.literal("no_aplicada"),
  planId: z.string().min(1),
  cambioId: z.string().min(1),
  empresaId: z.string().min(1),
  empresa: z.string(),
  plan: z.string(),
  recibeAt: z.iso.datetime(),
  motivo: z.enum(MOTIVOS_NO_APLICADA),
});

/**
 * SLT-128 (§14.4; R28): el payload de `plan_aviso_correo` sin empresa. Solo el tipo `no_aplicada` va sin empresa;
 * cualquier otro falla el trabajo como antes («no tiene empresa destino»).
 */
export function avisoNoAplicadaDelPayload(job: Pick<JobDTO, "payload">): AvisoNoAplicadaPlan {
  const p = avisoNoAplicadaSchema.safeParse(job.payload);
  if (!p.success) throw new Error("plan_aviso_correo: el trabajo no tiene empresa destino");
  return p.data;
}

/**
 * La fecha de la recepción en la hora de la plataforma («1 dic 2026»): la lista de alertas no es de ninguna empresa
 * ni país. El día de la plataforma, pintado a mediodía UTC para que ninguna zona lo mueva.
 */
function fechaDeLaPlataforma(instante: Date): string {
  return fechaCortaEnZona(new Date(`${fechaCalendarioPlataforma(instante)}T12:00:00.000Z`), "UTC");
}

/**
 * SLT-128 (§14.4; R28, P13): el aviso de una recepción no aplicada, un correo por dirección de la lista. Vacía,
 * ausente o sin ninguna válida: termina sin enviar (SLT-87 R16). Si un envío falla, sigue con los demás y DESPUÉS
 * falla el trabajo, para el backoff.
 */
async function enviarAvisoNoAplicada(job: Pick<JobDTO, "payload">, deps: () => DepsAvisoCorreo): Promise<void> {
  const aviso = avisoNoAplicadaDelPayload(job);
  const { sender, contacto, destinatariosAlerta = destinatariosAlertaPlan } = deps();
  const lista = destinatariosAlerta();
  if (lista.length === 0) return;
  const fecha = fechaDeLaPlataforma(new Date(aviso.recibeAt));
  let fallidos = 0;
  for (const to of lista) {
    try {
      await sender.enviar(
        plantillaCambioPlanNoAplicado({
          to,
          empresaNombre: aviso.empresa,
          planNombre: aviso.plan,
          fecha,
          motivo: aviso.motivo,
          contacto,
        }),
      );
    } catch {
      // Sin la dirección en el motivo: `last_error` no lleva datos personales.
      fallidos += 1;
    }
  }
  if (fallidos > 0) {
    throw new Error(`plan_aviso_correo: fallaron ${fallidos} de ${lista.length} envío(s) a la lista de alertas`);
  }
}

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
 * `plan_aviso_correo` (en la empresa destino, `conEmpresa`): un correo por maestro activo (P7). SLT-128 (R28): sin
 * empresa, el aviso `no_aplicada` a cada dirección de la lista de alertas (`enviarAvisoNoAplicada`).
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
    // SLT-128 (R28): sin empresa, solo el aviso `no_aplicada` a la lista de alertas.
    if (organizacionId === null) {
      await enviarAvisoNoAplicada(job, deps);
      return;
    }
    const aviso = avisoDelPayload(job);
    const esRecordatorio =
      aviso.tipo === "recordatorio_7" || aviso.tipo === "recordatorio_3" || aviso.tipo === "recordatorio_1";
    const destino = await repo.destinatariosDelAviso(organizacionId, esRecordatorio ? aviso.cambioId : null);
    if (destino === null || destino.maestros.length === 0) return;

    const { sender, contacto, reglasPais } = deps();
    // SLT-42 (R22, R28): las fechas del correo, en la zona del país de la empresa que cambia de plan.
    // Se lee antes de enviar: sin zona, el trabajo falla sin mandar ningún correo.
    const zona = await zonaDeLaEmpresa(reglasPais, "plan_aviso_correo");
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
            zona,
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
