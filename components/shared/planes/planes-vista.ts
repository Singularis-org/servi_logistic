import type { ModuloApagable } from "@prisma/client";

import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { ORDEN_MODULOS, MODULOS_APAGABLES } from "@/lib/modulos/catalogo";
import { aCentimos, aTexto } from "@/lib/planes/centimos";
import { montoDelPeriodo } from "@/lib/planes/cobro";
import {
  NOMBRES_DEL_TOPE,
  textoDelCostoPorOrden,
  textoDelCostoPorOrdenPorcentual,
  type TopeQueSobra,
} from "@/lib/planes/mensajes";
import type { FilaConsumo, UsoDelPlan } from "@/lib/types/consumo-plan";
import {
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  type PlanVista,
  type PrecioPlan,
  type RolConTope,
  type TipoCobro,
  type TopesPlan,
} from "@/lib/types/planes";

// SLT-99 (design §5, §6; R4, R6, R8, R13) — la lógica de vista de los planes, sin React: la comparten el carrusel,
// el detalle y «Mi plan», y la reutiliza SLT-116 sin empresa. Importes en céntimos `bigint` como
// `lib/planes/cobro.ts` (nada de `Number`), sin símbolo de moneda (SLT-58 D26).

/** Las dos vistas del selector del carrusel (R6). */
export type VistaDePrecio = "mensual" | "anual";

/** Textos de los planes, en un solo sitio para cuando llegue la i18n (design §6). */
export const TEXTOS_PLANES = {
  activo: "Activo",
  usoDeLaPlataforma: "Uso de la plataforma",
  costoPorOrden: "Costo por orden",
  periodoActual: "Período actual",
  seRenuevaEl: "Se renueva el",
  usuarios: "Usuarios",
  apiKeys: "API keys",
  modulos: "Módulos",
  incluido: "Incluido",
  noIncluido: "No incluido",
  sinTope: "Sin tope",
  usoDeTope: (usados: string, maximo: string) => `${usados} de ${maximo}`,
  usoSinTope: (usados: string) => `${usados} · Sin tope`,
  // Carrusel.
  planesDisponibles: "Planes disponibles",
  vistaDelPrecio: "Ver precios",
  vistas: { mensual: "Mensual", anual: "Anual" } as const satisfies Record<VistaDePrecio, string>,
  porVista: { mensual: "por mes", anual: "por año" } as const satisfies Record<VistaDePrecio, string>,
  sufijoVista: { mensual: "/ mes", anual: "/ año" } as const satisfies Record<VistaDePrecio, string>,
  insignia: (p: string) => `${p} %`,
  insigniaAnual: "anual",
  insigniaEtiqueta: (p: string) => `${p} % de descuento pagando anual`,
  sinCuota: "Sin cuota",
  sinCuotaTarjeta: "Sin cuota · solo pagas el costo por orden",
  planALaMedida: "Plan a la medida",
  planALaMedidaTexto: "Precio, costo por orden, usuarios y módulos acordados para tu operación.",
  planALaMedidaPuntos: [
    "Costo por orden fijo o porcentual",
    "Usuarios y API keys a tu medida",
    "Los módulos que necesites",
  ],
  contactanos: "Contáctanos",
  proximamente: "Próximamente",
  rangoSingular: "Plan",
  rangoPlural: "Planes",
  // Detalle.
  detallesDe: (plan: string) => `Detalles de ${plan}`,
  tablaDePeriodos: "Uso de la plataforma según el período de cobro",
  columnaPeriodo: "Período",
  columnaDescuento: "Descuento",
  columnaPorPeriodo: "Pagas por período",
  columnaPorMes: "Equivale por mes",
  sinDato: "—",
  resaltado: (tipo: TipoCobro) => `Resaltado: tu período de cobro actual (${TEXTOS_TIPO_COBRO.tipo[tipo]}).`,
  tuPeriodo: "tu período",
  comparacion: "Comparación con tu plan",
  queIncluye: "Lo que incluye",
  concepto: "Concepto",
  tuPlan: "Tu plan",
  activoDesde: "Activo desde",
  periodoEnCurso: "Período en curso",
  proximoCobro: "Próximo cobro",
  cambiarA: (plan: string) => `Cambiar a ${plan}`,
  nombreDelModulo: (m: ModuloApagable) => MODULOS_APAGABLES[m].nombre,
  /** R13 (P4): los nombres por rol, los mismos del rechazo del servicio. */
  nombresDelTope: NOMBRES_DEL_TOPE,
} as const;

/* -------------------------------------------------------------------------- */
/* R4 — «Usuarios»                                                              */
/* -------------------------------------------------------------------------- */

/** R4: la suma de los topes de los cuatro roles con tope; `null` («Sin tope») si alguno no lo tiene. */
export function usuariosDelPlan(topes: TopesPlan): number | null {
  let suma = 0;
  for (const rol of ROLES_CON_TOPE) {
    const tope = topes.porRol[rol];
    if (tope === undefined) return null;
    suma += tope;
  }
  return suma;
}

/** R4: los usuarios activos de esos cuatro roles. */
export function usuariosEnUso(porRol: Readonly<Record<RolConTope, number>>): number {
  return ROLES_CON_TOPE.reduce((suma, rol) => suma + porRol[rol], 0);
}

/** «Sin tope» o el número. */
export function textoDelTope(tope: number | null): string {
  return tope === null ? TEXTOS_PLANES.sinTope : String(tope);
}

/**
 * El uso de «Mi plan» a partir de sus filas de consumo (`filasDeConsumo` trae los cuatro roles y API keys): así el
 * detalle compara con el mismo uso que pinta la pantalla, sin otra lectura.
 */
export function usoDeLasFilas(filas: readonly FilaConsumo[], ordenes: number): UsoDelPlan {
  const usados = (clave: FilaConsumo["clave"]) => filas.find((f) => f.clave === clave)?.usados ?? 0;
  const porRol = Object.fromEntries(ROLES_CON_TOPE.map((rol) => [rol, usados(rol)])) as Record<RolConTope, number>;
  return { ordenes, apiKeys: usados("api_keys"), porRol };
}

/* -------------------------------------------------------------------------- */
/* R6 — el precio de la tarjeta y la insignia                                   */
/* -------------------------------------------------------------------------- */

const CERO = BigInt(0);
const DOS = BigInt(2);
const CIEN = BigInt(100);
const DOCE = BigInt(12);

/** `num / den` al entero, la mitad hacia arriba (no negativos), como `redondear` de `lib/planes/cobro.ts`. */
function redondear(num: bigint, den: bigint): bigint {
  return (num + den / DOS) / den;
}

/** Un porcentaje como se lee: «10.00» → «10», «12.50» → «12.5». */
function porcentajeLegible(p: string): string {
  return p.includes(".") ? p.replace(/0+$/, "").replace(/\.$/, "") : p;
}

/** P1: un plan con costo base mensual `0.00` es «sin cuota». */
export function esSinCuota(precio: PrecioPlan): boolean {
  return precio.tipo === "monto" && aCentimos(precio.mensual) === CERO;
}

export type PrecioDeLaVista =
  | { tipo: "sin_cuota" }
  | { tipo: "por_definir" }
  /** `insignia`: el porcentaje de la insignia circular, solo en anual y con descuento anual. */
  | { tipo: "monto"; monto: string; insignia: string | null };

/**
 * R6, P1, P10: el costo base de la vista con su descuento y la insignia del anual. En monto fijo, la insignia es el %
 * equivalente `1 − anual con descuento ÷ (mensual × 12)`, redondeado al entero (mitad hacia arriba), y no sale si
 * redondea a 0 % (P10).
 */
export function precioDeLaVista(precio: PrecioPlan, vista: VistaDePrecio): PrecioDeLaVista {
  if (precio.tipo !== "monto") return { tipo: "por_definir" };
  if (esSinCuota(precio)) return { tipo: "sin_cuota" };
  const monto = montoDelPeriodo(precio, vista) ?? "0.00";
  return { tipo: "monto", monto, insignia: vista === "anual" ? insigniaAnual(precio, monto) : null };
}

function insigniaAnual(precio: Extract<PrecioPlan, { tipo: "monto" }>, anual: string): string | null {
  const descuento = precio.descuentos.anual;
  if (descuento === undefined) return null;
  if (descuento.tipo === "porcentaje") return porcentajeLegible(descuento.porcentaje);
  const bruto = aCentimos(precio.mensual) * DOCE;
  const pct = redondear((bruto - aCentimos(anual)) * CIEN, bruto);
  return pct === CERO ? null : pct.toString();
}

/* -------------------------------------------------------------------------- */
/* R8 — la tabla de períodos y la comparación                                   */
/* -------------------------------------------------------------------------- */

/** Cuántos meses vale cada período, como `num / den` (R9 de SLT-86). */
const MESES: Record<TipoCobro, { num: bigint; den: bigint }> = {
  quincenal: { num: BigInt(1), den: DOS },
  mensual: { num: BigInt(1), den: BigInt(1) },
  bimestral: { num: DOS, den: BigInt(1) },
  anual: { num: DOCE, den: BigInt(1) },
};

export interface FilaDePeriodo {
  tipo: TipoCobro;
  periodo: string;
  descuento: string;
  porPeriodo: string;
  porMes: string;
}

function textoDelDescuentoDe(precio: Extract<PrecioPlan, { tipo: "monto" }>, tipo: TipoCobro): string {
  const d = precio.descuentos[tipo];
  if (d === undefined) return TEXTOS_PLANES.sinDato;
  return d.tipo === "porcentaje" ? `${porcentajeLegible(d.porcentaje)} %` : d.monto;
}

/**
 * R8, P1: los cuatro períodos con su descuento, lo que se paga por período y lo que equivale por mes en céntimos
 * exactos (mitad hacia arriba). Sin cuota, «Sin cuota» en las cuatro filas.
 */
export function filasDePeriodos(precio: PrecioPlan): FilaDePeriodo[] {
  return TIPOS_COBRO.map((tipo) => {
    const periodo = TEXTOS_TIPO_COBRO.tipo[tipo];
    if (precio.tipo !== "monto" || esSinCuota(precio)) {
      const texto = precio.tipo === "monto" ? TEXTOS_PLANES.sinCuota : TEXTOS_PLANES.sinDato;
      return { tipo, periodo, descuento: TEXTOS_PLANES.sinDato, porPeriodo: texto, porMes: TEXTOS_PLANES.sinDato };
    }
    const porPeriodo = montoDelPeriodo(precio, tipo) ?? "0.00";
    const { num, den } = MESES[tipo];
    const porMes = aTexto(redondear(aCentimos(porPeriodo) * den, num));
    return { tipo, periodo, descuento: textoDelDescuentoDe(precio, tipo), porPeriodo, porMes };
  });
}

/** El costo base de un período como lo pinta la comparación: «Sin cuota» con `0.00` (P1). */
export function textoDelUsoDeLaPlataforma(precio: PrecioPlan, tipo: TipoCobro): string {
  if (precio.tipo !== "monto") return TEXTOS_PLANES.sinDato;
  if (esSinCuota(precio)) return TEXTOS_PLANES.sinCuota;
  return montoDelPeriodo(precio, tipo) ?? TEXTOS_PLANES.sinDato;
}

/** El costo por orden del plan: el porcentual (SLT-83) o el fijo (vacío = el global, SLT-66 R12). */
export function textoDelCostoPorOrdenDelPlan(plan: Pick<PlanVista, "costoPorOrden" | "costoPorOrdenPorcentual">): string {
  return plan.costoPorOrdenPorcentual === null
    ? textoDelCostoPorOrden(plan.costoPorOrden)
    : textoDelCostoPorOrdenPorcentual(plan.costoPorOrdenPorcentual);
}

export interface FilaDeComparacion {
  concepto: string;
  plan: string;
  /** `undefined` sin plan activo (R9): no hay columna de comparación. */
  activo?: string;
  modulo?: ModuloApagable;
}

function conceptosDe(plan: PlanVista, tipo: TipoCobro) {
  return {
    uso: textoDelUsoDeLaPlataforma(plan.precio, tipo),
    costo: textoDelCostoPorOrdenDelPlan(plan),
    usuarios: textoDelTope(usuariosDelPlan(plan.topes)),
    apiKeys: textoDelTope(plan.topes.apiKeys),
    modulo: (m: ModuloApagable) => (plan.modulos.includes(m) ? TEXTOS_PLANES.incluido : TEXTOS_PLANES.noIncluido),
  };
}

/**
 * R8: concepto por concepto, el plan frente al activo: «Uso de la plataforma» (con el período de cobro `tipo`),
 * «Costo por orden», «Usuarios», «API keys» y cada módulo. Sin `activo`, solo la columna del plan (R9).
 */
export function filasDeComparacion(plan: PlanVista, activo: PlanVista | null, tipo: TipoCobro): FilaDeComparacion[] {
  const a = conceptosDe(plan, tipo);
  const b = activo === null ? null : conceptosDe(activo, tipo);
  const fila = (concepto: string, x: string, y: string | undefined, modulo?: ModuloApagable): FilaDeComparacion =>
    b === null ? { concepto, plan: x, modulo } : { concepto, plan: x, activo: y, modulo };
  return [
    fila(TEXTOS_PLANES.usoDeLaPlataforma, a.uso, b?.uso),
    fila(TEXTOS_PLANES.costoPorOrden, a.costo, b?.costo),
    fila(TEXTOS_PLANES.usuarios, a.usuarios, b?.usuarios),
    fila(TEXTOS_PLANES.apiKeys, a.apiKeys, b?.apiKeys),
    ...ORDEN_MODULOS.map((m) => fila(TEXTOS_PLANES.nombreDelModulo(m), a.modulo(m), b?.modulo(m), m)),
  ];
}

/* -------------------------------------------------------------------------- */
/* R13 — el aviso previo de los topes que sobran                                */
/* -------------------------------------------------------------------------- */

/**
 * R13 (P4): cada rol con tope contra su propio tope y las API keys, como `excedidosDe` del repositorio. El texto lo
 * da `mensajeTopesSobran` / `lineaTopeSobra`, el mismo del rechazo del servicio.
 */
export function excedidosContra(topes: TopesPlan, uso: UsoDelPlan): TopeQueSobra[] {
  const excedidos: TopeQueSobra[] = [];
  for (const rol of ROLES_CON_TOPE) {
    const maximo = topes.porRol[rol];
    if (maximo !== undefined && uso.porRol[rol] > maximo) excedidos.push({ tope: rol, usados: uso.porRol[rol], maximo });
  }
  if (topes.apiKeys !== null && uso.apiKeys > topes.apiKeys) {
    excedidos.push({ tope: "api_keys", usados: uso.apiKeys, maximo: topes.apiKeys });
  }
  return excedidos;
}
