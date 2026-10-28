import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { ICobroPlataformaTarifaRepository } from "@/lib/interfaces/repositories/ICobroPlataformaTarifaRepository";

/**
 * SL-40 (design §3.1, §3.2, §5) — el valor global (`cobro_plataforma_tarifa`, una sola fila) y la
 * excepción (`organizacion.cobro_plataforma_por_orden`). Una empresa no puede leer ni escribir
 * ninguno de los dos (`REVOKE` de las migraciones, R8), así que todo corre en `comoPlataforma`: como
 * dueño y sin filtro de empresa.
 *
 * Los importes entran como texto y Prisma los manda al `DECIMAL` tal cual; salen con `toFixed(2)`.
 * Nada pasa por `Number`.
 */
export class CobroPlataformaTarifaRepository implements ICobroPlataformaTarifaRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "cobroPlataformaTarifa" | "organizacion">) {}

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

  existeEmpresa(organizacionId: string): Promise<boolean> {
    return comoPlataforma("SL-40", "comprobar la empresa de una excepción del cobro por orden", async () => {
      const fila = await this.prisma.organizacion.findUnique({ where: { id: organizacionId }, select: { id: true } });
      return fila !== null;
    });
  }

  fijarDeEmpresa(organizacionId: string, monto: string | null): Promise<boolean> {
    return comoPlataforma("SL-40", "fijar o quitar la excepción de una empresa en el cobro por orden", async () => {
      // `updateMany` y no `update`: una empresa que desaparece entre la comprobación del servicio y
      // esta escritura cuenta 0 filas y se responde `not_found`, en vez de lanzar P2025.
      const { count } = await this.prisma.organizacion.updateMany({
        where: { id: organizacionId },
        data: { cobroPlataformaPorOrden: monto },
      });
      return count > 0;
    });
  }
}
