import type { Actor } from "@/lib/interfaces/services/ITarifaService";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

export type GuardarTopeIntentosResult =
  | { status: "ok"; tope: number }
  | { status: "forbidden" }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> };

/** SLT-77 (design §4.1) — el ajuste de intentos de entrega de la empresa. */
export interface ITopeIntentosService {
  guardar(input: unknown, actor: Actor): Promise<GuardarTopeIntentosResult>;
}
