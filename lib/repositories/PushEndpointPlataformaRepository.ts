import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { IPushEndpointPlataformaRepository } from "@/lib/interfaces/repositories/IPushEndpointPlataformaRepository";

// SL-18 (design §7, R26–R28) — PUSH: EL ÚLTIMO GANA.
//
// `push_suscripcion.endpoint` es único en toda la plataforma: un navegador tiene un solo dueño. En el
// contexto de la empresa B, el upsert por endpoint no ve la fila de A (filtro de la extensión y RLS),
// intenta crear y choca con P2002, y A sigue enviando a ese navegador. Solo la plataforma ve la fila
// de A, así que este borrado corre en `comoPlataforma` y está en `EXCEPCIONES_DE_PLATAFORMA` con la
// ficha SL-18.
//
// Es seguro porque el `where` lleva el endpoint EXACTO (nunca toca otro, R28) y excluye la empresa
// actual (la reescritura del dueño dentro de la empresa sigue siendo del upsert de siempre, R27).
// Para llegar aquí hace falta una sesión válida y el endpoint, que solo conoce el navegador que lo
// tiene: la misma confianza que ya da el upsert de la ficha 410 dentro de una empresa.

type PushEndpointPrismaClient = Pick<PrismaClient, "pushSuscripcion">;

const FICHA = "SL-18";
const MOTIVO = "push: el último gana";

export class PushEndpointPlataformaRepository implements IPushEndpointPlataformaRepository {
  constructor(private readonly prisma: PushEndpointPrismaClient) {}

  liberarDeOtrasEmpresas(endpoint: string, organizacionIdActual: string): Promise<number> {
    // Sin empresa actual, `{ not: undefined }` no filtraría nada y el borrado se llevaría también la
    // fila propia: se corta antes de abrir la plataforma, igual que `conEmpresa` con un id vacío.
    if (typeof organizacionIdActual !== "string" || organizacionIdActual.trim() === "") {
      return Promise.reject(new TypeError("liberarDeOtrasEmpresas: organizacionIdActual vacio"));
    }
    return comoPlataforma(FICHA, MOTIVO, async () => {
      const { count } = await this.prisma.pushSuscripcion.deleteMany({
        where: { endpoint, organizacionId: { not: organizacionIdActual } },
      });
      return count;
    });
  }
}
