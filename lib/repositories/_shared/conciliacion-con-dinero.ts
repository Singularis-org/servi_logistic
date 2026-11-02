import type { Prisma } from "@prisma/client";

/**
 * SLT-76 (R3-R5, design §2.1/§3) — QUE CONSOLIDACIONES YA TIENEN DINERO ASENTADO POR SU
 * CONCILIACION, escrito UNA vez para los tres lectores:
 *
 *   - `CierresBodegaAdminRepository.revertirConciliacion` (R5): si la consolidacion esta en el
 *     conjunto, la reversion devuelve `con_asientos` sin escribir nada;
 *   - `CierreBodegaRepository` (las filas de `/cierres-admin`) y `SaldosSatelitesRepository` (el
 *     desglose de `/wallet/satelites`): `desmarcable = conciliada && !conjunto.has(id)` (R3/R4).
 *
 * Con un predicado por lector, el boton «Desmarcar» y el rechazo del servidor divergen en
 * silencio: es lo que paso hasta SLT-76, cuando el conteo solo miraba los asientos `cierre_dia` y
 * una consolidacion con ajustes se revertia dejando la diferencia huerfana en la caja (m4 de SLT-73).
 *
 * «Con dinero» = al menos una de estas dos cosas:
 *   1. una fila de `wallet_movimiento` con `origen_tipo = 'cierre_dia'` de alguno de sus cierres;
 *   2. una fila de `conciliacion_bodega_ajuste`.
 *
 * Prisma con el cliente que recibe (la transaccion del llamador o el cliente de la peticion), asi
 * que la extension inyecta la empresa y la RLS cubre: no hay SQL a mano. El numero de consultas es
 * fijo por llamada (los cierres del dia de todas las ids, sus asientos, y los ajustes), nunca una
 * por fila. Sin ids no consulta nada.
 */
export type ClienteConciliacionConDinero = Pick<
  Prisma.TransactionClient,
  "cierreDia" | "walletMovimiento" | "conciliacionBodegaAjuste"
>;

export async function consolidacionesConDinero(
  cliente: ClienteConciliacionConDinero,
  cierreBodegaIds: readonly string[],
): Promise<Set<string>> {
  const conDinero = new Set<string>();
  if (cierreBodegaIds.length === 0) return conDinero;
  const ids = [...cierreBodegaIds];

  const [conAsientos, conAjuste] = await Promise.all([
    consolidacionesConAsientos(cliente, ids),
    cliente.conciliacionBodegaAjuste.findMany({
      where: { cierreBodegaId: { in: ids } },
      distinct: ["cierreBodegaId"],
      select: { cierreBodegaId: true },
    }),
  ]);
  for (const id of conAsientos) conDinero.add(id);
  for (const a of conAjuste) conDinero.add(a.cierreBodegaId);
  return conDinero;
}

/** (1) Las consolidaciones con al menos un asiento de caja `cierre_dia` de sus cierres del dia. */
async function consolidacionesConAsientos(
  cliente: ClienteConciliacionConDinero,
  ids: string[],
): Promise<string[]> {
  const cierresDia = await cliente.cierreDia.findMany({
    where: { cierreBodegaId: { in: ids } },
    select: { id: true, cierreBodegaId: true },
  });
  if (cierresDia.length === 0) return [];

  const asentados = await cliente.walletMovimiento.findMany({
    where: { origenTipo: "cierre_dia", origenId: { in: cierresDia.map((c) => c.id) } },
    distinct: ["origenId"],
    select: { origenId: true },
  });
  const cierresAsentados = new Set(asentados.map((m) => m.origenId));
  return cierresDia.flatMap((c) =>
    c.cierreBodegaId !== null && cierresAsentados.has(c.id) ? [c.cierreBodegaId] : [],
  );
}
