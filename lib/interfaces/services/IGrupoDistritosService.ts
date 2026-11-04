import type { Actor } from "@/lib/interfaces/services/ITarifaService";
import type { CrearGrupoInput, GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

type ValidationError = { status: "validation_error"; fieldErrors: Record<string, string[]> };

export type CrearGrupoResult = { status: "ok"; id: string } | ValidationError | { status: "forbidden" };

export type CambiarGrupoResult =
  | { status: "ok" }
  | ValidationError
  | { status: "forbidden" }
  | { status: "not_found" };

export type BorrarGrupoResult = { status: "ok" } | { status: "forbidden" } | { status: "not_found" };

export type ListarGruposResult = { status: "ok"; items: GrupoDistritosDTO[] } | { status: "forbidden" };

export interface IGrupoDistritosService {
  crearGrupo(input: CrearGrupoInput, actor: Actor): Promise<CrearGrupoResult>;
  renombrarGrupo(id: string, nombre: string, actor: Actor): Promise<CambiarGrupoResult>;
  fijarDistritos(id: string, distritoIds: readonly string[], actor: Actor): Promise<CambiarGrupoResult>;
  borrarGrupo(id: string, actor: Actor): Promise<BorrarGrupoResult>;
  listarGrupos(zonaId: string, actor: Actor): Promise<ListarGruposResult>;
}
