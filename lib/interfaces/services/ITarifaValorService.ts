import type { Actor } from "@/lib/interfaces/services/ITarifaService";
import type { FijarValorInput, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

/**
 * SLT-52 (design §8) — resultados de dominio. Una zona, grupo, tienda o vehiculo que no existe en
 * la empresa es `validation_error` sobre su campo (patron `TarifaService`), no `not_found`: el
 * `not_found` queda para el id del valor que se quiere quitar.
 */
export type FijarValorResult =
  | { status: "ok"; id: string }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "forbidden" };

export type QuitarValorResult = { status: "ok" } | { status: "forbidden" } | { status: "not_found" };

export type ListarValoresResult = { status: "ok"; items: TarifaValorDTO[] } | { status: "forbidden" };

export interface ITarifaValorService {
  fijarValor(input: FijarValorInput, actor: Actor): Promise<FijarValorResult>;
  quitarValor(id: string, actor: Actor): Promise<QuitarValorResult>;
  listarValores(filtro: { zonaId?: string }, actor: Actor): Promise<ListarValoresResult>;
}
