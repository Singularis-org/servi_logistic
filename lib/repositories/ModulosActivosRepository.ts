import type { ModuloApagable, PrismaClient } from "@prisma/client";

import type { IModulosActivosRepository } from "@/lib/interfaces/repositories/IModulosActivosRepository";

type ModulosActivosPrismaClient = Pick<PrismaClient, "organizacionModulo">;

// SL-23 (design §5.1; R4, R7, R25) — la lectura de las puertas. Un `findMany` sin `where` de empresa:
// el filtro lo pone la extensión con la empresa del contexto o de la sesión, y la RLS lo respalda.
// Sin empresa, la extensión no ejecuta la consulta y lanza `EmpresaNoResuelta`.

export class ModulosActivosRepository implements IModulosActivosRepository {
  constructor(private readonly prisma: ModulosActivosPrismaClient) {}

  async activos(): Promise<ModuloApagable[]> {
    const filas = await this.prisma.organizacionModulo.findMany({ select: { modulo: true } });
    return filas.map((f) => f.modulo);
  }
}
