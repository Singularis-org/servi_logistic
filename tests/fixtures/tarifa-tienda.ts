import type {
  TarifaVigente,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { TarifaTienda } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 (design §5) — los dobles del resolver de tarifas devuelven `TarifaTienda`. Los tests de
 * antes de la ficha describen empresas en el modelo VIEJO: su tarifa va envuelta tal cual, sin
 * tocar un importe (R36). `null` sigue siendo «sin tarifa».
 */
export function tarifaVieja(t: TarifaVigenteResuelta): TarifaTienda;
export function tarifaVieja(t: TarifaVigenteResuelta | null): TarifaTienda | null;
export function tarifaVieja(t: TarifaVigenteResuelta | null): TarifaTienda | null {
  return t === null ? null : { modelo: "viejo", tarifa: t };
}

/**
 * Para los dobles que solo sembraban los campos de la FORMULA (`TarifaVigente`): el resolver real
 * devuelve ademas `tarifaId` y `fulfillment`, que la formula no lee. `fulfillment: "0.00"` es la
 * tienda sin fulfillment, el mismo valor que normaliza el resolver para una fila sin monto.
 */
export function tarifaViejaDeFormula(t: TarifaVigente | null): TarifaTienda | null {
  return t === null ? null : tarifaVieja({ ...t, tarifaId: "tarifa-doble", fulfillment: "0.00" });
}

/**
 * Para los dobles de PRISMA que alimentan al `TarifaVigenteRepository` real: el resolver unico
 * pregunta primero si la empresa tiene algun valor del modelo nuevo (`tarifaValor.findFirst`).
 * Este delegado responde «ninguno», asi que el resto de la resolucion es la cascada vieja que esos
 * tests ya describen (R36).
 */
export function sinValoresDelModeloNuevo() {
  return { tarifaValor: { findFirst: async () => null } };
}

/** El Map del lote de un doble, con cada tarifa envuelta en el modelo viejo. */
export function mapaViejo(
  m: ReadonlyMap<string, TarifaVigenteResuelta | null>,
): Map<string, TarifaTienda | null> {
  const out = new Map<string, TarifaTienda | null>();
  for (const [clave, t] of m) out.set(clave, tarifaVieja(t));
  return out;
}
