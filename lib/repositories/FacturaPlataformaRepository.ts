import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { IFacturaPlataformaRepository } from "@/lib/interfaces/repositories/IFacturaPlataformaRepository";

// SLT-118 (design §2.5, §3, §4) — las facturas de la plataforma. Ningún método escribe la tabla: el cierre
// lo hace `factura_plataforma_cerrar`, del dueño, con `REVOKE EXECUTE … FROM PUBLIC`. Por eso corre como
// plataforma (sin `servi_app`), igual que el cambio de plan que llama a `factura_plataforma_tomar_cambio`.
// `FichaJira` no admite `SLT` (deuda D29): lleva `SL-24`, la ficha de los planes.

type FacturaPlataformaPrismaClient = Pick<PrismaClient, "$queryRaw" | "organizacion">;

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base (la forma de `PlanesRepository`). */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

export class FacturaPlataformaRepository implements IFacturaPlataformaRepository {
  constructor(private readonly prisma: FacturaPlataformaPrismaClient) {}

  empresasACerrar(): Promise<string[]> {
    return comoPlataforma("SL-24", "SLT-118: listar las empresas para cerrar sus facturas de la plataforma", async () => {
      const filas = await this.prisma.organizacion.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
      return filas.map((f) => f.id);
    });
  }

  cerrar(organizacionId: string, ahora: Date): Promise<number> {
    return comoPlataforma("SL-24", "SLT-118: cerrar las facturas de la plataforma de una empresa (R3, R11)", async () => {
      // Una sola sentencia: su propia transacción. La función toma la empresa en FOR UPDATE, así que dos
      // cierres, o un cierre y un cambio de plan, de la misma empresa se serializan (R11).
      const [fila] = await this.prisma.$queryRaw<{ cerradas: number }[]>`
        SELECT factura_plataforma_cerrar(${organizacionId}, ${comoTimestamp(ahora)}::timestamp) AS "cerradas"`;
      return fila?.cerradas ?? 0;
    });
  }
}
