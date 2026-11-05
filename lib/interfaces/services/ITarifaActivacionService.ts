import type { AvisoGrupo, Faltante } from "@/lib/tarifas/faltantes";
import type { Actor } from "@/lib/interfaces/services/ITarifaService";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

/**
 * SLT-54 (design §4, §5) — lo que le falta a una zona para activar, segun `lib/tarifas/faltantes.ts`.
 * `usaZona` no es un faltante: el dialogo lo informa sin avisar de cobro en 0 (R16, R19).
 */
export interface FaltantesPorZona {
  zonaId: string;
  zonaNombre: string;
  faltantes: readonly Faltante[];
  usaZona: readonly AvisoGrupo[];
}

/**
 * Quien calcula los faltantes en el servidor. Es la MISMA funcion que la pantalla (design §4): la
 * decision de pedir confirmacion no puede salir de lo que el cliente crea que falta (R6).
 */
export interface IFaltantesDeActivacion {
  faltantesPorZona(): Promise<readonly FaltantesPorZona[]>;
}

export type ActivarTarifasResult =
  | { status: "ok"; activadaAt: Date }
  | { status: "ya_activada"; activadaAt: Date }
  | { status: "confirmacion_requerida"; faltantes: readonly FaltantesPorZona[] }
  | { status: "validation_error"; fieldErrors: Record<string, string[]> }
  | { status: "forbidden" };

export interface ITarifaActivacionService {
  activar(input: unknown, actor: Actor): Promise<ActivarTarifasResult>;
}
