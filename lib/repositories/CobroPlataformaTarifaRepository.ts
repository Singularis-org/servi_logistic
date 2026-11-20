import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { ICobroPlataformaTarifaRepository } from "@/lib/interfaces/repositories/ICobroPlataformaTarifaRepository";

/**
 * SL-40 (design §3.1, §5) — el valor global (`cobro_plataforma_tarifa`, una sola fila). Una empresa
 * no puede leerlo ni escribirlo (`REVOKE` de las migraciones, R8), así que todo corre en
 * `comoPlataforma`: como dueño y sin filtro de empresa. SLT-126 (R2, R10): la excepción por empresa
 * ya no existe.
 *
 * Los importes entran como texto y Prisma los manda al `DECIMAL` tal cual; salen con `toFixed(2)`.
 * Nada pasa por `Number`.
 */
export class CobroPlataformaTarifaRepository implements ICobroPlataformaTarifaRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "cobroPlataformaTarifa">) {}

  leerGlobal(): Promise<string | null> {
    return comoPlataforma("SL-40", "leer el valor global del cobro por orden", async () => {
      const fila = await this.prisma.cobroPlataformaTarifa.findUnique({ where: { id: true }, select: { monto: true } });
      return fila ? fila.monto.toFixed(2) : null;
    });
  }

  fijarGlobal(monto: string): Promise<void> {
    return comoPlataforma("SL-40", "fijar el valor global del cobro por orden", async () => {
      await this.prisma.cobroPlataformaTarifa.upsert({
        where: { id: true },
        create: { id: true, monto },
        update: { monto },
      });
    });
  }
}
