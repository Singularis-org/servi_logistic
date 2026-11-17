import { z } from "zod";

import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";
import { empresaDelJob, type JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { IPlanesRepository } from "@/lib/interfaces/repositories/IPlanesRepository";
import type { JobHandler } from "@/lib/interfaces/services/IJobQueueService";
import type { FacturaEmitidaContexto } from "@/lib/notificaciones/emitir";
import { emitirFacturaEmitidaReal } from "@/lib/notificaciones/notificadores";
import { FacturaPlataformaRepository } from "@/lib/repositories/FacturaPlataformaRepository";
import { PlanesRepository } from "@/lib/repositories/PlanesRepository";

// SLT-136 (design §7.2; R22, R24, R25, R28, R30) — el aviso de una factura de la plataforma recién cerrada.
// Lo encola `FacturaPlataformaRepository.cerrar` en su transacción (outbox, §7.1), uno por factura y CON la
// empresa de la factura: `conSuEmpresa` lo corre en ese contexto. Es PUNTUAL y de núcleo (`MODULO_POR_JOB`);
// lo cablea `app/api/cron/procesar-jobs/route.ts`.
//
// Una factura de ₡0 sigue el mismo camino, sin rama aparte (R25). El correo a cada maestro (paso 5, R26–R27)
// llega en la tanda 6 de SLT-136.

export interface DepsAvisoFactura {
  facturas: Pick<IFacturaPlataformaRepository, "deLaEmpresa">;
  destinatarios: Pick<IPlanesRepository, "destinatariosDelAviso">;
  /** `emitirFacturaEmitidaReal`: NO best-effort, para que un aviso caído falle el trabajo y se reintente. */
  emitirAviso: (ctx: FacturaEmitidaContexto) => Promise<number>;
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
 *   4. lee los maestros activos; sin ninguno, termina con el aviso ya creado (R28).
 */
export function crearFacturaAvisoHandler(deps: () => DepsAvisoFactura): JobHandler {
  return async (job) => {
    const organizacionId = empresaDelJob(job);
    if (organizacionId === null) throw new Error("factura_plataforma_aviso: el trabajo no tiene empresa");
    const facturaId = facturaDelPayload(job);
    const { facturas, destinatarios, emitirAviso } = deps();

    const factura = (await facturas.deLaEmpresa()).find((f) => f.id === facturaId);
    if (factura === undefined || factura.estado !== "cerrada" || factura.numero === null) return;

    await emitirAviso({ facturaId: factura.id, numero: factura.numero, desde: factura.desde, hasta: factura.hasta });

    const destino = await destinatarios.destinatariosDelAviso(organizacionId, null);
    if (destino === null || destino.maestros.length === 0) return;
    // Paso 5 (el correo a cada maestro, R26–R27): tanda 6 de SLT-136.
  };
}

/** Composition root. `getPrismaClient()` es perezoso: construir las deps no abre conexión. */
export function buildDepsAvisoFactura(): DepsAvisoFactura {
  return {
    facturas: new FacturaPlataformaRepository(getPrismaClient()),
    destinatarios: new PlanesRepository(getPrismaClient()),
    emitirAviso: emitirFacturaEmitidaReal,
  };
}
