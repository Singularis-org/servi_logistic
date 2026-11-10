import type { Actor } from "@/lib/interfaces/services/ITarifaService";
import type { AntesDeBorrar, AntesDeMiembros, CrearGrupoInput, GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

type ValidationError = { status: "validation_error"; fieldErrors: Record<string, string[]> };

export type CrearGrupoResult = { status: "ok"; id: string } | ValidationError | { status: "forbidden" };

/** SLT-89 (R43–R45): lo que hay en la base no es el «antes» que mostro el modal. No se escribio nada. */
export type CambioConcurrente = { status: "conflict"; motivo: "cambio_concurrente" };

export type CambiarGrupoResult =
  | { status: "ok" }
  | ValidationError
  | { status: "forbidden" }
  | { status: "not_found" }
  | CambioConcurrente;

// SLT-89 (R45): sin «antes», `validation_error` en `antes`.
export type BorrarGrupoResult =
  | { status: "ok" }
  | ValidationError
  | { status: "forbidden" }
  | { status: "not_found" }
  | CambioConcurrente;


export type ListarGruposResult = { status: "ok"; items: GrupoDistritosDTO[] } | { status: "forbidden" };

export interface IGrupoDistritosService {
  crearGrupo(input: CrearGrupoInput, actor: Actor): Promise<CrearGrupoResult>;
  /** SLT-89 (R44, design §5.4): `nombreAnterior` es el nombre que el modal mostro. */
  renombrarGrupo(id: string, nombre: string, nombreAnterior: string, actor: Actor): Promise<CambiarGrupoResult>;
  /**
   * SLT-89 (R17, R43, design §5.4): `miembroIds` son los miembros pedidos, distritos y demas nodos
   * juntos (el repositorio los reparte entre las dos tablas); `antes`, los que el modal mostro.
   */
  fijarDistritos(
    id: string,
    miembroIds: readonly string[],
    antes: AntesDeMiembros,
    actor: Actor,
  ): Promise<CambiarGrupoResult>;
  /** SLT-89 (R45, design §5.4): `antes` es lo que el modal de borrar mostro. */
  borrarGrupo(id: string, antes: AntesDeBorrar, actor: Actor): Promise<BorrarGrupoResult>;
  listarGrupos(zonaId: string, actor: Actor): Promise<ListarGruposResult>;
}
