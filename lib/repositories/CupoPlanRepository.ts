import type { PrismaClient } from "@prisma/client";

import type { CupoOrdenes, ICupoPlanRepository } from "@/lib/interfaces/repositories/ICupoPlanRepository";

// SL-24 (design §4.2, §6.1) — lee el cupo con `plan_cupo_ordenes`, la única función de conteo que
// `servi_app` puede ejecutar.
//
// La empresa es la que la envoltura de la extensión fijó en `app.organizacion_id`, no la de
// `contextoActual()`: en la carga por sesión no hay `conEmpresa` explícito y la empresa la resuelve
// la extensión desde la sesión, así que `contextoActual()` vendría vacío. La función exige además que
// el argumento sea esa misma empresa (`42501` si no), de modo que no se puede leer el cupo de otra.
type CupoPrismaClient = Pick<PrismaClient, "$queryRaw">;

export class CupoPlanRepository implements ICupoPlanRepository {
  constructor(private readonly prisma: CupoPrismaClient) {}

  async cupoOrdenes(): Promise<CupoOrdenes | null> {
    const filas = await this.prisma.$queryRaw<CupoOrdenes[]>`
      SELECT "maximo", "usados" FROM plan_cupo_ordenes(current_setting('app.organizacion_id', true))`;
    const fila = filas[0];
    return fila === undefined ? null : { maximo: Number(fila.maximo), usados: Number(fila.usados) };
  }
}
