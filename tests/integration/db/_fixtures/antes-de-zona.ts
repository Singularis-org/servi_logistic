import type { UpdateZonaData, UpdateZonaResult } from "@/lib/interfaces/repositories/IZonaRepository";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";

import type { TxDeTest } from "../_postgres-real";

/**
 * SLT-89 (R16, design §5.5; T3.7) — EL «ANTES» DE UNA ZONA TAL COMO ESTA SEMBRADA.
 *
 * Guardar una zona existente exige ahora el «antes» que mostro el modal (decision humana del
 * 2026-11-09). Los tests de antes de SLT-89 guardaban sin el; ganan este, que es exactamente lo que la
 * zona tiene en la base en ese momento (sus distritos y, si los hubiera, sus demas nodos), asi que el
 * control de cambio concurrente no interviene y lo que afirman del guardado no cambia (R38).
 *
 * Se lee con la `tx` del test y no con el cliente del repositorio: no pasa por los clientes envueltos
 * o rotos que algunos tests usan.
 */
export async function antesDeZona(
  tx: Pick<TxDeTest, "zonaDistrito" | "zonaNodo">,
  zonaId: string,
): Promise<UpdateZonaData["antes"]> {
  const distritos = await tx.zonaDistrito.findMany({ where: { zonaId }, select: { distritoId: true } });
  const nodos = await tx.zonaNodo.findMany({ where: { zonaId }, select: { nodoGeograficoId: true } });
  return {
    distritoIds: distritos.map((d) => d.distritoId),
    nodoIds: nodos.map((n) => n.nodoGeograficoId),
  };
}

/** Lo que los tests de antes de SLT-89 le pasan a `update`: todo menos el «antes». */
export type DatosSinAntes = Omit<UpdateZonaData, "antes"> & { antes?: UpdateZonaData["antes"] };

/**
 * `ZonaRepository` para los tests anteriores a SLT-89: cada `update` que llega sin «antes» lo gana con
 * `antesDeZona`, leido justo antes de la llamada. Es solo la entrada que la decision del 2026-11-09
 * añade; el guardado que se mide es el de `ZonaRepository`, sin tocar.
 */
export class ZonaRepositoryConAntes extends ZonaRepository {
  constructor(
    private readonly txDelTest: Pick<TxDeTest, "zonaDistrito" | "zonaNodo">,
    cliente: ConstructorParameters<typeof ZonaRepository>[0],
  ) {
    super(cliente);
  }

  override async update(id: string, data: DatosSinAntes, actorUsuarioId: string | null): Promise<UpdateZonaResult> {
    const antes = data.antes ?? (await antesDeZona(this.txDelTest, id));
    return super.update(id, { ...data, antes }, actorUsuarioId);
  }
}
