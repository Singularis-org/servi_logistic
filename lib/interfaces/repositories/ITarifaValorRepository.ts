import type { TarifaConcepto, TarifaNivel } from "@prisma/client";

import type { ModoTarifa, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 (design §8, R3-R9, R14) — escritura y lectura de `tarifa_valor`.
 *
 * La empresa NO viaja en ningun metodo: la pone la extension del cliente (`app.organizacion_id`) en
 * cada consulta, y la politica RLS la respalda (R15).
 */

/** Lo que el service ya valido y entrega para escribir. `nivel` solo se usa para el historial. */
export interface FijarValorDatos {
  concepto: TarifaConcepto;
  modo: ModoTarifa;
  /** Texto decimal ya validado (R4). */
  valor: string;
  /** Obligatorio en los cobros a la tienda, `null` en los pagos (R3, R45). */
  ivaPct: string | null;
  nivel: TarifaNivel;
  zonaId: string | null;
  grupoId: string | null;
  tiendaId: string | null;
  vehiculoId: string | null;
}

export interface FijarValorResultado {
  id: string;
  /** `true` si ya habia un valor en ese concepto y nivel y se reemplazo (R8). */
  reemplazo: boolean;
}

export interface ITarifaValorRepository {
  existeZona(zonaId: string): Promise<boolean>;
  /** El grupo existe en la empresa Y es de esa zona. */
  grupoEnZona(grupoId: string, zonaId: string): Promise<boolean>;
  /** El usuario existe en la empresa con rol `adminTienda` o `apiKey` (regla de `TarifaService`). */
  esTiendaTarifable(tiendaId: string): Promise<boolean>;
  /** `vehiculos` es catalogo de plataforma: solo se comprueba que exista. */
  existeVehiculo(vehiculoId: string): Promise<boolean>;
  /**
   * Upsert por la clave natural (R8) + `tarifa_valor_fijado` con antes/despues, en UNA transaccion.
   * `"nivel_ocupado"`: otra fijacion simultanea creo antes la fila de ese nivel (`tarifa_valor_nivel_key`).
   */
  fijar(datos: FijarValorDatos, actorUsuarioId: string | null): Promise<FijarValorResultado | "nivel_ocupado">;
  /** Borrado fisico (R9) + `tarifa_valor_quitado`, en UNA transaccion. */
  quitar(id: string, actorUsuarioId: string | null): Promise<"ok" | "not_found">;
  listar(filtro: { zonaId?: string }): Promise<TarifaValorDTO[]>;
}
