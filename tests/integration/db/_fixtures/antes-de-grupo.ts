import type { AntesDeBorrar, AntesDeMiembros } from "@/lib/types/tarifa-flexible";

import type { TxDeTest } from "../_postgres-real";

/**
 * SLT-89 (R43–R45, design §5.5; T5.6) — EL «ANTES» DE UN GRUPO TAL COMO ESTA SEMBRADO.
 *
 * Renombrar, cambiar miembros y borrar un grupo exigen ahora el «antes» que mostro el modal (decision
 * humana del 2026-11-09). Los tests de antes de SLT-89 no lo mandaban; ganan este, que es exactamente
 * lo que el grupo tiene en la base en ese momento, asi que el control de cambio concurrente no
 * interviene y lo que afirman del resultado no cambia (R38).
 */
export async function antesDeMiembros(
  tx: Pick<TxDeTest, "grupoDistritosDistrito" | "grupoDistritosNodo">,
  grupoId: string,
): Promise<AntesDeMiembros> {
  const distritos = await tx.grupoDistritosDistrito.findMany({ where: { grupoId }, select: { distritoId: true } });
  const nodos = await tx.grupoDistritosNodo.findMany({ where: { grupoId }, select: { nodoGeograficoId: true } });
  return { distritoIds: distritos.map((d) => d.distritoId), nodoIds: nodos.map((n) => n.nodoGeograficoId) };
}

/** El «antes» de borrar: nombre, miembros y numero de valores del grupo (SLT-54 R43). */
export async function antesDeBorrar(
  tx: Pick<TxDeTest, "grupoDistritos" | "grupoDistritosDistrito" | "grupoDistritosNodo" | "tarifaValor">,
  grupoId: string,
): Promise<AntesDeBorrar> {
  const grupo = await tx.grupoDistritos.findUniqueOrThrow({ where: { id: grupoId }, select: { nombre: true } });
  return {
    nombre: grupo.nombre,
    ...(await antesDeMiembros(tx, grupoId)),
    valores: await tx.tarifaValor.count({ where: { grupoId } }),
  };
}
