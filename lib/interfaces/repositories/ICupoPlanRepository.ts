// SL-24 (design §6.1) — la lectura previa del cupo de órdenes de la empresa en curso. Solo sirve
// para rechazar una carga entera y para la vista previa: la autoridad es el trigger
// `plan_tope_ordenes`, que cuenta en la misma transacción del alta (R18, R24).

/** El tope de órdenes del ciclo en curso y lo que ya se usó. */
export interface CupoOrdenes {
  maximo: number;
  usados: number;
}

export interface ICupoPlanRepository {
  /** `null` si la empresa no tiene plan o su plan no topa las órdenes (R14). Sin cerrojos. */
  cupoOrdenes(): Promise<CupoOrdenes | null>;
}

/**
 * El valor por defecto del 4º parámetro de `BulkOrdenService`: no hace comprobación previa. Así los
 * constructores que no lo pasan (tests y fábricas) siguen igual, y el trigger sigue rechazando.
 */
export const SIN_CUPO: ICupoPlanRepository = {
  cupoOrdenes: async () => null,
};
