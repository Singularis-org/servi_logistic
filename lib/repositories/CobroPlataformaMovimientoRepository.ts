import type { PrismaClient } from "@prisma/client";

import type {
  ICobroPlataformaMovimientoRepository,
  SumaCobroPlataformaPorTipo,
} from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";

// SL-40 (design §5) — lectura de los cargos y reversos del cobro de la plataforma. Ningún método
// escribe: los movimientos los registran los triggers sobre `orden` (design §2.2).

type CobroPlataformaPrismaClient = Pick<PrismaClient, "cobroPlataformaMovimiento">;

export class CobroPlataformaMovimientoRepository implements ICobroPlataformaMovimientoRepository {
  constructor(private readonly prisma: CobroPlataformaPrismaClient) {}

  async sumasPorTipo(organizacionId: string): Promise<SumaCobroPlataformaPorTipo[]> {
    // El filtro va escrito aunque la extensión y la RLS ya acoten a la empresa de la sesión (R24): es
    // dinero de una empresa, y su aislamiento no puede depender de con qué cliente se construyó el
    // repositorio. Sin período ni ningún otro filtro: la deuda es la de toda la historia (R23).
    const filas = await this.prisma.cobroPlataformaMovimiento.groupBy({
      by: ["tipo"],
      where: { organizacionId },
      _sum: { monto: true },
    });
    return filas.map((f) => ({ tipo: f.tipo, monto: f._sum.monto === null ? "0.00" : f._sum.monto.toFixed(2) }));
  }
}
