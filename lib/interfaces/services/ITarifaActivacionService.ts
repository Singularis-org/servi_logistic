import type { TarifaConcepto } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/ITarifaService";

export type { Actor } from "@/lib/interfaces/services/ITarifaService";

/**
 * SLT-54 (design §4, §5) — lo que le falta a una zona para activar. Es el minimo que necesita decidir
 * la confirmacion; `lib/tarifas/faltantes.ts` (T2.1) es quien aplica las reglas R13-R17 y puede ampliarlo.
 */
export interface FaltantesPorZona {
  zonaId: string;
  zonaNombre: string;
  faltantes: readonly { concepto: TarifaConcepto }[];
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
