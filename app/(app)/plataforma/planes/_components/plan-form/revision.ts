import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { SIN_LIMITE, textoDelDescuento, textoDelPrecio } from "@/lib/planes/mensajes";
import { diferenciasDelPlan, type CambiosDelPlan } from "@/lib/planes/rastro";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  costoPorOrdenPorcentualSchema,
  descuentoPeriodoSchema,
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  topesPlanSchema,
  type PlanDTO,
  type PrecioPlan,
  type TipoCobro,
} from "@/lib/types/planes";

import { textoDeVisibilidad, textoDelCostoPorOrdenDelPlan } from "../plan-vista";
import type { Formulario, ModoDelPlanForm } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

// SLT-130 (design §6; R16, R22, R23) — las filas del paso «Revisar» y el «Hoy: …» de los campos que
// cambian. Puro: sin React. Los valores salen de los formateadores de `lib/planes/mensajes.ts` y de
// `plan-vista.ts`, no de las líneas del correo (`lineasDeCambioDelPlan`, design §8 C), para que la clave
// diga lo mismo que el campo del formulario.

/** Una fila de «Revisar»: al editar, `valor` es «antes → después»; al crear, el valor final. */
export type FilaDeRevision = { clave: string; valor: string };

const FLECHA = " → ";
const SEPARADOR = " · ";

/** El costo base sin sus descuentos: los descuentos van en su propia fila. */
function textoDelCostoBase(p: PrecioPlan): string {
  return textoDelPrecio(p.tipo === "monto" ? { tipo: "monto", mensual: p.mensual } : p);
}

/**
 * Design §6: un valor que todavía no pasa el esquema se pinta tal cual lo escribió el usuario. Los
 * formateadores de `mensajes.ts` lo canonizan («abc» → «abc.00») y un tope no numérico sería «NaN»; por
 * eso, si el valor del formulario no es válido, el texto sale de `escrito` (lo crudo del formulario).
 */
function textoDelDescuentoEscrito(tipo: TipoCobro, p: PrecioPlan, escrito: Formulario | null): string | null {
  const d = p.tipo === "monto" ? p.descuentos[tipo] : undefined;
  if (d === undefined) return null;
  const linea = escrito?.descuentos.find((l) => l.periodo === tipo);
  if (linea === undefined || descuentoPeriodoSchema.safeParse(d).success) return textoDelDescuento(tipo, d);
  const sufijo = linea.forma === "porcentaje" ? ` ${TEXTOS_PLAN_FORM.sufijoPorcentaje}` : "";
  return `${TEXTOS_PLAN_FORM.descuento(tipo)}: ${linea.valor.trim()}${sufijo}`;
}

function textoDeLosDescuentos(p: PrecioPlan, escrito: Formulario | null): string {
  const lineas = TIPOS_COBRO.flatMap((tipo) => textoDelDescuentoEscrito(tipo, p, escrito) ?? []);
  return lineas.length === 0 ? TEXTOS_PLAN_FORM.ninguno : lineas.join(SEPARADOR);
}

function textoDelCobroPorOrden(p: PlanDTO, escrito: Formulario | null): string {
  const porcentual = p.costoPorOrdenPorcentual;
  if (escrito === null || porcentual === null || costoPorOrdenPorcentualSchema.safeParse(porcentual).success) {
    return textoDelCostoPorOrdenDelPlan(p);
  }
  const partes = [`${escrito.porcentajePorOrden.trim()} ${TEXTOS_PLAN_FORM.sufijoPorcentaje}`];
  if (porcentual.minimo !== null) partes.push(`${TEXTOS_PLAN_FORM.minimoPorOrden}: ${escrito.minimoPorOrden.trim()}`);
  return partes.join(SEPARADOR);
}

function textoDeLosModulos(p: PlanDTO): string {
  const nombres = ORDEN_MODULOS.filter((m) => p.modulos.includes(m)).map(nombreDelModulo);
  return nombres.length === 0 ? TEXTOS_PLAN_FORM.ninguno : nombres.join(SEPARADOR);
}

const textoDelTope = (n: number | null | undefined) => (n === null || n === undefined ? SIN_LIMITE : String(n));

/** Un tope: el número del plan si es válido; si no, lo que dice el campo del formulario. */
function textoDelTopeEscrito(n: number | null | undefined, crudo: string | undefined): string {
  if (crudo === undefined || topesPlanSchema.shape.apiKeys.safeParse(n ?? null).success) return textoDelTope(n);
  return crudo.trim();
}

const periodicidad = (p: PlanDTO) => TEXTOS_TIPO_COBRO.tipo[p.periodicidadOrdenes ?? "quincenal"];

/**
 * Una fila del plan: qué clave lleva, cómo se pinta su valor y si cambia entre las dos versiones. `valor`
 * recibe lo crudo del formulario en el lado «después» (`null` en el lado del plan guardado).
 */
type FilaDelPlan = {
  clave: string;
  valor: (p: PlanDTO, escrito: Formulario | null) => string;
  cambia: (c: CambiosDelPlan, antes: PlanDTO, despues: PlanDTO) => boolean;
};

const algunDescuento = (c: CambiosDelPlan) => TIPOS_COBRO.some((tipo) => c[`descuento_${tipo}`] !== undefined);

/** Las filas del plan EN EL ORDEN DE LOS PASOS: General, Precio, Cobro por orden, Topes y Módulos. */
const FILAS_DEL_PLAN: readonly FilaDelPlan[] = [
  { clave: TEXTOS_PLAN_FORM.nombre, valor: (p) => p.nombre, cambia: (c) => c.nombre !== undefined },
  { clave: TEXTOS_PLAN_FORM.mensual, valor: (p) => textoDelCostoBase(p.precio), cambia: (c) => c.precio !== undefined },
  {
    clave: TEXTOS_PLAN_FORM.descuentos,
    valor: (p, escrito) => textoDeLosDescuentos(p.precio, escrito),
    cambia: algunDescuento,
  },
  {
    clave: TEXTOS_PLAN_FORM.cobroPorOrden,
    valor: textoDelCobroPorOrden,
    cambia: (c) => c.costoPorOrden !== undefined || c.costoPorOrdenPorcentual !== undefined,
  },
  {
    clave: TEXTOS_PLAN_FORM.periodicidadOrdenes,
    valor: periodicidad,
    cambia: (c) => c.periodicidadOrdenes !== undefined,
  },
  ...ROLES_CON_TOPE.map(
    (rol): FilaDelPlan => ({
      clave: TEXTOS_PLAN_FORM.topeDeRol(rol),
      valor: (p, escrito) => textoDelTopeEscrito(p.topes.porRol[rol], escrito?.porRol[rol]),
      cambia: (_c, antes, despues) => (antes.topes.porRol[rol] ?? null) !== (despues.topes.porRol[rol] ?? null),
    }),
  ),
  {
    clave: TEXTOS_PLAN_FORM.topeDeApiKeys,
    valor: (p, escrito) => textoDelTopeEscrito(p.topes.apiKeys, escrito?.apiKeys),
    cambia: (_c, antes, despues) => antes.topes.apiKeys !== despues.topes.apiKeys,
  },
  { clave: TEXTOS_PLAN_FORM.modulos, valor: textoDeLosModulos, cambia: (c) => c.modulos !== undefined },
];

/**
 * R22, R23: las filas de «Revisar». Al crear, los `extras` de General van primero y luego TODAS las filas
 * del plan con su valor final. Al editar, solo las filas del plan que cambian, como «antes → después», y
 * después los `extras` (la fila de cuándo rige). Si al editar no cambia nada del plan, devuelve solo los
 * `extras`: la vista pinta entonces «Sin cambios.» (`haySoloExtras`).
 *
 * «Revisar» no valida (se llega saltando pasos): con `escrito` (lo crudo del formulario del que sale
 * `despues`), un importe o un tope que todavía no es válido sale tal cual lo escribió el usuario. Guardar
 * valida y lleva al paso del error (R25).
 */
export function filasDeRevision(e: {
  modo: ModoDelPlanForm;
  plan: PlanDTO | null;
  despues: PlanDTO;
  extras: readonly FilaDeRevision[];
  escrito?: Formulario;
}): FilaDeRevision[] {
  const escrito = e.escrito ?? null;
  if (e.modo === "crear" || e.plan === null) {
    return [...e.extras, ...FILAS_DEL_PLAN.map((f) => ({ clave: f.clave, valor: f.valor(e.despues, escrito) }))];
  }
  const antes = e.plan;
  const cambios = diferenciasDelPlan(antes, e.despues);
  const delPlan = FILAS_DEL_PLAN.filter((f) => f.cambia(cambios, antes, e.despues)).map((f) => ({
    clave: f.clave,
    valor: `${f.valor(antes, null)}${FLECHA}${f.valor(e.despues, escrito)}`,
  }));
  return [...delPlan, ...e.extras];
}

/** R23: al editar, las filas no traen nada del plan; solo los `extras` (cuándo rige). */
export function haySoloExtras(filas: readonly FilaDeRevision[], extras: readonly FilaDeRevision[]): boolean {
  return filas.length === extras.length;
}

/**
 * R22: los `extras` de General al crear: Visibilidad y, en un custom, Tipo de cobro y la fecha que pide
 * la empresa («Inicio del período» si no tiene plan; «Rige desde» si ya lo tiene).
 */
export function extrasDeGeneral(e: {
  visibilidad: "publico" | "custom";
  empresaNombre: string | null;
  tipoCobro: TipoCobro;
  fecha: { campo: "inicioCiclo" | "rigeDesde"; valor: string } | null;
}): FilaDeRevision[] {
  const filas: FilaDeRevision[] = [{ clave: TEXTOS_PLAN_FORM.visibilidad, valor: textoDeVisibilidad(e.visibilidad, e.empresaNombre) }];
  if (e.visibilidad !== "custom") return filas;
  filas.push({ clave: TEXTOS_TIPO_COBRO.campo, valor: TEXTOS_TIPO_COBRO.tipo[e.tipoCobro] });
  if (e.fecha !== null) {
    const clave = e.fecha.campo === "inicioCiclo" ? TEXTOS_PLAN_FORM.inicioCiclo : TEXTOS_TIPO_COBRO.rigeDesde;
    filas.push({ clave, valor: e.fecha.valor });
  }
  return filas;
}

/**
 * R23: la fila de cuándo rige al editar: «Rige desde» si cambia el precio (SLT-86 R22); si no, «A partir
 * de» con su fecha o «Aplicar: De inmediato» (SLT-58).
 */
export function filaDeCuandoRige(e: {
  cambiaPrecio: boolean;
  aplicar: "inmediato" | "programado";
  precioDesde: string;
  vigenteDesde: string;
}): FilaDeRevision {
  if (e.cambiaPrecio) return { clave: TEXTOS_TIPO_COBRO.rigeDesde, valor: e.precioDesde };
  if (e.aplicar === "programado") return { clave: TEXTOS_PLAN_FORM.programado, valor: e.vigenteDesde };
  return { clave: TEXTOS_PLAN_FORM.aplicar, valor: TEXTOS_PLAN_FORM.inmediato };
}

/**
 * R16: «Hoy: <valor del plan guardado>» bajo un campo que cambia al editar. Del precio, solo el costo
 * base, sin descuentos («Hoy: 10.00 / mes», «Hoy: sin precio»); de un tope, su número o «sin límite».
 * Si se pinta o no lo decide el paso (solo al editar y si el valor difiere).
 */
export function textoDeHoy(hoy: { precio: PrecioPlan } | { tope: number | null | undefined }): string {
  return TEXTOS_PLAN_FORM.hoy("precio" in hoy ? textoDelCostoBase(hoy.precio) : textoDelTope(hoy.tope));
}
