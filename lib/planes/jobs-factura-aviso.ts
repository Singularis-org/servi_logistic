import { z } from "zod";

import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { emailContacto } from "@/lib/config/email";
import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import { empresaDelJob, type JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { FacturaEmitidaContexto } from "@/lib/notificaciones/emitir";
import { emitirFacturaEmitidaReal } from "@/lib/notificaciones/notificadores";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { MoraEmpresaRepository } from "@/lib/repositories/MoraEmpresaRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { plantillaFacturaEmitida } from "@/lib/services/email/plantillas/factura-emitida";

// SLT-136 (design §7.2; R22, R24–R28, R30) — el aviso de una factura de la plataforma recién cerrada.
// Lo encola `FacturaPlataformaRepository.cerrar` en su transacción (outbox, §7.1), uno por factura y CON la
// empresa de la factura: `conSuEmpresa` lo corre en ese contexto. Es PUNTUAL y de núcleo (`MODULO_POR_JOB`);
// lo cablea `app/api/cron/procesar-jobs/route.ts`.
//
// Una factura de ₡0 sigue el mismo camino, sin rama aparte (R25). La entrega del correo es «al menos una vez», como
// `plan_aviso_correo`: si el SMTP envía y el trabajo falla antes de marcarse hecho, el correo se repite (residuo
// aceptado en SLT-128).

export interface DepsAvisoFactura {
  facturas: Pick<IFacturaPlataformaRepository, "deLaEmpresa">;
  destinatarios: Pick<IPlanesRepository, "destinatariosDelAviso">;
  /** `emitirFacturaEmitidaReal`: NO best-effort, para que un aviso caído falle el trabajo y se reintente. */
  emitirAviso: (ctx: FacturaEmitidaContexto) => Promise<number>;
  sender: IEmailSender;
  /** Dirección de contacto del pie, o `null`. */
  contacto: string | null;
  /** URL base de la app, o `null`: el correo sale sin botón (R29). */
  urlApp: string | null;
  /**
   * SLT-121 (R25): la gracia vigente de la empresa del trabajo (la propia o la global), para la fecha límite del
   * correo. Se lee al enviar: si el superadmin la cambió entre el cierre y el envío, el correo dice la nueva.
   */
  graciaDeLaEmpresa: () => Promise<number>;
}

const payloadSchema = z.object({ facturaId: z.string().min(1) });

/** El payload de `factura_plataforma_aviso`. Uno malformado falla el trabajo con su motivo en `last_error`. */
export function facturaDelPayload(job: Pick<JobDTO, "payload">): string {
  const p = payloadSchema.safeParse(job.payload);
  if (!p.success) throw new Error("factura_plataforma_aviso: el payload no trae el id de la factura");
  return p.data.facturaId;
}

/**
 * `factura_plataforma_aviso` (en la empresa de la factura):
 *   1. lee la empresa del trabajo; sin ella, falla (el aviso es de una empresa);
 *   2. busca la factura entre las de la empresa; si no está o no está cerrada, termina sin avisar (R28);
 *   3. crea el aviso de la campanita al maestro. Si lanza, el trabajo falla antes de enviar nada y se
 *      reintenta; el reintento no lo duplica, porque la entidad es la factura (R22);
 *   4. lee los maestros activos; sin ninguno, termina con el aviso ya creado (R28);
 *   5. SLT-121 (R25): lee la gracia vigente de la empresa, para la fecha límite del correo;
 *   6. envía un correo por maestro (R26). Si alguno falla, sigue con los demás y después lanza, sin correos en el
 *      motivo (R27).
 */
export function crearFacturaAvisoHandler(deps: () => DepsAvisoFactura): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) throw new Error("factura_plataforma_aviso: el trabajo no tiene empresa");
    const facturaId = facturaDelPayload(job);
    const { facturas, destinatarios, emitirAviso, sender, contacto, urlApp, graciaDeLaEmpresa } = deps();

    const factura = (await facturas.deLaEmpresa()).find((f) => f.id === facturaId);
    if (factura === undefined || factura.estado !== "cerrada" || factura.numero === null) return;

    await emitirAviso({ facturaId: factura.id, numero: factura.numero, desde: factura.desde, hasta: factura.hasta });

    const destino = await destinatarios.destinatariosDelAviso(organizacionId, null);
    if (destino === null || destino.maestros.length === 0) return;
    const gracia = await graciaDeLaEmpresa();

    let fallidos = 0;
    for (const maestro of destino.maestros) {
      try {
        await sender.enviar(
          plantillaFacturaEmitida({
            to: maestro.email,
            nombre: maestro.nombre,
            empresaNombre: destino.empresaNombre,
            factura,
            contacto,
            urlApp,
            gracia,
          }),
        );
      } catch {
        // Sin el email en el motivo: `last_error` no lleva datos personales.
        fallidos += 1;
      }
    }
    if (fallidos > 0) {
      throw new Error(
        `factura_plataforma_aviso: fallaron ${fallidos} de ${destino.maestros.length} envío(s) a la empresa ${organizacionId}`,
      );
    }
  };
}

/** Composition root. `getPrismaClient()` es perezoso: construir las deps no abre conexión. */
export function buildDepsAvisoFactura(): DepsAvisoFactura {
  return {
    facturas: new FacturaPlataformaRepository(getPrismaClient()),
    destinatarios: new PlanesRepository(getPrismaClient()),
    emitirAviso: emitirFacturaEmitidaReal,
    sender: crearEmailSender(),
    contacto: emailContacto(),
    urlApp: baseUrlDeLaApp(),
    graciaDeLaEmpresa: () => new MoraEmpresaRepository(getPrismaClient()).graciaDeLaEmpresa(diasDeGraciaGlobal()),
  };
}
