import { EMPRESA } from "@/lib/config/marca";
import { money } from "@/lib/config/moneda";

/**
 * FICHA 458-D (T D.2, design §5; R17, R26–R28) — textos del ESTADO DE CUENTA de una tienda
 * (`/wallet/tiendas/[tiendaId]`) y del enlace que lleva a él desde el listado. Módulo PURO (sin React).
 *
 * Los nombres de las tres acciones son los de la 461 §7 y la 457, desde la empresa diciendo quién le paga
 * a quién: los mismos con los que se rotula su fila en el libro de la tienda (`CATEGORIA_TIENDA_LABEL`).
 */

export const ACCIONES_TIENDA_TEXTO = {
  /** R26 (457) — solo con saldo en contra. */
  tiendaPaga: `La tienda le paga a ${EMPRESA.enFrase}`,
  /** R27 (461). */
  empresaCobra: `${EMPRESA.alInicio} le cobra a la tienda`,
  /** R28 (172). */
  empresaPaga: `${EMPRESA.alInicio} le paga a la tienda`,
  /** R28 — el motivo del botón deshabilitado, en texto visible. */
  sinSaldoAFavor: (tienda: string) =>
    `${EMPRESA.alInicio} no le debe nada a ${tienda}: sin saldo a favor no hay nada que pagarle.`,
} as const;

/**
 * Los pagos de la empresa a la tienda (172), dentro de su estado de cuenta. `anulado` pinta el saldo que
 * devuelve el SERVIDOR tal cual, aunque sea negativo (textos de la 172, que vivían en `PagoTiendaAcciones`).
 */
export const PAGOS_TIENDA_TEXTO = {
  titulo: `Pagos de ${EMPRESA.enFrase} a la tienda`,
  seccion: (tienda: string) => `Pagos de ${EMPRESA.enFrase} a ${tienda}`,
  anulado: (saldo: string) => `Pago anulado. El saldo de la tienda quedó en ${money(saldo)}.`,
  yaAnulado: "Este pago ya estaba anulado.",
} as const;

export const ESTADO_CUENTA_TIENDA_PAGINA = {
  titulo: (tienda: string) => `Estado de cuenta de ${tienda}`,
  descripcion:
    `Cada movimiento del libro de la tienda con su saldo corrido: lo cobrado a sus clientes, los cargos, los cobros y los pagos entre ${EMPRESA.enFrase} y la tienda`,
  volver: "Volver a los saldos por tienda",
} as const;

/** R17 — el enlace de la fila del listado. El nombre accesible empieza por el texto visible. */
export const ENLACE_ESTADO_CUENTA_TIENDA = {
  columna: "Estado de cuenta",
  visible: "Ver estado de cuenta",
  nombre: (tienda: string) => `Ver estado de cuenta de ${tienda}`,
} as const;

/** FICHA 463 (R45) — el buscador del listado de saldos de tiendas: por nombre de tienda. */
export const BUSCADOR_SALDOS_TIENDAS = {
  label: "Buscar por tienda",
  placeholder: "Buscar por nombre de la tienda",
} as const;
