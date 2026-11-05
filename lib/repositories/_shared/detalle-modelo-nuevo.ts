import type { PrismaClient } from "@prisma/client";

// SLT-54 (R71, menor 6 de la revision F2.2) — ¿ESTE CIERRE INCLUYE ALGUNA GESTION DEL MODELO NUEVO?
//
// Sale de `cierre_detail.tarifa_modelo`, lo congelado por orden al solicitar, y nunca del interruptor
// actual de la empresa: un cierre anterior a la activacion sigue siendo del modelo viejo. Basta una
// fila `nuevo` para que cuente, porque un rotulo que nombra solo devoluciones es falso en cuanto hay una.
//
// La empresa la pone la RLS de `cierre_detail`, como en toda lectura de negocio. Sus tests viven en
// `tests/integration/db/cierre-incluye-modelo-nuevo.test.ts`, contra Postgres.

/**
 * Para el `select` de una cabecera de `cierre_dia`: un conteo filtrado dentro de la MISMA sentencia,
 * sin una consulta por fila.
 */
export const CONTEO_DETALLE_MODELO_NUEVO = {
  select: { detalle: { where: { tarifaModelo: "nuevo" } } },
} as const;

export function incluyeModeloNuevoDe(fila: { _count: { detalle: number } }): boolean {
  return fila._count.detalle > 0;
}

/**
 * Para las filas que solo conocen el id de su cierre, como el libro de la caja, cuyo `origen_id` es
 * polimorfico y no tiene relacion en Prisma. UNA consulta por lectura, y ninguna sin ids.
 */
export async function cierresConModeloNuevo(
  cliente: Pick<PrismaClient, "cierreDetail">,
  cierreIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (cierreIds.length === 0) return new Set();
  const filas = await cliente.cierreDetail.findMany({
    where: { cierreId: { in: [...cierreIds] }, tarifaModelo: "nuevo" },
    distinct: ["cierreId"],
    select: { cierreId: true },
  });
  return new Set(filas.map((f) => f.cierreId));
}
