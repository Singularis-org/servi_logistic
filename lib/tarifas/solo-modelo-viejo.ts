import type { TarifaVigenteResuelta } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { TarifaTienda } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 — PUENTE DE TRANSICION entre T3 y T4/T5. Debe quedar sin llamadores (y borrarse) antes
 * de cerrar la ficha (T7.4).
 *
 * Por que existe: desde T3.3 el resolver devuelve `TarifaTienda` (viejo | nuevo), pero las
 * funciones que calculan con la tarifa (`derivarIngresoOrden`, `costosListadoOrden`,
 * `desgloseCargaApi`, el snapshot del cierre…) aprenden el modelo nuevo en T4.1/T5. Hasta
 * entonces cada superficie desenvuelve aqui la rama vieja, que es el codigo de hoy (R36).
 *
 * Por que LANZA en el modelo nuevo en vez de devolver `null`: `null` es «sin tarifa», y una
 * superficie lo convertiria en silencio en un cobro de 0 o en un 409. Una empresa en el modelo
 * nuevo no puede existir todavia (nadie escribe `tarifa_valor` hasta T6/SLT-54), asi que este
 * error solo se veria si alguien adelanta esa escritura: mejor un fallo con nombre que dinero mal
 * calculado.
 */
export class ModeloNuevoSinSoporte extends Error {
  constructor(superficie: string) {
    super(
      `tarifas: la superficie «${superficie}» todavia no calcula con el modelo nuevo (SLT-52 T4/T5)`,
    );
    this.name = "ModeloNuevoSinSoporte";
  }
}

export function soloModeloViejo(
  tarifa: TarifaTienda | null,
  superficie: string,
): TarifaVigenteResuelta | null {
  if (tarifa === null) return null;
  if (tarifa.modelo === "viejo") return tarifa.tarifa;
  throw new ModeloNuevoSinSoporte(superficie);
}
