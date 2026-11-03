import { Prisma } from "@prisma/client";
import type {
  CierreGestionPendienteRow,
  GestionPendienteDeCierreRow,
} from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import type {
  ContextoPagoGestion,
  PagoCongelado,
  PagosDelCierre,
  TarifaPago,
} from "@/lib/types/tarifa-flexible";
import { importePagoNuevo, pagoPorResultado } from "@/lib/utils/pago-mensajero";
import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";
import {
  tarifaDe,
  type CierreDetalleRow,
  type ConceptoCongeladoRow,
  type TarifaCongeladaRow,
} from "@/lib/utils/cierre-detalle";
// SLT-52 (T5.5) — ciclo de import CONSCIENTE: `ingreso-empresa` importa `computeTotales` de aqui.
// Es inocuo porque ninguno de los dos usa lo importado al evaluar el modulo, solo dentro de
// funciones; la base del % tiene que salir de la MISMA `derivarIngresoOrden` que cobra la tienda.
import { derivarIngresoOrden } from "@/lib/utils/ingreso-empresa";

// Feature 41 (R4/R8) — helpers de SNAPSHOT del cierre extraídos de `CierreDiaService`
// (features 37/39/56) a un util reusable, SIN alterar la aritmética `Prisma.Decimal`
// (money-critical). Los consumen `solicitarCierre` (congela el snapshot del cierre
// `solicitado`) y `CorteDiarioService` (congela el snapshot del cierre `vencido`): un
// `vencido` es indistinguible de un `solicitado` en cuanto a totales; solo cambia el
// estado y el actor (el job vs el mensajero). NUNCA number/parseFloat sobre montos.

/**
 * SLT-52 (design §6, T5.1) — la tarifa de pago de un cierre, POR GESTION: el distrito de cada orden
 * elige su grupo, asi que dos gestiones del mismo mensajero pueden pagar distinto (R19/R20). Es lo
 * que devuelve `resolvePagos` / `resolverPagosCon`. Una gestion que no esta en el mapa, o con
 * `null` (modelo viejo, zona sin tarifa), paga `"0.00"`, como hoy (39/R8, R24).
 *
 * Estrechado en T5.1: hasta T4 tambien aceptaba la `PagoTarifa` unica del viejo sin envolver.
 */
export type TarifasDePago = ReadonlyMap<string, TarifaPago | null>;

function tarifaDeLaGestion(tarifas: TarifasDePago, gestionId: string): TarifaPago | null {
  return tarifas.get(gestionId) ?? null;
}

/**
 * SLT-52 (T5.1, design §5, R19/R20) — el `ContextoPagoGestion` de cada gestion pendiente. La zona
 * y el vehiculo son los del PAGADOR que cada camino usa hoy (solicitud y corte: la zona del
 * mensajero; R19); el distrito, la tienda, la zona de la orden, el pedido y la comision son los de
 * la ORDEN (R21, R28). Puro: el servicio decide la zona, esto solo arma el lote.
 */
export function contextosPagoDe(
  gestiones: readonly GestionPendienteDeCierreRow[],
  pagador: { mensajeroId: string; zonaId: string; vehiculoId: string | null },
): ContextoPagoGestion[] {
  return gestiones.map((g) => ({
    gestionId: g.gestionId,
    resultado: g.resultado,
    mensajeroId: pagador.mensajeroId,
    zonaId: pagador.zonaId,
    vehiculoId: pagador.vehiculoId,
    distritoId: g.distritoId,
    tiendaId: g.tiendaId,
    zonaOrdenId: g.zonaOrdenId,
    montoCobrar: g.montoCobrar,
    cobraComision: g.cobraComision,
  }));
}

/**
 * SLT-52 (T5.2, R40, R34) — las filas de `gestion_pago_congelado` de un lote de gestiones, y el
 * modelo con el que se resolvio.
 *
 * Solo el modelo NUEVO congela filas; el viejo devuelve `[]` (sigue escribiendo unicamente
 * `pago_mensajero` / `ingreso_bodega_rechazo`, R36). Un actor sin valor no tiene fila (sin tarifa =
 * paga 0, R24), igual que un concepto sin tarifa no tiene fila en `cierre_detail_concepto`.
 * `importe` sale de `importePagoNuevo`, la MISMA funcion que da `pago_mensajero` e
 * `ingreso_bodega_rechazo` (`pagoPorResultado` / `ingresoBodegaPorResultado`): no pueden divergir.
 *
 * `modelo`: el del resolver para este lote. En el nuevo nunca hay `null`; un lote cuyas entradas
 * son todas `null` es del viejo (zona sin tarifa). Sin gestiones, `null`: no se resolvio nada.
 */
export function pagosDelCierre(
  gestiones: readonly Pick<CierreGestionPendienteRow, "gestionId" | "resultado">[],
  tarifas: TarifasDePago,
): PagosDelCierre {
  let modelo: PagosDelCierre["modelo"] = null;
  const congelados: PagoCongelado[] = [];
  for (const g of gestiones) {
    const t = tarifaDeLaGestion(tarifas, g.gestionId);
    if (t === null) {
      modelo ??= "viejo";
      continue;
    }
    modelo = t.modelo;
    if (t.modelo !== "nuevo") continue;
    for (const [actor, valor] of [
      ["mensajero", t.mensajero],
      ["satelite", t.satelite],
    ] as const) {
      if (valor === null) continue;
      congelados.push({
        gestionId: g.gestionId,
        actor,
        valor,
        base: valor.modo === "porcentaje" ? t.baseFlete : null,
        importe: importePagoNuevo(actor, g.resultado, valor, t.baseFlete),
      });
    }
  }
  return { modelo, congelados };
}

/**
 * SLT-52 (T5.5, design §13) — lo que `baseDelCobroCongelado` lee del cobro congelado de UNA orden
 * en un cierre: las entradas de la formula, la tarifa vieja (columnas `tarifa_*`) y los conceptos
 * del nuevo. Es un subconjunto de `DETALLE_SELECT`, asi que sirve la fila leida de `cierre_detail`
 * y la que `crearCierre` tiene en memoria al congelarla.
 */
export type CobroCongeladoDeOrden = TarifaCongeladaRow &
  Pick<CierreDetalleRow, "montoCobrar" | "cobraComision" | "esCentral" | "esZonaEspecial"> & {
    conceptos: readonly ConceptoCongeladoRow[];
  };

/**
 * SLT-52 (T5.5, design §13, R28, R52-R55) — la base del % del pago (mensajero y satelite): el flete
 * SIN IVA que ESE cierre le cobra a la tienda por ESA gestion. Es la misma cuenta del cobro al
 * aprobar —`derivarIngresoOrden` sobre `tarifaDe(detalle)` y el pedido congelado—, no una copia:
 * `ingreso_flete` si el resultado es `entregado`, `ingreso_flete_devolucion` si no, `0.00` si no
 * aporta (concepto ausente o sin tarifa, R28/R54).
 *
 * Sirve a los dos modelos de cobro: en el nuevo es `fleteSinIvaDeGestion` sobre lo congelado; en el
 * viejo es el flete devuelto del viejo congelado (R54), que es lo unico que puede cobrar un rechazo.
 * Nada vivo entra aqui: ni el valor de hoy ni el `monto_cobrar` de hoy (R52). Texto escala 2.
 */
export function baseDelCobroCongelado(
  resultado: CierreGestionPendienteRow["resultado"],
  detalle: CobroCongeladoDeOrden,
): string {
  const ingreso = derivarIngresoOrden(
    {
      resultado,
      esCentral: detalle.esCentral,
      esZonaEspecial: detalle.esZonaEspecial,
      montoCobrar: detalle.montoCobrar === null ? null : detalle.montoCobrar.toFixed(2),
      cobraComision: detalle.cobraComision,
    },
    tarifaDe(detalle, detalle.conceptos),
  );
  const flete = resultado === "entregado" ? ingreso.ingreso_flete : ingreso.ingreso_flete_devolucion;
  return (flete ?? new Prisma.Decimal(0)).toFixed(2);
}

/**
 * SLT-52 (T5.5, design §13.2) — la tarifa de pago de cada gestion con la base REBASADA al cobro
 * congelado de su orden. Solo cambia el `baseFlete` de las del modelo nuevo; el viejo no tiene base
 * y pasa tal cual (R36). `cobroDe` solo se llama para las del nuevo: es quien lanza
 * `CierreDetalleFaltanteError` si el cierre no tiene el detalle de esa orden (69/R14, sin fallback).
 */
export function rebasarConElCobroCongelado(
  gestiones: readonly { gestionId: string; ordenId: string; resultado: CierreGestionPendienteRow["resultado"] }[],
  tarifas: TarifasDePago,
  cobroDe: (ordenId: string) => CobroCongeladoDeOrden,
): Map<string, TarifaPago | null> {
  const rebasadas = new Map<string, TarifaPago | null>(tarifas);
  for (const g of gestiones) {
    const t = tarifaDeLaGestion(tarifas, g.gestionId);
    if (t === null || t.modelo !== "nuevo") continue;
    rebasadas.set(g.gestionId, {
      ...t,
      baseFlete: baseDelCobroCongelado(g.resultado, cobroDe(g.ordenId)),
    });
  }
  return rebasadas;
}

// Feature 39/R10-R13: pago al mensajero por gestión (DERIVADO/snapshot según uso) +
// total, con la tarifa ya resuelta. Solo `entregada` paga `cobroEntregado`; el resto
// 0.00 (F1.4). Suma money-safe con Prisma.Decimal (R9). Separado del dinero recibido (R21).
export function derivarPagos(
  gestiones: readonly Pick<CierreGestionPendienteRow, "gestionId" | "resultado">[],
  tarifa: TarifasDePago,
): { pagoByGestionId: Record<string, string>; total: string } {
  const pagoByGestionId: Record<string, string> = {};
  let total = new Prisma.Decimal(0);
  for (const g of gestiones) {
    const pago = pagoPorResultado(g.resultado, tarifaDeLaGestion(tarifa, g.gestionId));
    pagoByGestionId[g.gestionId] = pago;
    total = total.plus(pago);
  }
  return { pagoByGestionId, total: total.toFixed(2) };
}

// Feature 56/R9-R12: ingreso de BODEGA por rechazo por gestión (DERIVADO/snapshot
// según uso) + total, con la MISMA tarifa ya resuelta para el pago. ESPEJO de
// `derivarPagos`: solo `rechazada` con tarifa que aplica genera ingreso; el resto 0.00.
// Suma money-safe con Prisma.Decimal (R7). Independiente del pago al mensajero (R7b) y
// del dinero recibido (R20).
export function derivarIngresoBodega(
  gestiones: readonly Pick<CierreGestionPendienteRow, "gestionId" | "resultado">[],
  tarifa: TarifasDePago,
): { ingresoByGestionId: Record<string, string>; total: string } {
  const ingresoByGestionId: Record<string, string> = {};
  let total = new Prisma.Decimal(0);
  for (const g of gestiones) {
    const ingreso = ingresoBodegaPorResultado(g.resultado, tarifaDeLaGestion(tarifa, g.gestionId));
    ingresoByGestionId[g.gestionId] = ingreso;
    total = total.plus(ingreso);
  }
  return { ingresoByGestionId, total: total.toFixed(2) };
}

/**
 * 💰 FICHA 398 (design §2.2) — SUMA LOS SNAPSHOTS YA CONGELADOS, uno por gestion.
 *
 * ⚠️ ESTO NO ES `derivarPagos` NI `derivarIngresoBodega`, Y LA DIFERENCIA ES DINERO AJENO. Aquellas
 * dos RE-DERIVAN el importe de TODAS las gestiones con la tarifa que se les pase; esta SUMA lo que
 * ya esta escrito en cada fila.
 *
 * Por que hace falta: al corregir el resultado de UNA gestion dentro de un cierre ya solicitado hay
 * que rehacer `total_pago_mensajero` y `total_ingreso_bodega_rechazos`, y el cierre NO congela la
 * fila de `tarifa_zona_mensajero` que uso. Re-derivar aqui reescribiria, con la tarifa de HOY, el
 * pago congelado de las OTRAS gestiones del cierre —gestiones que nadie corrigio—, asi que una
 * edicion de tarifa posterior a la solicitud moveria dinero ajeno en silencio. Sumando los
 * snapshots se toca exactamente una fila y las demas se quedan como estaban.
 *
 * `null` cuenta como cero: es el valor de una gestion que aun no entro en ningun cierre (39/R12,
 * 56/R11), y dentro de un cierre no deberia haber ninguna. Se trata como cero en vez de lanzar
 * porque el total tiene que poder recalcularse aunque el historico traiga un hueco.
 *
 * Money-safe: `Prisma.Decimal` de punta a punta, salida STRING escala 2. Nunca `number`.
 */
export function sumarSnapshotsCongelados(
  valores: readonly (Prisma.Decimal | null)[],
): string {
  let total = new Prisma.Decimal(0);
  for (const valor of valores) {
    if (valor === null) continue;
    total = total.plus(valor);
  }
  return total.toFixed(2);
}

// R7/R8/R9: suma con Prisma.Decimal (exacto). Solo `entregada` aporta;
// reprogramada/devuelta/rechazada cuentan $0 (R8). Serializa a STRING (R9).
//
// Feature 212 (R24-R28/R30): la fuente del reparto por metodo son las LINEAS del desglose
// (`g.pagos`), no el par escalar `montoRecibido`/`metodoPago`. Cada linea cae en el balde de
// SU metodo, asi que una entrega cobrada 5.000 en efectivo + 3.000 por transferencia aporta
// 5.000 a `efectivo` y 3.000 a `transferencia`, y no 8.000 a un solo balde.
//
// Esto NO es cosmetica: `cierre_dia.total_efectivo` es la `E` del `min(P, E)` del pago al
// mensajero (feature 44). Sumar de mas aqui no produce un numero feo en pantalla — le paga de
// mas o de menos a una persona. Por eso el reparto se prueba con mutaciones
// (`tests/unit/utils/cierre-totales-pagos.test.ts`) y no con un test de humo.
//
// Una gestion `entregada` SIN lineas no aporta a ningun balde (R26), que es el equivalente
// exacto del `default: break` defensivo que tenia el switch escalar para una entrega sin
// metodo. Y no hay fallback al par escalar (design §3.1): si una proyeccion se olvidara del
// desglose, el total sale CERO —ruidoso— en vez de plausible.
/**
 * Lo UNICO que el reparto por metodo lee de una gestion. Pedido humano (2026-08-19): el
 * parametro se acota a esto —en vez de exigir la fila entera— porque la correccion del desglose
 * desde el detalle de un cierre abierto recalcula los totales con ESTA MISMA funcion, y lo hace
 * sobre una proyeccion minima (`resultado` + `pagos`). Ensanchar el parametro obligaria a leer
 * quince columnas que el reparto no mira, o —peor— a escribir un segundo reparto.
 */
export type GestionConPagos = Pick<CierreGestionPendienteRow, "resultado" | "pagos">;

export function computeTotales(gestiones: readonly GestionConPagos[]): CierreTotales {
  let efectivo = new Prisma.Decimal(0);
  let simpe = new Prisma.Decimal(0);
  let transferencia = new Prisma.Decimal(0);
  for (const g of gestiones) {
    if (g.resultado !== "entregado") continue; // R8/R25
    for (const p of g.pagos) {
      const monto = new Prisma.Decimal(p.monto);
      switch (p.metodo) {
        case "efectivo":
          efectivo = efectivo.plus(monto);
          break;
        case "SINPE":
          simpe = simpe.plus(monto);
          break;
        case "transferencia":
          transferencia = transferencia.plus(monto);
          break;
      }
    }
  }
  const general = efectivo.plus(simpe).plus(transferencia);
  return {
    efectivo: efectivo.toFixed(2),
    simpe: simpe.toFixed(2),
    transferencia: transferencia.toFixed(2),
    general: general.toFixed(2),
  };
}
