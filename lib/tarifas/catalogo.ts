/**
 * SLT-52 (R1, R2, R27, R28) — la lista CERRADA de conceptos de tarifa, fijada por la app.
 *
 * Por que existe ademas del enum `tarifa_concepto`: el enum solo dice QUE conceptos hay; el resto
 * del modelo nuevo necesita saber, por concepto, a que actor se le cobra o paga, de que resultado
 * de gestion sale y sobre que base se aplica su porcentaje. Si eso se dedujera del nombre en cada
 * sitio (`startsWith("tienda_")`, `endsWith("_rechazo")`), un concepto nuevo podria quedar a medias
 * en un camino y bien en otro. Aqui se declara una vez y `catalogo.test.ts` lo cruza con el enum de
 * Prisma y con `GestionResultado` (R2: un resultado nuevo sin sus tres conceptos pone rojo el test).
 *
 * Modulo PURO y solo con imports de TIPO: lo importa `lib/types/tarifa-flexible.ts`, que puede
 * acabar en el grafo del navegador, y un import de valor de `@prisma/client` arrastraria el cliente.
 */
import type { GestionResultado, TarifaActor, TarifaConcepto } from "@prisma/client";

/**
 * Base de un concepto en porcentaje. La fija la app, no la empresa (decision cerrada «Base de un
 * concepto en %»): el cobro a la tienda va sobre el valor del pedido (R27) y el pago al mensajero
 * o a la satelite sobre el flete sin IVA que se le cobra a la tienda por esa gestion (R28).
 */
export type BaseDelPorcentaje = "pedido" | "flete";

export interface EntradaCatalogo {
  actor: TarifaActor;
  /** `null` solo en fulfillment y comision COD: no dependen del resultado de la gestion (R1). */
  resultado: GestionResultado | null;
  base: BaseDelPorcentaje;
}

/**
 * `satisfies Record<TarifaConcepto, …>` hace que un valor nuevo del enum que no este aqui (o uno
 * de aqui que no este en el enum) no compile; el test lo repite en tiempo de ejecucion contra el
 * enum generado, que es la fuente que de verdad llega de la base.
 */
export const CATALOGO_CONCEPTOS = {
  tienda_flete_entregado: { actor: "tienda", resultado: "entregado", base: "pedido" },
  tienda_flete_reprogramado: { actor: "tienda", resultado: "reprogramado", base: "pedido" },
  tienda_flete_novedad: { actor: "tienda", resultado: "novedad", base: "pedido" },
  tienda_flete_rechazo: { actor: "tienda", resultado: "devolucion_a_origen_por_rechazo", base: "pedido" },
  tienda_flete_incidente: { actor: "tienda", resultado: "incidente", base: "pedido" },
  tienda_fulfillment: { actor: "tienda", resultado: null, base: "pedido" },
  tienda_comision_cod: { actor: "tienda", resultado: null, base: "pedido" },
  mensajero_entregado: { actor: "mensajero", resultado: "entregado", base: "flete" },
  mensajero_reprogramado: { actor: "mensajero", resultado: "reprogramado", base: "flete" },
  mensajero_novedad: { actor: "mensajero", resultado: "novedad", base: "flete" },
  mensajero_rechazo: { actor: "mensajero", resultado: "devolucion_a_origen_por_rechazo", base: "flete" },
  mensajero_incidente: { actor: "mensajero", resultado: "incidente", base: "flete" },
  satelite_entregado: { actor: "satelite", resultado: "entregado", base: "flete" },
  satelite_reprogramado: { actor: "satelite", resultado: "reprogramado", base: "flete" },
  satelite_novedad: { actor: "satelite", resultado: "novedad", base: "flete" },
  satelite_rechazo: { actor: "satelite", resultado: "devolucion_a_origen_por_rechazo", base: "flete" },
  satelite_incidente: { actor: "satelite", resultado: "incidente", base: "flete" },
} as const satisfies Record<TarifaConcepto, EntradaCatalogo>;

type Catalogo = typeof CATALOGO_CONCEPTOS;

/** Los conceptos que se cobran a la tienda: los unicos que llevan IVA (decision P4). */
export type ConceptoTienda = {
  [C in keyof Catalogo]: Catalogo[C]["actor"] extends "tienda" ? C : never;
}[keyof Catalogo];

/** Los pagos al mensajero y a la satelite: sin IVA (decision P4, R34, R45). */
export type ConceptoPago = Exclude<TarifaConcepto, ConceptoTienda>;

export type ActorPago = Exclude<TarifaActor, "tienda">;

export const CONCEPTOS: readonly TarifaConcepto[] = Object.keys(CATALOGO_CONCEPTOS) as TarifaConcepto[];

export function esConceptoTienda(concepto: TarifaConcepto): concepto is ConceptoTienda {
  return CATALOGO_CONCEPTOS[concepto].actor === "tienda";
}

export function esConceptoPago(concepto: TarifaConcepto): concepto is ConceptoPago {
  return !esConceptoTienda(concepto);
}

export const CONCEPTOS_TIENDA: readonly ConceptoTienda[] = CONCEPTOS.filter(esConceptoTienda);
export const CONCEPTOS_PAGO: readonly ConceptoPago[] = CONCEPTOS.filter(esConceptoPago);

export function actorDe(concepto: TarifaConcepto): TarifaActor {
  return CATALOGO_CONCEPTOS[concepto].actor;
}

/**
 * El concepto de `actor` que corresponde a una gestion con `resultado`. Se busca en el catalogo en
 * vez de componer el nombre porque `devolucion_a_origen_por_rechazo` se llama `*_rechazo` en el
 * enum: componerlo daria un concepto que no existe.
 *
 * Lanza si no hay concepto: con el catalogo completo (lo garantiza el test de R2) eso solo puede
 * pasar si la app gana un resultado sin catalogarlo, y callar ahi cobraria o pagaria 0 sin aviso.
 */
export function conceptoPorResultado(actor: "tienda", resultado: GestionResultado): ConceptoTienda;
export function conceptoPorResultado(actor: ActorPago, resultado: GestionResultado): ConceptoPago;
export function conceptoPorResultado(actor: TarifaActor, resultado: GestionResultado): TarifaConcepto;
export function conceptoPorResultado(actor: TarifaActor, resultado: GestionResultado): TarifaConcepto {
  const encontrado = CONCEPTOS.find(
    (c) => CATALOGO_CONCEPTOS[c].actor === actor && CATALOGO_CONCEPTOS[c].resultado === resultado,
  );
  if (encontrado === undefined) {
    throw new Error(`catalogo de tarifas sin concepto para actor=${actor} resultado=${resultado}`);
  }
  return encontrado;
}
