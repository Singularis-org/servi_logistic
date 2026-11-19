import { Prisma } from "@prisma/client";

import type {
  CobroPlataformaPrismaClient,
  ICobroPlataformaMovimientoRepository,
  SumaCobroPlataformaPorTipo,
} from "@/lib/interfaces/repositories/ICobroPlataformaMovimientoRepository";

// SL-40 (design §5) — lectura de los cargos y reversos del cobro de la plataforma. Ningún método
// escribe: los movimientos los registran los triggers sobre `orden` (design §2.2).
// SLT-118 (design §5; R18): y las cuotas de las facturas cerradas, que tampoco se escriben aquí.

export class CobroPlataformaMovimientoRepository implements ICobroPlataformaMovimientoRepository {
  constructor(private readonly prisma: CobroPlataformaPrismaClient) {}

  async sumasPorTipo(
    organizacionId: string,
    cliente?: CobroPlataformaPrismaClient,
  ): Promise<SumaCobroPlataformaPorTipo[]> {
    // El filtro va escrito aunque la extensión y la RLS ya acoten a la empresa de la sesión (R24): es
    // dinero de una empresa, y su aislamiento no puede depender de con qué cliente se construyó el
    // repositorio. Sin período ni ningún otro filtro: la deuda es la de toda la historia (R23).
    // SL-45 (design §6): con `cliente`, dentro de la transacción del tope.
    const db = cliente ?? this.prisma;
    const filas = await db.cobroPlataformaMovimiento.groupBy({
      by: ["tipo"],
      where: { organizacionId },
      _sum: { monto: true },
    });
    const sumas: SumaCobroPlataformaPorTipo[] = filas.map((f) => ({
      tipo: f.tipo,
      monto: f._sum.monto === null ? "0.00" : f._sum.monto.toFixed(2),
    }));
    // SLT-118 (design §5; R18): solo las cerradas; una en curso o por cerrar no suma. Las dos cuotas
    // (P18) se suman en decimal: un `number` perdería los céntimos.
    const cuotas = await db.facturaPlataforma.aggregate({
      where: { organizacionId, estado: "cerrada" },
      _sum: { cuota: true, primeraCuota: true },
    });
    const { cuota, primeraCuota } = cuotas._sum;
    if (cuota !== null || primeraCuota !== null) {
      const total = (cuota ?? new Prisma.Decimal(0)).add(primeraCuota ?? new Prisma.Decimal(0));
      sumas.push({ tipo: "cuota", monto: total.toFixed(2) });
    }
    return sumas;
  }
}
