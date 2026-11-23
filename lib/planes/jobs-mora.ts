import { z } from "zod";

import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { emailContacto } from "@/lib/config/email";
import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { empresaDelJob, type IJobRepository, type JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { IMoraEmpresaRepository } from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler, RecurrenciaSpec } from "@/lib/interfaces/services/IJobQueueService";
import { aCentimosConSigno, aTexto } from "@/lib/planes/centimos";
import { mananaCalendarioPlataforma } from "@/lib/planes/ciclo";
import { MoraEmpresaRepository } from "@/lib/repositories/MoraEmpresaRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import type { AvisoMoraPayload } from "@/lib/repositories/_shared/encolar-aviso-mora";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { plantillaMoraAviso, type ContenidoAvisoMora } from "@/lib/services/email/plantillas/mora-aviso";

// SLT-121 (design §4; R7, R9, R26-R29) — la corrida de madrugada de la mora y sus correos. Lo cablea
// `app/api/cron/procesar-jobs/route.ts` (`buildHandlers`, `buildRecurrencias` y `RECURRENTES_DE_PLATAFORMA`); la
// primera fila de `mora_diaria` la siembra `scripts/siembra-jobs-recurrentes.ts`. Los dos son de núcleo
// (`MODULO_POR_JOB`): la mora no depende de ningún módulo.
//
//   · `mora_diaria`: recurrente, una vez al día a las 06:30 UTC (00:30 de la plataforma, después del cierre de
//     niveles de las 00:20 y del cierre horario de facturas de los :10), sin empresa y UNA vez en plataforma.
//   · `mora_aviso_correo`: por evento y con empresa. Lo encolan, en la transacción del cambio, el repositorio de la
//     mora y el recálculo (`lib/repositories/_shared/encolar-aviso-mora.ts`). Relee el estado antes de enviar.

/* -------------------------------------------------------------------------- */
/* Composition root                                                           */
/* -------------------------------------------------------------------------- */

/** El repositorio real. `getPrismaClient()` es perezoso: construirlo no abre conexión. */
export function buildMoraEmpresaRepositoryDeJobs(): IMoraEmpresaRepository {
  return new MoraEmpresaRepository(getPrismaClient());
}

/* -------------------------------------------------------------------------- */
/* Recurrencia y siembra de `mora_diaria`                                      */
/* -------------------------------------------------------------------------- */

export const DEDUPE_PREFIX_MORA_DIARIA = "mora_diaria";

/** Hora y minuto UTC de la corrida (00:30 de la plataforma). */
export const HORA_DE_LA_MORA_DIARIA_UTC = 6;
export const MINUTO_DE_LA_MORA_DIARIA = 30;

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** El siguiente 06:30 UTC estrictamente posterior a `now`. */
export function proximaCorridaMoraDiaria(now: Date): Date {
  const corrida = new Date(now.getTime());
  corrida.setUTCHours(HORA_DE_LA_MORA_DIARIA_UTC, MINUTO_DE_LA_MORA_DIARIA, 0, 0);
  return corrida.getTime() > now.getTime() ? corrida : new Date(corrida.getTime() + UN_DIA_MS);
}

/** `mora_diaria:<AAAA-MM-DD>`: una corrida por día, aunque se siembre o re-agende dos veces. */
export function dedupeKeyMoraDiaria(runAfter: Date): string {
  return `${DEDUPE_PREFIX_MORA_DIARIA}:${runAfter.toISOString().slice(0, 10)}`;
}

// Diaria y de plataforma: ignora las `zonas` de la cola (como `plan_niveles_cerrar`).
export const recurrenciaMoraDiaria: RecurrenciaSpec = {
  siguiente(now: Date) {
    const runAfter = proximaCorridaMoraDiaria(now);
    return { runAfter, dedupeKey: dedupeKeyMoraDiaria(runAfter) };
  },
};

/**
 * La primera fila de la serie, con la MISMA `dedupe_key` que la recurrencia: sembrar en cada despliegue no duplica
 * ni adelanta la corrida. La registra `scripts/siembra-jobs-recurrentes.ts > SIEMBRAS_RECURRENTES`.
 */
export function sembrarMoraDiaria(repo: IJobRepository, now: Date = new Date()): Promise<JobDTO | null> {
  const { runAfter, dedupeKey } = recurrenciaMoraDiaria.siguiente(now, []);
  return repo.enqueue("mora_diaria", {}, { runAfter, dedupeKey });
}

/* -------------------------------------------------------------------------- */
/* Handler de `mora_diaria`                                                    */
/* -------------------------------------------------------------------------- */

/**
 * R7, R9, R26 (design §4.1): con un solo «ahora» y una sola gracia global para toda la corrida, por cada empresa con
 * saldo o congelada:
 *   1. congela si toca, en su transacción (la base decide la franja, el descongelamiento a mano y las vencidas);
 *   2. encola los recordatorios de las facturas que vencen mañana, para las 08:00 de la plataforma.
 * Los dos pasos van por separado: un congelamiento que falla no se lleva los recordatorios de esa empresa, y una
 * empresa que falla no frena a las demás. Si alguna falló, el trabajo falla DESPUÉS, con sus ids y causas, para que
 * el backoff lo reintente. Repetir no duplica (R9): congelar responde `ya_congelada` y los recordatorios tienen dedupe.
 * Un reintento fuera de la franja ya no congela (R8): espera a la madrugada siguiente.
 */
export function crearMoraDiariaHandler(
  repo: Pick<IMoraEmpresaRepository, "empresasConMora" | "congelarSiVencida" | "encolarRecordatorios">,
  now: () => Date = () => new Date(),
  graciaGlobal: () => number = diasDeGraciaGlobal,
): JobHandler {
  return async () => {
    const ahora = now();
    const gracia = graciaGlobal();
    const fallidas: { organizacionId: string; causa: string }[] = [];
    const anotar = (organizacionId: string, paso: string, err: unknown) =>
      fallidas.push({ organizacionId, causa: `${paso}: ${err instanceof Error ? err.message : String(err)}` });

    for (const organizacionId of await repo.empresasConMora()) {
      try {
        await repo.congelarSiVencida(organizacionId, ahora, gracia);
      } catch (err) {
        anotar(organizacionId, "congelar", err);
      }
      try {
        await repo.encolarRecordatorios(organizacionId, ahora, gracia);
      } catch (err) {
        anotar(organizacionId, "recordatorios", err);
      }
    }
    if (fallidas.length > 0) {
      const ids = [...new Set(fallidas.map((f) => f.organizacionId))];
      const causas = fallidas.map((f) => `${f.organizacionId}: ${f.causa}`).join("; ");
      throw new Error(`mora_diaria: fallo en ${ids.length} empresa(s): ${ids.join(", ")} — ${causas}`);
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Handler de `mora_aviso_correo`                                              */
/* -------------------------------------------------------------------------- */

export interface DepsAvisoMora {
  mora: Pick<IMoraEmpresaRepository, "moraDeLaEmpresa">;
  destinatarios: Pick<IPlanesRepository, "destinatariosDelAviso">;
  sender: IEmailSender;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
  /** URL base de la app, o `null`: el correo sale sin botón. */
  urlApp: string | null;
  /** La gracia global (`FACTURA_DIAS_GRACIA`); la base la cambia por la propia de la empresa si la tiene. */
  graciaGlobal: number;
}

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const payloadSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("recordatorio"), facturaId: z.string().min(1) }),
  z.object({ tipo: z.literal("congelada"), congeladaAt: z.iso.datetime() }),
  z.object({
    tipo: z.literal("descongelada"),
    motivo: z.enum(["pago", "a_mano", "gracia"]),
    hasta: fechaSchema.optional(),
  }),
]) satisfies z.ZodType<AvisoMoraPayload>;

/** El payload de `mora_aviso_correo`. Uno malformado falla el trabajo con su motivo en `last_error`. */
export function avisoDelPayload(job: Pick<JobDTO, "payload">): AvisoMoraPayload {
  const p = payloadSchema.safeParse(job.payload);
  if (!p.success) throw new Error("mora_aviso_correo: el payload no es un aviso de mora válido");
  return p.data;
}

/**
 * Lo que dice el correo según el estado de ahora, o `null` si ya no es cierto (design §4.2: un correo que llega
 * tarde no dice algo falso):
 *   - recordatorio: la factura sigue con saldo y su fecha límite sigue siendo mañana (pagada, o con otra fecha
 *     porque cambió la gracia, no sale: la fecha nueva tiene su propio recordatorio);
 *   - congelada: la empresa sigue congelada desde ESE instante (si se descongeló, o se descongeló y se volvió a
 *     congelar, este correo ya no toca: el nuevo congelamiento trae el suyo);
 *   - descongelada: la empresa sigue sin congelar.
 */
async function contenidoVigente(
  aviso: AvisoMoraPayload,
  deps: DepsAvisoMora,
  ahora: Date,
): Promise<ContenidoAvisoMora | null> {
  const mora = await deps.mora.moraDeLaEmpresa(ahora, deps.graciaGlobal);
  if (aviso.tipo === "recordatorio") {
    const f = mora.facturas.find((x) => x.facturaId === aviso.facturaId);
    if (f === undefined || f.vencida || f.fechaLimite !== mananaCalendarioPlataforma(ahora)) return null;
    return { tipo: "recordatorio", numero: f.numero, saldo: f.saldo, fechaLimite: f.fechaLimite };
  }
  if (aviso.tipo === "congelada") {
    if (mora.congeladaAt === null || mora.congeladaAt.getTime() !== new Date(aviso.congeladaAt).getTime()) return null;
    const vencidas = mora.facturas.filter((f) => f.vencida);
    const total = vencidas.reduce((suma, f) => suma + aCentimosConSigno(f.saldo), BigInt(0));
    return {
      tipo: "congelada",
      facturas: vencidas.map((f) => ({ numero: f.numero, saldo: f.saldo })),
      saldoVencido: aTexto(total),
    };
  }
  // SLT-255: los tres avisos de la prórroga todavía no tienen contenido (T3.2); el zod de arriba no los deja pasar.
  if (aviso.tipo !== "descongelada") return null;
  if (mora.congeladaAt !== null) return null;
  return { tipo: "descongelada", motivo: aviso.motivo, ...(aviso.hasta !== undefined ? { hasta: aviso.hasta } : {}) };
}

/**
 * `mora_aviso_correo` (en la empresa del trabajo; R26-R29), calcado de `crearFacturaAvisoHandler`:
 *   1. lee la empresa del trabajo; sin ella, falla (el aviso es de una empresa);
 *   2. relee el estado de la mora; si el correo ya no es cierto, termina sin enviar;
 *   3. lee los maestros activos; sin ninguno, termina;
 *   4. envía un correo por maestro. Si alguno falla, sigue con los demás y después lanza, sin correos en el motivo,
 *      para que la cola lo reintente (R29). El congelamiento o el descongelamiento ya se confirmó: no se deshace.
 */
export function crearMoraAvisoHandler(deps: () => DepsAvisoMora, now: () => Date = () => new Date()): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) throw new Error("mora_aviso_correo: el trabajo no tiene empresa");
    const aviso = avisoDelPayload(job);
    const d = deps();

    const contenido = await contenidoVigente(aviso, d, now());
    if (contenido === null) return;

    const destino = await d.destinatarios.destinatariosDelAviso(organizacionId, null);
    if (destino === null || destino.maestros.length === 0) return;

    let fallidos = 0;
    for (const maestro of destino.maestros) {
      try {
        await d.sender.enviar(
          plantillaMoraAviso({
            to: maestro.email,
            nombre: maestro.nombre,
            empresaNombre: destino.empresaNombre,
            contenido,
            contacto: d.contacto,
            urlApp: d.urlApp,
          }),
        );
      } catch {
        // Sin el email en el motivo: `last_error` no lleva datos personales.
        fallidos += 1;
      }
    }
    if (fallidos > 0) {
      throw new Error(
        `mora_aviso_correo: fallaron ${fallidos} de ${destino.maestros.length} envío(s) a la empresa ${organizacionId}`,
      );
    }
  };
}

/** Composition root del aviso. `getPrismaClient()` es perezoso: construir las deps no abre conexión. */
export function buildDepsAvisoMora(): DepsAvisoMora {
  return {
    mora: new MoraEmpresaRepository(getPrismaClient()),
    destinatarios: new PlanesRepository(getPrismaClient()),
    sender: crearEmailSender(),
    contacto: emailContacto(),
    urlApp: baseUrlDeLaApp(),
    graciaGlobal: diasDeGraciaGlobal(),
  };
}
