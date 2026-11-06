import { Prisma } from "@prisma/client";

import type { TarifaVigenteResuelta } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import {
  CATALOGO_CONCEPTOS,
  CONCEPTOS_PAGO,
  CONCEPTOS_TIENDA,
  type ConceptoPago,
  type ConceptoTienda,
} from "@/lib/tarifas/catalogo";
import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";
import { derivarIngresoOrden, montoFulfillmentDeTarifa } from "@/lib/utils/ingreso-empresa";
import { pagoPorResultado } from "@/lib/utils/pago-mensajero";

/**
 * SLT-54 (design §6, R20-R23) — la referencia «Hoy rige»: lo que cobraria y pagaria HOY el modelo viejo.
 *
 * Modulo sin base: recibe las filas que eligio `leerModeloViejoCon`. Cada importe sale de las funciones
 * del calculo real (`derivarIngresoOrden`, `montoFulfillmentDeTarifa`, `pagoPorResultado`,
 * `ingresoBodegaPorResultado`). Una segunda logica repetiria cascada, variante y pacto y podria ensenar un
 * precio que el cierre no cobra.
 */

export type Referencia =
  | { tipo: "monto"; valor: string; ivaPct: string | null }
  | { tipo: "porcentaje"; valor: string; ivaPct: string | null }
  | { tipo: "varia"; desde: string; hasta: string }
  | { tipo: "no_cobra" }
  | { tipo: "no_paga" }
  | { tipo: "sin_tarifa" };

/** Lo unico de la orden que elige el flete viejo. */
export interface VarianteFlete {
  esCentral: boolean;
  esZonaEspecial: boolean;
}

/**
 * `pagoPorResultado` e `ingresoBodegaPorResultado` dan `"0.00"` tanto si ese resultado no paga nunca como
 * si la fila tiene un 0 configurado, y R22 pide distinguirlos. Con esta sonda, un `"0.00"` solo puede
 * significar «este resultado no paga», sin reescribir aqui «solo entregado paga».
 */
const TARIFA_SONDA: PagoTarifa = { cobroEntregado: "1.00", cobroRechazado: "1.00" };

const SIN_TARIFA: Referencia = { tipo: "sin_tarifa" };

/** Un solo valor si todos coinciden; si no, `varia` con el menor y el mayor (R23). */
function unificar(montos: readonly string[], ivaPct: string | null): Referencia {
  const ordenados = [...montos].sort((a, b) => new Prisma.Decimal(a).cmp(new Prisma.Decimal(b)));
  const desde = ordenados[0];
  const hasta = ordenados[ordenados.length - 1];
  if (desde === undefined || hasta === undefined) return SIN_TARIFA;
  return desde === hasta ? { tipo: "monto", valor: desde, ivaPct } : { tipo: "varia", desde, hasta };
}

function fleteDe(
  concepto: ConceptoTienda,
  tarifa: TarifaVigenteResuelta,
  variante: VarianteFlete,
): string | null {
  const resultado = CATALOGO_CONCEPTOS[concepto].resultado;
  if (resultado === null) throw new Error(`${concepto} no es un flete`);
  const derivado = derivarIngresoOrden(
    { resultado, ...variante, montoCobrar: null, cobraComision: false },
    { modelo: "viejo", tarifa },
  );
  const flete = derivado.ingreso_flete ?? derivado.ingreso_flete_devolucion;
  return flete === undefined ? null : flete.toFixed(2);
}

/**
 * La referencia de un cobro a la tienda. `variantes` no vacia: son las combinaciones que de verdad se dan
 * entre los distritos del nivel pedido.
 */
export function referenciaDeCobro(
  concepto: ConceptoTienda,
  tarifa: TarifaVigenteResuelta | null,
  variantes: readonly VarianteFlete[],
): Referencia {
  if (tarifa === null) return SIN_TARIFA;
  if (concepto === "tienda_fulfillment") {
    // Sin IVA: `tarifas` no tiene un % para el fulfillment (SLT-52 R47).
    const monto = montoFulfillmentDeTarifa({ modelo: "viejo", tarifa }, null);
    return { tipo: "monto", valor: monto.toFixed(2), ivaPct: null };
  }
  if (concepto === "tienda_comision_cod") {
    // No se calcula un importe: sin pedido no lo hay.
    return { tipo: "porcentaje", valor: tarifa.comisionCod, ivaPct: tarifa.ivaComisionCod };
  }
  const fletes = variantes.map((v) => fleteDe(concepto, tarifa, v));
  const montos = fletes.filter((f): f is string => f !== null);
  // Que un resultado se cobre no depende de la variante: o estan todos o no esta ninguno.
  if (montos.length === 0) return { tipo: "no_cobra" };
  return unificar(montos, tarifa.ivaFlete);
}

/** La referencia de un pago. `pagos`: una entrada por cada resolucion que el nivel abarca. */
export function referenciaDePago(concepto: ConceptoPago, pagos: readonly (PagoTarifa | null)[]): Referencia {
  const filas = pagos.filter((p): p is PagoTarifa => p !== null);
  if (filas.length === 0) return SIN_TARIFA;
  const { actor, resultado } = CATALOGO_CONCEPTOS[concepto];
  if (resultado === null) throw new Error(`${concepto} no depende de un resultado`);
  const pagar = actor === "mensajero" ? pagoPorResultado : ingresoBodegaPorResultado;
  if (pagar(resultado, TARIFA_SONDA) === "0.00") return { tipo: "no_paga" };
  return unificar(filas.map((f) => pagar(resultado, f)), null);
}

export type ReferenciasCobro = Record<ConceptoTienda, Referencia>;
export type ReferenciasPago = Record<ConceptoPago, Referencia>;
export type ReferenciasDeNivel = ReferenciasCobro & ReferenciasPago;

function referenciasDeCobro(
  tarifa: TarifaVigenteResuelta | null,
  variantes: readonly VarianteFlete[],
): ReferenciasCobro {
  return Object.fromEntries(
    CONCEPTOS_TIENDA.map((c) => [c, referenciaDeCobro(c, tarifa, variantes)]),
  ) as ReferenciasCobro;
}

function referenciasDePago(pagos: readonly (PagoTarifa | null)[]): ReferenciasPago {
  return Object.fromEntries(CONCEPTOS_PAGO.map((c) => [c, referenciaDePago(c, pagos)])) as ReferenciasPago;
}

/** Las variantes que dan unos distritos. Sin distritos, la de un distrito sin marca. */
function variantesDe(esCentral: boolean, marcas: readonly boolean[]): VarianteFlete[] {
  const distintas = [...new Set(marcas)];
  return (distintas.length === 0 ? [false] : distintas).map((esZonaEspecial) => ({ esCentral, esZonaEspecial }));
}

/** Una tienda en todas sus zonas: la bodega principal es una de ellas y la marca, de cada distrito. */
const VARIANTES_TODAS_SUS_ZONAS: readonly VarianteFlete[] = [
  { esCentral: false, esZonaEspecial: false },
  { esCentral: true, esZonaEspecial: false },
];

export interface EntradaReferenciaZona {
  esCentral: boolean;
  /** Los distritos de la zona, con su marca y su grupo. */
  distritos: readonly { zonaEspecial: boolean; grupoId: string | null }[];
  grupoIds: readonly string[];
  /** La fila que la cascada da a la zona sin tienda. */
  cobroZona: TarifaVigenteResuelta | null;
  pagoGeneral: PagoTarifa | null;
  /** Una entrada por vehiculo del catalogo, tambien los inactivos: a quien ya lo tiene se le sigue pagando. */
  pagosPorVehiculo: ReadonlyMap<string, PagoTarifa | null>;
  tienda: { cobroEnZona: TarifaVigenteResuelta | null; cobroEnTodasSusZonas: TarifaVigenteResuelta | null } | null;
}

export interface ReferenciaDeZona {
  zona: ReferenciasDeNivel;
  grupos: Record<string, ReferenciasDeNivel>;
  /** Pago por vehiculo: no depende del distrito, asi que es el mismo en la zona y en sus grupos. */
  vehiculos: Record<string, ReferenciasPago>;
  tienda: {
    enTodasSusZonas: ReferenciasCobro;
    enZona: ReferenciasCobro;
    enGrupos: Record<string, ReferenciasCobro>;
  } | null;
}

export function referenciaDeZona(e: EntradaReferenciaZona): ReferenciaDeZona {
  const marcasDe = (grupoId: string) => e.distritos.filter((d) => d.grupoId === grupoId).map((d) => d.zonaEspecial);
  const variantesZona = variantesDe(e.esCentral, e.distritos.map((d) => d.zonaEspecial));
  // «Todos los vehiculos» abarca lo que resuelve cada uno, ademas de la fila por defecto de la zona.
  const pagoTodos = referenciasDePago([e.pagoGeneral, ...e.pagosPorVehiculo.values()]);

  return {
    zona: { ...referenciasDeCobro(e.cobroZona, variantesZona), ...pagoTodos },
    grupos: Object.fromEntries(
      e.grupoIds.map((id) => [
        id,
        { ...referenciasDeCobro(e.cobroZona, variantesDe(e.esCentral, marcasDe(id))), ...pagoTodos },
      ]),
    ),
    vehiculos: Object.fromEntries([...e.pagosPorVehiculo].map(([id, pago]) => [id, referenciasDePago([pago])])),
    tienda:
      e.tienda === null
        ? null
        : {
            enTodasSusZonas: referenciasDeCobro(e.tienda.cobroEnTodasSusZonas, VARIANTES_TODAS_SUS_ZONAS),
            enZona: referenciasDeCobro(e.tienda.cobroEnZona, variantesZona),
            enGrupos: Object.fromEntries(
              e.grupoIds.map((id) => [
                id,
                referenciasDeCobro(e.tienda?.cobroEnZona ?? null, variantesDe(e.esCentral, marcasDe(id))),
              ]),
            ),
          },
  };
}
