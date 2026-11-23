import type { Prisma } from "@prisma/client";

import { JobRepository } from "@/lib/repositories/JobRepository";
import { encolarEnEmpresas } from "@/lib/repositories/_shared/encolar-en-empresas";

// SLT-121 (design §4.2; R26-R29) — el encolado de los correos de la mora, en la transacción que congela,
// descongela o recorre los recordatorios (outbox): si el cambio no se confirma, no queda correo; si el correo
// falla después, el cambio no se deshace y la cola lo reintenta (R29). El manejador (`mora_aviso_correo`) es de
// la Tanda 3 y relee el estado antes de enviar.

/**
 * El payload de `mora_aviso_correo` (SLT-121 design §4.2). SLT-255 (design §4.1) suma las tres formas de la
 * prórroga: dada, alargada o acortada (R16), quitada (R17) y la víspera de su fecha hasta (R18).
 */
export type AvisoMoraPayload =
  | { tipo: "recordatorio"; facturaId: string }
  | { tipo: "congelada"; congeladaAt: string }
  | { tipo: "descongelada"; motivo: "pago" | "a_mano" | "gracia"; hasta?: string }
  | { tipo: "prorroga"; cambio: "dada" | "alargada" | "acortada"; hasta: string }
  | { tipo: "prorroga_quitada"; hasta: string }
  | { tipo: "prorroga_vence"; hasta: string };

export const dedupeAvisoMora = {
  recordatorio: (facturaId: string, fechaLimite: string) => `mora_aviso:recordatorio:${facturaId}:${fechaLimite}`,
  congelada: (organizacionId: string, congeladaAt: Date) =>
    `mora_aviso:congelada:${organizacionId}:${congeladaAt.toISOString()}`,
  descongelada: (organizacionId: string, ahora: Date) =>
    `mora_aviso:descongelada:${organizacionId}:${ahora.toISOString()}`,
  prorroga: (organizacionId: string, ahora: Date) => `mora_aviso:prorroga:${organizacionId}:${ahora.toISOString()}`,
  prorrogaQuitada: (organizacionId: string, ahora: Date) =>
    `mora_aviso:prorroga_quitada:${organizacionId}:${ahora.toISOString()}`,
  // R18: con la fecha hasta, la víspera sale una sola vez por empresa y fecha aunque la corrida se repita.
  prorrogaVence: (organizacionId: string, hasta: string) => `mora_aviso:prorroga_vence:${organizacionId}:${hasta}`,
};

export interface AvisoMoraAEncolar {
  payload: AvisoMoraPayload;
  dedupeKey: string;
  runAfter?: Date;
}

/** Encola los avisos con la empresa fijada (el `organizacion_id` del trabajo sale de ella). Cuántos entraron. */
export async function encolarAvisosDeMora(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  organizacionId: string,
  avisos: readonly AvisoMoraAEncolar[],
): Promise<number> {
  const jobs = new JobRepository(tx);
  let encolados = 0;
  await encolarEnEmpresas(
    tx,
    avisos.map((a) => ({
      organizacionId,
      encolar: async () => {
        const job = await jobs.enqueue(
          "mora_aviso_correo",
          a.payload,
          { dedupeKey: a.dedupeKey, ...(a.runAfter ? { runAfter: a.runAfter } : {}) },
          tx,
        );
        if (job !== null) encolados++;
      },
    })),
  );
  return encolados;
}
