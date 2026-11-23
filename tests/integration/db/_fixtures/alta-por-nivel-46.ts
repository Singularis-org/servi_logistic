import type { GeoRepository } from "@/lib/repositories/GeoRepository";
import { NIVELES_GEOGRAFICOS, type NivelGeografico } from "@/lib/types/geografia-nodo";

// SLT-46 (T4) — las suites de SL-20/SLT-43 daban de alta con `GeoRepository.crear(nivel, nombre,
// padreId, {paisId, codigo}, actor)`, la forma por nivel que T4 retiro del repositorio. Esto la
// reproduce SOBRE el contrato por nodo (`contextoDeAlta` + `crear`), con el tipo de la profundidad
// del nivel (P1), para que esas suites solo cambien la forma de la llamada y no sus aserciones.
// Un contenedor que no existe o que no es del nivel del padre LANZA, como lanzaba la forma retirada.

export async function altaPorNivel(
  geo: GeoRepository,
  nivel: NivelGeografico,
  nombre: string,
  padreId: string | null,
  opciones: { paisId: string; codigo: string | null },
  actorUsuarioId: string | null,
): Promise<string> {
  const profundidad = NIVELES_GEOGRAFICOS.indexOf(nivel) + 1;
  const destino = nivel === "provincia" ? { paisId: opciones.paisId } : { padreId: padreId ?? "" };
  if (nivel !== "provincia" && padreId === null) throw new Error(`falta el padre para crear un ${nivel}`);
  const contexto = await geo.contextoDeAlta(destino);
  if (contexto === null || contexto.profundidad !== profundidad) {
    throw new Error(`crear ${nivel}: el contenedor no existe`);
  }
  if (contexto.tipo === null) throw new Error(`crear ${nivel}: el pais no tiene tipo nivel_${profundidad}`);
  return geo.crear(
    {
      paisId: opciones.paisId,
      padreId: nivel === "provincia" ? null : padreId,
      profundidad,
      tipoId: contexto.tipo.id,
      nombre,
      codigo: opciones.codigo,
    },
    actorUsuarioId,
  );
}
