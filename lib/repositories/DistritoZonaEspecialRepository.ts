import type { PrismaClient } from "@prisma/client";

import type {
  AplicarCambiosZonaEspecialResult,
  IDistritoZonaEspecialRepository,
} from "@/lib/interfaces/repositories/IDistritoZonaEspecialRepository";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";
import type { CambiosZonaEspecial } from "@/lib/types/distrito-zona-especial";

type DistritoZonaEspecialPrismaClient = Pick<PrismaClient, "$transaction">;

// SL-38 (design §3) — la UNICA escritura de la marca de zona especial. La guardia R22
// (`zona-especial-punto-unico`) solo deja nombrar el modelo aqui y en `_shared/zona-especial.ts`.
//
// La empresa la ponen la extension (en el `where` del `deleteMany` y en los datos del `createMany`)
// y la RLS. Por eso B no puede borrar ni crear la marca de A aunque pida el mismo distrito (R10).
// Nunca toca `distrito`: la geografia es de plataforma (SL-17 R40).

export class DistritoZonaEspecialRepository implements IDistritoZonaEspecialRepository {
  constructor(private readonly prisma: DistritoZonaEspecialPrismaClient) {}

  async aplicarCambios(cambios: CambiosZonaEspecial): Promise<AplicarCambiosZonaEspecialResult> {
    try {
      // Una transaccion interactiva y no dos escrituras sueltas: si el `createMany` falla por un
      // distrito inexistente, el `deleteMany` de antes se revierte con el (R13).
      return await this.prisma.$transaction(async (tx) => {
        const borradas = cambios.desmarcar.length
          ? (await tx.distritoZonaEspecial.deleteMany({ where: { distritoId: { in: cambios.desmarcar } } })).count
          : 0;
        // `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre el unico (empresa, distrito): marcar lo
        // ya marcado no falla ni cuenta (R9). No oculta la FK de `distrito_id`, que no es conflicto.
        const creadas = cambios.marcar.length
          ? (
              await tx.distritoZonaEspecial.createMany({
                data: cambios.marcar.map((distritoId) => ({ distritoId })),
                skipDuplicates: true,
              })
            ).count
          : 0;
        return { estado: "ok" as const, creadas, borradas };
      });
    } catch (e) {
      // La unica FK que una marca puede violar al crearse es la de `distrito_id` (la de
      // `organizacion_id` la pone la sesion). Cualquier otro error sigue su camino.
      if (esViolacionDeClaveForanea(e)) return { estado: "distrito_inexistente" };
      throw e;
    }
  }
}
