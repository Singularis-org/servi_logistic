import type { PrismaClient, TarifaConcepto } from "@prisma/client";

import type {
  TarifaTxClient,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type {
  PagoTarifa,
  PagoTarifaTxClient,
} from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import {
  CONCEPTOS_TIENDA,
  conceptoPorResultado,
  esConceptoPago,
  esConceptoTienda,
} from "@/lib/tarifas/catalogo";
import {
  elegirCobros,
  elegirPagos,
  whereValores,
  type ContextoCobro,
  type ContextoPago,
  type EntradaWhereValores,
  type ValorElegido,
} from "@/lib/tarifas/precedencia";
import type {
  ContextoPagoGestion,
  TarifaPago,
  TarifaTienda,
  ValorCobro,
  ValorPago,
  ValoresTienda,
} from "@/lib/types/tarifa-flexible";
import { clavePar, elegirPorCascada, whereCascada, type ParTarifa } from "@/lib/utils/cascada-tarifa";
import { fleteSinIvaDeGestion } from "@/lib/utils/ingreso-empresa";

/**
 * SLT-52 (design §5, R16-R23, R28, R36, R37, R39) — EL resolver unico de tarifas.
 *
 * POR QUE UN SOLO SITIO: listado, cierre, API, cotizacion, rechazo y correccion cobran y pagan con
 * lo que devuelve esto (R38). `TarifaVigenteRepository` y `TarifaZonaMensajeroRepository` quedan
 * como fachadas con el mismo constructor y delegan aqui, asi que ninguna raiz de composicion
 * cambia y ninguna superficie puede quedarse calculando con otra regla.
 *
 * EL INTERRUPTOR ES POR EMPRESA Y LO DECIDE LA ACTIVACION (SLT-54 R1/R2, enmienda R36/R37 de SLT-52):
 * una empresa con su fila en `tarifa_activacion` calcula TODO con el modelo nuevo y no lee `tarifas`
 * ni `tarifa_zona_mensajero`, aunque no tenga un solo valor; sin fila, todo con el viejo, por el mismo
 * codigo de hoy, aunque tenga valores guardados: el maestro digita sin mover un centavo hasta activar.
 * Se decide una vez por llamada, no por concepto: mezclar los dos modelos en una orden podria cobrar
 * con una regla y pagar con otra (design §10.5).
 *
 * EMPRESA: ninguna consulta de aqui pone `organizacion_id` a mano. La pone la extension del cliente
 * (`lib/db/extension-empresa.ts`) y la respalda la RLS de las tablas (R15); con el cliente de una
 * transaccion vale lo mismo, porque la transaccion ya trae la empresa y el rol `servi_app`.
 *
 * CONSULTAS POR LOTE (R39), fijas e independientes del tamaño del lote:
 * - cobro, modelo viejo: interruptor (1) + `tarifas` (1);
 * - cobro, modelo nuevo: interruptor (1) + grupos de los pares (zona, distrito) (≤1) + valores (1);
 * - pago, modelo nuevo: interruptor (1) + grupos (≤1) + valores (1); el cobro de la tienda que da la
 *   base del % (R28) sale de esas mismas dos consultas, porque el WHERE junta las zonas de la orden
 *   y las del mensajero;
 * - pago, modelo viejo: interruptor (1) + `resolvePagoTarifaCon` por cada par (zona, vehiculo)
 *   DISTINTO, que es el cuerpo de hoy (39/398) sin tocar. En un cierre ese par es uno solo (la zona
 *   y el vehiculo del mensajero), asi que no crece con las gestiones.
 */

/** Delegados que lee el cobro: el modelo viejo (`tarifa`) y el nuevo. */
export type ClienteCobros = TarifaTxClient;

/** Delegados que lee el pago: el modelo viejo (`tarifaZonaMensajero`) y el nuevo. */
export type ClientePagos = PagoTarifaTxClient;

// ---------------------------------------------------------------------------------------------
// Interruptor de modelo
// ---------------------------------------------------------------------------------------------

/**
 * SLT-54 R1/R2: ¿la empresa del contexto esta activada? Tener valores NO cuenta: fijar o quitar uno no
 * puede cambiar el modelo (R3). Un `findFirst` sin `where`: el filtro por empresa lo inyecta la
 * extension (y la RLS lo respalda, R12), y el unico por empresa deja la consulta en un indice.
 */
export async function usaModeloNuevo(db: Pick<PrismaClient, "tarifaActivacion">): Promise<boolean> {
  const fila = await db.tarifaActivacion.findFirst({ select: { id: true } });
  return fila !== null;
}

// ---------------------------------------------------------------------------------------------
// Modelo nuevo: las dos consultas
// ---------------------------------------------------------------------------------------------

/** Un distrito pedido en una zona concreta. */
export interface DistritoEnZona {
  zonaId: string;
  distritoId: string | null;
}

function claveZonaDistrito(zonaId: string, distritoId: string): string {
  return `${zonaId}|${distritoId}`;
}

function unicos<T>(xs: Iterable<T>): T[] {
  return [...new Set(xs)];
}

/**
 * El grupo de cada distrito DENTRO DE LA ZONA pedida, en una consulta (R39). La zona importa: en el
 * pago se busca el distrito de la orden en los grupos de la zona DEL MENSAJERO, y si no esta alli
 * se usan los valores de esa zona aunque el distrito tenga grupo en la zona de la orden (R21). Por
 * eso el WHERE filtra por zona y la busqueda en memoria vuelve a exigir la zona de la fila.
 *
 * Los pares sin distrito no consultan nada: una orden sin distrito salta los grupos (R18).
 * Devuelve `Map<"zona|distrito", grupoId>`; un par ausente = sin grupo.
 */
export async function gruposDeDistritos(
  db: Pick<PrismaClient, "grupoDistritosDistrito">,
  pedidos: readonly DistritoEnZona[],
): Promise<Map<string, string>> {
  const conDistrito = pedidos.filter(
    (p): p is { zonaId: string; distritoId: string } => p.distritoId !== null,
  );
  if (conDistrito.length === 0) return new Map();

  // Producto `zonas × distritos`: puede traer un distrito de una zona que nadie pidio con ese
  // distrito; se descarta abajo al exigir que la fila case con un par PEDIDO.
  const filas = await db.grupoDistritosDistrito.findMany({
    where: {
      zonaId: { in: unicos(conDistrito.map((p) => p.zonaId)) },
      distritoId: { in: unicos(conDistrito.map((p) => p.distritoId)) },
    },
    select: { zonaId: true, distritoId: true, grupoId: true },
  });

  const pedidosSet = new Set(conDistrito.map((p) => claveZonaDistrito(p.zonaId, p.distritoId)));
  const grupos = new Map<string, string>();
  for (const f of filas) {
    const clave = claveZonaDistrito(f.zonaId, f.distritoId);
    if (pedidosSet.has(clave)) grupos.set(clave, f.grupoId);
  }
  return grupos;
}

function grupoDe(
  grupos: ReadonlyMap<string, string>,
  zonaId: string,
  distritoId: string | null,
): string | null {
  if (distritoId === null) return null;
  return grupos.get(claveZonaDistrito(zonaId, distritoId)) ?? null;
}

/** Proyeccion de `tarifa_valor`: lo que elige `precedencia.ts` y lo que se congela. */
const SELECT_VALOR = {
  id: true,
  concepto: true,
  modo: true,
  valor: true,
  ivaPct: true,
  zonaId: true,
  grupoId: true,
  tiendaId: true,
  mensajeroId: true,
  vehiculoId: true,
} as const;

type FilaValorDb = Awaited<
  ReturnType<typeof valoresCandidatos>
>[number];

/**
 * Las candidatas del lote en UNA consulta, con el WHERE puro de `precedencia.ts` (R39). Trae de mas
 * (otras tiendas de la misma zona, otros grupos); la eleccion lo descarta. Exportada para que el
 * test de Postgres pruebe el WHERE donde vive.
 */
export async function valoresCandidatos(
  db: Pick<PrismaClient, "tarifaValor">,
  entrada: EntradaWhereValores,
) {
  return db.tarifaValor.findMany({ where: whereValores(entrada), select: SELECT_VALOR });
}

// Money-safe: Decimal -> texto escala 2, nunca `number`.
function aValorCobro(e: ValorElegido<FilaValorDb>): ValorCobro {
  const { fila } = e;
  if (!esConceptoTienda(fila.concepto)) {
    throw new Error(`resolver de tarifas: ${fila.concepto} no es un cobro a la tienda (${fila.id})`);
  }
  // El CHECK `tarifa_valor_iva_solo_tienda` lo impide; si llegara, se para en vez de cobrar sin IVA.
  if (fila.ivaPct === null) {
    throw new Error(`resolver de tarifas: el cobro ${fila.id} (${fila.concepto}) no tiene IVA`);
  }
  return {
    concepto: fila.concepto,
    modo: fila.modo,
    valor: fila.valor.toFixed(2),
    ivaPct: fila.ivaPct.toFixed(2),
    nivel: e.nivel,
    tarifaValorId: fila.id,
  };
}

// Sin IVA por construccion (P4, R34): `ivaPct` ni se lee.
function aValorPago(e: ValorElegido<FilaValorDb>): ValorPago {
  const { fila } = e;
  if (!esConceptoPago(fila.concepto)) {
    throw new Error(`resolver de tarifas: ${fila.concepto} no es un pago (${fila.id})`);
  }
  return {
    concepto: fila.concepto,
    modo: fila.modo,
    valor: fila.valor.toFixed(2),
    nivel: e.nivel,
    tarifaValorId: fila.id,
  };
}

/** Los valores de cobro elegidos para un contexto. Concepto sin ganador = ausente (R23). */
function valoresTiendaDe(
  porConcepto: ReadonlyMap<TarifaConcepto, ValorElegido<FilaValorDb> | null> | undefined,
): ValoresTienda {
  const valores: ValoresTienda = {};
  if (porConcepto === undefined) return valores;
  for (const [concepto, elegido] of porConcepto) {
    if (elegido === null || !esConceptoTienda(concepto)) continue;
    valores[concepto] = aValorCobro(elegido);
  }
  return valores;
}

/**
 * Un par sin zona (superficies que no la conocen, R6 de la 274) solo puede alcanzar «tienda en
 * todas sus zonas». `""` no es el id de ninguna zona, asi que con la MISMA `rangoCobro` el resto de
 * niveles da `null`: no hace falta una segunda regla para ese caso.
 */
function contextoCobroDe(par: ParTarifa, grupos: ReadonlyMap<string, string>): ContextoCobro {
  const zonaId = par.zonaId ?? "";
  return {
    tiendaId: par.tiendaId,
    zonaId,
    grupoId: par.zonaId === null ? null : grupoDe(grupos, par.zonaId, par.distritoId),
  };
}

// ---------------------------------------------------------------------------------------------
// Modelo viejo: el codigo de hoy, envuelto
// ---------------------------------------------------------------------------------------------

// Proyeccion unica de los campos de la formula vieja. Las dos `tarifaEspecial*` entraron el
// 2026-08-25, cuando el pacto por distrito especial paso a COBRAR: son entradas de `resolverFlete`.
const TARIFA_SELECT = {
  id: true,
  tiendaId: true,
  zonaId: true,
  fulfillment: true,
  valorFlete: true,
  valorFleteGam: true,
  valorFleteDevuelto: true,
  valorFleteDevueltoGam: true,
  comisionCod: true,
  ivaFlete: true,
  ivaComisionCod: true,
  tarifaEspecial: true,
  tarifaEspecialDevuelta: true,
} as const;

type ConToFixed = { toFixed(n: number): string };

interface TarifaFila {
  id: string;
  tiendaId: string | null;
  zonaId: string | null;
  fulfillment: ConToFixed | null;
  valorFlete: ConToFixed;
  valorFleteGam: ConToFixed;
  valorFleteDevuelto: ConToFixed;
  valorFleteDevueltoGam: ConToFixed;
  comisionCod: ConToFixed;
  ivaFlete: ConToFixed;
  ivaComisionCod: ConToFixed;
  tarifaEspecial: ConToFixed | null;
  tarifaEspecialDevuelta: ConToFixed | null;
}

/**
 * Fila vieja -> `TarifaVigenteResuelta`, money-safe (texto escala 2). Es la proyeccion de antes de
 * SLT-52, movida aqui sin cambios: el respaldo tiene que dar centavo a centavo lo mismo (R36).
 */
function toTarifaVigenteResuelta(f: TarifaFila): TarifaVigenteResuelta {
  return {
    tarifaId: f.id,
    // NULL se normaliza a "0.00" en la frontera: aguas abajo el predicado es el MONTO, y «sin
    // monto» y «cero» son el mismo hecho para esta columna.
    fulfillment: f.fulfillment == null ? "0.00" : f.fulfillment.toFixed(2),
    valorFlete: f.valorFlete.toFixed(2),
    valorFleteGam: f.valorFleteGam.toFixed(2),
    valorFleteDevuelto: f.valorFleteDevuelto.toFixed(2),
    valorFleteDevueltoGam: f.valorFleteDevueltoGam.toFixed(2),
    comisionCod: f.comisionCod.toFixed(2),
    ivaFlete: f.ivaFlete.toFixed(2),
    ivaComisionCod: f.ivaComisionCod.toFixed(2),
    // `== null` y no `?.`: sin pacto es `null` y hace caer el flete a la columna normal; un `0`
    // seria un pacto de cero, que es otro dato.
    tarifaEspecial: f.tarifaEspecial == null ? null : f.tarifaEspecial.toFixed(2),
    tarifaEspecialDevuelta:
      f.tarifaEspecialDevuelta == null ? null : f.tarifaEspecialDevuelta.toFixed(2),
  };
}

async function cobrosViejos(
  db: Pick<PrismaClient, "tarifa">,
  pares: readonly ParTarifa[],
): Promise<Map<string, TarifaTienda | null>> {
  const filas: TarifaFila[] = await db.tarifa.findMany({
    where: whereCascada(pares),
    select: TARIFA_SELECT,
  });
  return envolverViejas(elegirPorCascada(filas, pares));
}

function envolverViejas(
  elegidas: ReadonlyMap<string, TarifaFila | null>,
): Map<string, TarifaTienda | null> {
  const out = new Map<string, TarifaTienda | null>();
  for (const [clave, fila] of elegidas) {
    out.set(clave, fila === null ? null : { modelo: "viejo", tarifa: toTarifaVigenteResuelta(fila) });
  }
  return out;
}

/**
 * SLT-54 (design §6) — un par sin tienda solo alcanza el nivel 3 de la cascada: `""` no es el id de
 * nadie, el mismo recurso que `contextoCobroDe` usa para el par sin zona. Asi la tarifa general de una
 * zona sale de la misma `nivelDeCascada`, sin una segunda regla.
 */
export const SIN_TIENDA = "";

/**
 * Sin distrito a proposito: la cascada vieja no lo mira (`nivelDeCascada`), y la referencia aplica la
 * marca de cada distrito despues, sobre la fila elegida. Sigue sin ser un `ParTarifa`, cuyo distrito
 * decide el grupo del modelo nuevo y no se puede omitir.
 */
export interface ParModeloViejo {
  /** `SIN_TIENDA` para la tarifa general de la zona. */
  tiendaId: string;
  zonaId: string | null;
}

export interface PedidoModeloViejo {
  pares: readonly ParModeloViejo[];
  pagos: readonly { zonaId: string; vehiculoId: string | null }[];
}

export interface LecturaModeloViejo {
  /** Indexado por `claveCobroViejo`. `null` = ningun nivel de la cascada tiene fila. */
  cobros: Map<string, TarifaVigenteResuelta | null>;
  /** Indexado por `clavePagoViejo`. `null` = la zona no tiene tarifa para ese vehiculo ni por defecto. */
  pagos: Map<string, PagoTarifa | null>;
}

function aParSinDistrito(par: ParModeloViejo) {
  return { ...par, distritoId: null };
}

export function claveCobroViejo(par: ParModeloViejo): string {
  return clavePar(aParSinDistrito(par));
}

export function clavePagoViejo(zonaId: string, vehiculoId: string | null): string {
  return `${zonaId}|${vehiculoId ?? ""}`;
}

/**
 * SLT-54 (design §6, R21) — lo que el modelo viejo daria HOY, para la referencia «Hoy rige». Salta el
 * interruptor a proposito: la pantalla lo pide mientras la empresa digita valores que aun no rigen, y
 * por eso solo se llama sin activar (R24). La fila sale de `cobrosViejos` y `resolvePagoTarifaCon`, las
 * mismas del calculo: una segunda lectura podria ensenar un precio que el cierre no cobra.
 */
export async function leerModeloViejoCon(
  db: Pick<PrismaClient, "tarifa" | "tarifaZonaMensajero">,
  pedido: PedidoModeloViejo,
): Promise<LecturaModeloViejo> {
  const cobros = new Map<string, TarifaVigenteResuelta | null>();
  if (pedido.pares.length > 0) {
    for (const [clave, cobro] of await cobrosViejos(db, pedido.pares.map(aParSinDistrito))) {
      cobros.set(clave, cobro !== null && cobro.modelo === "viejo" ? cobro.tarifa : null);
    }
  }
  // En serie: es el cuerpo de hoy y puede correr sobre el cliente de una transaccion.
  const pagos = new Map<string, PagoTarifa | null>();
  for (const { zonaId, vehiculoId } of pedido.pagos) {
    const clave = clavePagoViejo(zonaId, vehiculoId);
    if (pagos.has(clave)) continue;
    pagos.set(clave, await resolvePagoTarifaCon(db.tarifaZonaMensajero, zonaId, vehiculoId));
  }
  return { cobros, pagos };
}

// ---------------------------------------------------------------------------------------------
// Cobro a la tienda
// ---------------------------------------------------------------------------------------------

/**
 * Cobro a la tienda de N pares (orden: tienda, zona, distrito), indexado por `clavePar`, con una
 * entrada por cada par pedido.
 *
 * - Viejo: la cascada de la 274, intacta; `null` = ningun nivel tiene fila.
 * - Nuevo: nunca `null`; cada concepto ausente de `valores` es «sin tarifa» y un 0 escrito es
 *   `"0.00"` (R23).
 */
export async function resolverCobrosCon(
  db: ClienteCobros,
  pares: readonly ParTarifa[],
): Promise<Map<string, TarifaTienda | null>> {
  // Nadie pidio nada: ni siquiera el interruptor (y un `{ OR: [] }` traeria la tabla entera).
  if (pares.length === 0) return new Map();
  if (!(await usaModeloNuevo(db))) return cobrosViejos(db, pares);
  return cobrosNuevos(db, pares);
}

/**
 * SLT-52 T4.3 (R38) — el cobro de `resolverCobrosCon` y, SOLO en el modelo viejo, la fila de
 * `tarifas` que lo produjo, con las columnas extra que pida el llamador. Existe para el listado de
 * `/ordenes`, que ademas de cobrar MUESTRA la fila (`TarifaDTO`: `isDefault`, fechas…): asi el
 * importe sale del resolver unico y la fila mostrada es la MISMA que eligio, en la misma consulta,
 * sin una segunda lectura de `tarifas` que pudiera elegir otra.
 *
 * En el nuevo `filasViejas` va vacio: la empresa ya no tiene fila vieja que ensenar y no se lee
 * `tarifas` (R37).
 */
export async function resolverCobrosYFilasViejasCon<F extends TarifaFila>(
  db: ClienteCobros,
  pares: readonly ParTarifa[],
  selectExtra: Readonly<Record<string, true>>,
): Promise<{ cobros: Map<string, TarifaTienda | null>; filasViejas: Map<string, F | null> }> {
  if (pares.length === 0) return { cobros: new Map(), filasViejas: new Map() };
  if (await usaModeloNuevo(db)) return { cobros: await cobrosNuevos(db, pares), filasViejas: new Map() };
  // La proyeccion del cobro (`TARIFA_SELECT`) va SIEMPRE: las columnas extra solo suman.
  const filas = (await db.tarifa.findMany({
    where: whereCascada(pares),
    select: { ...selectExtra, ...TARIFA_SELECT },
  })) as unknown as F[];
  const elegidas = elegirPorCascada(filas, pares);
  return { cobros: envolverViejas(elegidas), filasViejas: elegidas };
}

async function cobrosNuevos(
  db: ClienteCobros,
  pares: readonly ParTarifa[],
): Promise<Map<string, TarifaTienda | null>> {
  const grupos = await gruposDeDistritos(
    db,
    pares.flatMap((p) => (p.zonaId === null ? [] : [{ zonaId: p.zonaId, distritoId: p.distritoId }])),
  );
  const filas = await valoresCandidatos(db, {
    zonas: unicos(pares.flatMap((p) => (p.zonaId === null ? [] : [p.zonaId]))),
    tiendas: unicos(pares.map((p) => p.tiendaId)),
    mensajeros: [],
    conceptos: CONCEPTOS_TIENDA,
  });

  const contextos = new Map<string, ContextoCobro>();
  for (const par of pares) contextos.set(clavePar(par), contextoCobroDe(par, grupos));
  const eleccion = elegirCobros(filas, contextos, CONCEPTOS_TIENDA);

  const out = new Map<string, TarifaTienda | null>();
  for (const clave of contextos.keys()) {
    out.set(clave, { modelo: "nuevo", valores: valoresTiendaDe(eleccion.get(clave)) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pago al mensajero y a la satelite
// ---------------------------------------------------------------------------------------------

// Money-safe: Decimal -> string escala 2 (nunca number/parseFloat).
function toPagoTarifa(row: { cobroEntregado: ConToFixed; cobroRechazado: ConToFixed }): PagoTarifa {
  return {
    cobroEntregado: row.cobroEntregado.toFixed(2),
    cobroRechazado: row.cobroRechazado.toFixed(2),
  };
}

/** FICHA 398 — solo el delegado de `tarifa_zona_mensajero`, para reusar la resolucion sin la clase. */
type TarifaZonaMensajeroDelegate = Pick<
  PrismaClient["tarifaZonaMensajero"],
  "findUnique" | "findFirst"
>;

/**
 * FICHA 398 — la resolucion del pago del modelo VIEJO, sobre el delegado. Es el cuerpo de
 * `TarifaZonaMensajeroRepository.resolvePagoTarifa` (que delega aqui), asi que la tarifa del
 * snapshot al solicitar el cierre (39) y la de la correccion de un resultado (398) son literalmente
 * la misma. SLT-52 la movio a este archivo sin cambiar una linea de su regla: es el respaldo del
 * modelo viejo (R36) y `pagosViejos` la llama tal cual.
 *
 * R1: con vehiculo, la tarifa exacta (zona, vehiculo); R2/R3: si no, la por defecto de la zona
 * (`vehiculo_id IS NULL`, unica por el indice NULLS NOT DISTINCT); R8: `null` si la zona no tiene.
 */
export async function resolvePagoTarifaCon(
  delegado: TarifaZonaMensajeroDelegate,
  zonaId: string,
  vehiculoId: string | null,
): Promise<PagoTarifa | null> {
  if (vehiculoId !== null) {
    const exacta = await delegado.findUnique({
      where: { zonaId_vehiculoId: { zonaId, vehiculoId } },
      select: { cobroEntregado: true, cobroRechazado: true },
    });
    if (exacta !== null) return toPagoTarifa(exacta);
  }
  const porDefecto = await delegado.findFirst({
    where: { zonaId, vehiculoId: null },
    select: { cobroEntregado: true, cobroRechazado: true },
  });
  return porDefecto !== null ? toPagoTarifa(porDefecto) : null;
}

async function pagosViejos(
  db: Pick<PrismaClient, "tarifaZonaMensajero">,
  ctxs: readonly ContextoPagoGestion[],
): Promise<Map<string, TarifaPago | null>> {
  // Una resolucion por par (zona, vehiculo) DISTINTO y en serie: es el cuerpo de hoy
  // (`resolvePagoTarifaCon`, 39/398), no una segunda version, y en serie porque puede correr sobre
  // el cliente de una transaccion, donde dos consultas a la vez no estan definidas.
  const porPar = new Map<string, TarifaPago | null>();
  for (const c of ctxs) {
    const clave = `${c.zonaId}|${c.vehiculoId ?? ""}`;
    if (porPar.has(clave)) continue;
    const tarifa = await resolvePagoTarifaCon(db.tarifaZonaMensajero, c.zonaId, c.vehiculoId);
    porPar.set(clave, tarifa === null ? null : { modelo: "viejo", tarifa });
  }
  const out = new Map<string, TarifaPago | null>();
  for (const c of ctxs) out.set(c.gestionId, porPar.get(`${c.zonaId}|${c.vehiculoId ?? ""}`) ?? null);
  return out;
}

/** Los conceptos que hacen falta para un lote: el pago de cada actor y el flete a la tienda. */
function conceptosDePago(ctxs: readonly ContextoPagoGestion[]): TarifaConcepto[] {
  const resultados = unicos(ctxs.map((c) => c.resultado));
  return resultados.flatMap((r) => [
    conceptoPorResultado("mensajero", r),
    conceptoPorResultado("satelite", r),
    conceptoPorResultado("tienda", r),
  ]);
}

/**
 * Pago de N gestiones, indexado por `gestionId`.
 *
 * - Viejo: lo de hoy (zona + vehiculo, con caida a la tarifa por defecto de la zona); `null` = la
 *   zona no tiene tarifa.
 * - Nuevo: nunca `null`. `mensajero` / `satelite` = el valor de su concepto «pago por X» o `null`
 *   (sin tarifa → el cierre paga 0, R24). `baseFlete` = flete sin IVA que se le cobra a la tienda
 *   por ESA gestion (R28, P1), con los valores de este mismo instante; sin flete para ese
 *   resultado, `"0.00"`. Ningun campo de IVA (P4).
 */
export async function resolverPagosCon(
  db: ClientePagos,
  ctxs: readonly ContextoPagoGestion[],
): Promise<Map<string, TarifaPago | null>> {
  if (ctxs.length === 0) return new Map();
  if (!(await usaModeloNuevo(db))) return pagosViejos(db, ctxs);

  // Los grupos del distrito en la zona del MENSAJERO (pago, R19/R21) y en la de la ORDEN (cobro
  // que da la base, R16), en la misma consulta.
  const grupos = await gruposDeDistritos(
    db,
    ctxs.flatMap((c) => [
      { zonaId: c.zonaId, distritoId: c.distritoId },
      { zonaId: c.zonaOrdenId, distritoId: c.distritoId },
    ]),
  );
  const filas = await valoresCandidatos(db, {
    zonas: unicos(ctxs.flatMap((c) => [c.zonaId, c.zonaOrdenId])),
    tiendas: unicos(ctxs.map((c) => c.tiendaId)),
    mensajeros: unicos(ctxs.map((c) => c.mensajeroId)),
    conceptos: conceptosDePago(ctxs),
  });

  const contextosPago = new Map<string, ContextoPago>();
  const contextosCobro = new Map<string, ContextoCobro>();
  for (const c of ctxs) {
    contextosPago.set(c.gestionId, {
      mensajeroId: c.mensajeroId,
      zonaId: c.zonaId,
      grupoId: grupoDe(grupos, c.zonaId, c.distritoId),
      vehiculoId: c.vehiculoId,
    });
    contextosCobro.set(c.gestionId, {
      tiendaId: c.tiendaId,
      zonaId: c.zonaOrdenId,
      grupoId: grupoDe(grupos, c.zonaOrdenId, c.distritoId),
    });
  }
  const pagos = elegirPagos(filas, contextosPago, conceptosDePago(ctxs));
  const cobros = elegirCobros(filas, contextosCobro, conceptosDePago(ctxs));

  const out = new Map<string, TarifaPago | null>();
  for (const c of ctxs) {
    const porConcepto = pagos.get(c.gestionId);
    const mensajero = porConcepto?.get(conceptoPorResultado("mensajero", c.resultado)) ?? null;
    const satelite = porConcepto?.get(conceptoPorResultado("satelite", c.resultado)) ?? null;
    const valoresTienda = valoresTiendaDe(cobros.get(c.gestionId));
    out.set(c.gestionId, {
      modelo: "nuevo",
      mensajero: mensajero === null ? null : aValorPago(mensajero),
      satelite: satelite === null ? null : aValorPago(satelite),
      baseFlete: fleteSinIvaDeGestion(c.resultado, valoresTienda, c.montoCobrar).toFixed(2),
    });
  }
  return out;
}
