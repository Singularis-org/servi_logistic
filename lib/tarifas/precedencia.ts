/**
 * SLT-52 (design §4, R16-R22) — la precedencia del modelo nuevo de tarifas, en UN solo sitio.
 *
 * Mismo patron que `lib/utils/cascada-tarifa.ts` (274): un WHERE plano que trae de una vez las
 * candidatas de N contextos (R39: el numero de consultas no crece con el lote) y una eleccion en
 * memoria por rango. Listado, cierre, API y cotizacion eligen con estas funciones y por eso no
 * pueden divergir (R38).
 *
 * Modulo PURO, solo imports de TIPO: se prueba sin base y sin cliente generado. Que el WHERE
 * filtra de verdad en Postgres lo prueba `tests/integration/db/tarifas-flexibles-resolver.test.ts`
 * (T3.4); aqui solo se fija su forma.
 *
 * Sin `orderBy` ni desempate por fecha: el unico `tarifa_valor_nivel_key` (NULLS NOT DISTINCT)
 * garantiza a lo sumo una fila por concepto y nivel exacto, asi que no hay empates que romper.
 */
import type { TarifaConcepto, TarifaNivel } from "@prisma/client";

import { CATALOGO_CONCEPTOS, type ActorPago } from "@/lib/tarifas/catalogo";

/** Lo minimo de una fila de `tarifa_valor` que la eleccion necesita mirar. */
export interface FilaValor {
  concepto: TarifaConcepto;
  zonaId: string | null;
  grupoId: string | null;
  tiendaId: string | null;
  mensajeroId: string | null;
  vehiculoId: string | null;
}

/**
 * Cobro a la tienda: zona y distrito de la ORDEN (R16). `grupoId` es el grupo de la zona en el
 * que esta el distrito de la orden; `null` si la orden no tiene distrito o este no esta en ningun
 * grupo de la zona (R18).
 */
export interface ContextoCobro {
  tiendaId: string;
  zonaId: string;
  grupoId: string | null;
}

/**
 * Pago: la zona DEL MENSAJERO que usa cada camino del cierre (R19) y el grupo de esa zona donde
 * cae el distrito de la orden (`null` = sin grupo, R21). `vehiculoId` `null` = sin vehiculo (R22).
 */
export interface ContextoPago {
  mensajeroId: string;
  zonaId: string;
  grupoId: string | null;
  vehiculoId: string | null;
}

export type Rango = 1 | 2 | 3 | 4 | 5;

/** Indice = rango. R16: tienda en el grupo > tienda en la zona > tienda en todas > grupo > zona. */
const NIVELES_COBRO: Record<Rango, TarifaNivel> = {
  1: "tienda_grupo",
  2: "tienda_zona",
  3: "tienda_general",
  4: "grupo",
  5: "zona",
};

/** R19 y decision P2 (gana el grupo sobre el vehiculo): mensajero > grupo+vehiculo > grupo >
 *  zona+vehiculo > zona. La satelite usa los mismos rangos sin el 1 (R20). */
const NIVELES_PAGO: Record<Rango, TarifaNivel> = {
  1: "mensajero",
  2: "grupo_vehiculo",
  3: "grupo",
  4: "zona_vehiculo",
  5: "zona",
};

/** Un grupo solo coincide si el contexto tiene grupo: `null === null` NO es «el mismo grupo». */
function mismoGrupo(fila: FilaValor, grupoId: string | null): boolean {
  return grupoId !== null && fila.grupoId === grupoId;
}

function mismoVehiculo(fila: FilaValor, vehiculoId: string | null): boolean {
  return vehiculoId !== null && fila.vehiculoId === vehiculoId;
}

/**
 * Rango de una fila para un contexto de cobro, o `null` si esa fila no aplica a ese contexto
 * (otra tienda, otra zona, otro grupo, o un concepto que no es de la tienda).
 */
export function rangoCobro(fila: FilaValor, ctx: ContextoCobro): Rango | null {
  if (CATALOGO_CONCEPTOS[fila.concepto].actor !== "tienda") return null;
  // Los CHECK de la base ya lo impiden; se repite para que una fila mal formada nunca gane.
  if (fila.mensajeroId !== null || fila.vehiculoId !== null) return null;

  if (fila.tiendaId === ctx.tiendaId) {
    if (fila.zonaId === null) return fila.grupoId === null ? 3 : null;
    if (fila.zonaId !== ctx.zonaId) return null;
    if (fila.grupoId === null) return 2;
    return mismoGrupo(fila, ctx.grupoId) ? 1 : null;
  }
  if (fila.tiendaId !== null || fila.zonaId !== ctx.zonaId) return null;
  if (fila.grupoId === null) return 5;
  return mismoGrupo(fila, ctx.grupoId) ? 4 : null;
}

/**
 * Rango de una fila para un contexto de pago de `actor`, o `null` si no aplica. La fila tiene que
 * ser de un concepto de ese actor: un valor de la satelite no paga al mensajero ni al reves.
 */
export function rangoPago(fila: FilaValor, ctx: ContextoPago, actor: ActorPago): Rango | null {
  if (CATALOGO_CONCEPTOS[fila.concepto].actor !== actor) return null;
  if (fila.tiendaId !== null) return null;

  if (fila.mensajeroId !== null) {
    // Valor propio del mensajero (SLT-55): solo del mensajero y sin ninguna otra dimension.
    const propio =
      actor === "mensajero" &&
      fila.mensajeroId === ctx.mensajeroId &&
      fila.zonaId === null &&
      fila.grupoId === null &&
      fila.vehiculoId === null;
    return propio ? 1 : null;
  }
  if (fila.zonaId !== ctx.zonaId) return null;

  if (fila.grupoId !== null) {
    if (!mismoGrupo(fila, ctx.grupoId)) return null;
    if (fila.vehiculoId === null) return 3;
    return mismoVehiculo(fila, ctx.vehiculoId) ? 2 : null;
  }
  if (fila.vehiculoId === null) return 5;
  return mismoVehiculo(fila, ctx.vehiculoId) ? 4 : null;
}

/** El ganador de un concepto para un contexto, con el nivel que se congela en el cierre. */
export interface ValorElegido<F extends FilaValor> {
  fila: F;
  nivel: TarifaNivel;
}

/** Por clave de contexto y por concepto pedido: el ganador, o `null` = «sin tarifa» (R23). */
export type Eleccion<F extends FilaValor> = Map<string, Map<TarifaConcepto, ValorElegido<F> | null>>;

/**
 * La eleccion es POR CONCEPTO (R16): una tienda puede pactar solo el flete por entregado y el
 * resto cae a la zona. Una fila con `valor` 0 es una candidata como cualquier otra: el 0 escrito
 * vale 0 y no es «sin tarifa» (R23).
 */
function elegir<F extends FilaValor, C>(
  filas: readonly F[],
  contextos: ReadonlyMap<string, C>,
  conceptos: readonly TarifaConcepto[],
  rango: (fila: F, ctx: C) => Rango | null,
  niveles: Record<Rango, TarifaNivel>,
): Eleccion<F> {
  const resultado: Eleccion<F> = new Map();
  for (const [clave, ctx] of contextos) {
    const porConcepto = new Map<TarifaConcepto, ValorElegido<F> | null>();
    for (const concepto of conceptos) {
      let mejor: { fila: F; rango: Rango } | null = null;
      for (const fila of filas) {
        if (fila.concepto !== concepto) continue;
        const r = rango(fila, ctx);
        if (r !== null && (mejor === null || r < mejor.rango)) mejor = { fila, rango: r };
      }
      porConcepto.set(concepto, mejor === null ? null : { fila: mejor.fila, nivel: niveles[mejor.rango] });
    }
    resultado.set(clave, porConcepto);
  }
  return resultado;
}

/** Cobros a la tienda de N contextos (design §4 `elegir`, rama de cobro). */
export function elegirCobros<F extends FilaValor>(
  filas: readonly F[],
  contextos: ReadonlyMap<string, ContextoCobro>,
  conceptos: readonly TarifaConcepto[],
): Eleccion<F> {
  return elegir(filas, contextos, conceptos, rangoCobro, NIVELES_COBRO);
}

/**
 * Pagos de N contextos (design §4 `elegir`, rama de pago). El actor de cada concepto sale del
 * catalogo, asi que en una sola llamada se eligen a la vez el pago al mensajero y a la satelite.
 */
export function elegirPagos<F extends FilaValor>(
  filas: readonly F[],
  contextos: ReadonlyMap<string, ContextoPago>,
  conceptos: readonly TarifaConcepto[],
): Eleccion<F> {
  const rangoDeSuActor = (fila: F, ctx: ContextoPago): Rango | null => {
    const actor = CATALOGO_CONCEPTOS[fila.concepto].actor;
    return actor === "tienda" ? null : rangoPago(fila, ctx, actor);
  };
  return elegir(filas, contextos, conceptos, rangoDeSuActor, NIVELES_PAGO);
}

export interface EntradaWhereValores {
  zonas: readonly string[];
  tiendas: readonly string[];
  mensajeros: readonly string[];
  conceptos: readonly TarifaConcepto[];
}

/** Estructuralmente compatible con `Prisma.TarifaValorWhereInput`, sin importar el cliente. */
export interface WhereValores {
  concepto: { in: TarifaConcepto[] };
  OR: [
    { zonaId: { in: string[] } },
    { tiendaId: { in: string[] }; zonaId: null },
    { mensajeroId: { in: string[] } },
  ];
}

function unicos<T>(xs: readonly T[]): T[] {
  return [...new Set(xs)];
}

/**
 * Las candidatas de un lote en UNA consulta (R39). Las tres ramas cubren todos los niveles:
 * - `zonaId IN zonas`: zona, grupo (el grupo siempre lleva su zona) y tienda en zona/grupo;
 * - `tiendaId IN tiendas AND zonaId IS NULL`: tienda en todas sus zonas;
 * - `mensajeroId IN mensajeros`: valor propio del mensajero (SLT-55).
 * Trae de mas (otras tiendas de la misma zona, otros grupos): lo descarta la eleccion. El filtro
 * por empresa no va aqui: lo pone la extension del cliente y lo respalda la RLS (R15).
 */
export function whereValores(entrada: EntradaWhereValores): WhereValores {
  return {
    concepto: { in: unicos(entrada.conceptos) },
    OR: [
      { zonaId: { in: unicos(entrada.zonas) } },
      { tiendaId: { in: unicos(entrada.tiendas) }, zonaId: null },
      { mensajeroId: { in: unicos(entrada.mensajeros) } },
    ],
  };
}
