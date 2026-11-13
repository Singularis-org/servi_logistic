import type { ModuloApagable } from "@prisma/client";

import { montoParaCampo } from "@/lib/config/moneda";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  type DescuentoPeriodo,
  type PeriodicidadOrdenes,
  type PlanDTO,
  type PrecioPlan,
  type RolConTope,
  type TipoCobro,
} from "@/lib/types/planes";

import { TEXTOS_PLAN_FORM } from "./textos";

// SLT-130 (design §2, §4): el estado del formulario de planes, sin React. Lo comparten `PlanForm` y sus
// pasos; se mudó tal cual desde `PlanForm.tsx`.

export type ModoDelPlanForm = "crear" | "editar";

export type Accion = "inmediato" | "programado";
/** SLT-86 (R23): la forma del descuento de un período. */
export type FormaDescuento = "ninguno" | "porcentaje" | "monto";
/**
 * SLT-86 (R23): el descuento de un período en el formulario. Los dos campos se conservan al cambiar de
 * forma (no se borra lo escrito); al enviar solo viaja el de la forma elegida.
 */
export type DescuentoDelFormulario = { forma: FormaDescuento; porcentaje: string; monto: string };
/** SLT-83 (R20): el modo del costo por orden; al abrir un plan sale de `costoPorOrdenPorcentual !== null`. */
export type ModoCostoPorOrden = "fijo" | "porcentual";

export type Formulario = {
  nombre: string;
  visibilidad: "publico" | "custom";
  organizacionId: string;
  porRol: Record<RolConTope, string>;
  apiKeys: string;
  modulos: ModuloApagable[];
  precio: PrecioPlan["tipo"];
  mensual: string;
  descuentos: Record<TipoCobro, DescuentoDelFormulario>;
  /** SLT-66 (R7, R23): vacío = sin costo por orden del plan (se aplica el global). */
  costoPorOrden: string;
  /**
   * SLT-83 (design §6.1; R20): el modo elegido. Los campos del otro modo se conservan mientras no se
   * envía (cambiar de modo no borra lo escrito); al enviar, el modo no elegido viaja como `null`.
   */
  modoCosto: ModoCostoPorOrden;
  /** SLT-83 (R20): obligatorio en modo porcentual; lo valida el esquema. */
  porcentajePorOrden: string;
  /** SLT-83 (R20): vacío = sin mínimo. */
  minimoPorOrden: string;
  /** SLT-118 (R35): quincenal al crear (P14); al editar, la del plan. Viaja siempre. */
  periodicidadOrdenes: PeriodicidadOrdenes;
  aplicar: Accion;
  /**
   * Al editar, la fecha de «A partir de» (SLT-58). Al crear un custom para una empresa que ya tiene plan,
   * su fecha de efecto «Rige desde» (SLT-86 R16, R25).
   */
  vigenteDesde: string;
  /** SLT-86 (R22, R23): al editar, «Rige desde» de un cambio de precio; mañana por defecto. */
  precioDesde: string;
  /** Ajuste planes-custom (D6): solo viaja en un custom (se asigna a su empresa al crearlo). */
  tipoCobro: TipoCobro;
  /** Ajuste planes-custom (D4, D5): solo viaja si la empresa elegida no tiene plan. */
  inicioCiclo: string;
};

/** Errores por ruta de zod (`topes.porRol.mensajero`, `precio.mensual`…), como los manda la action. */
export type Errores = Record<string, string[]>;

const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function descuentoInicial(d: DescuentoPeriodo | undefined): DescuentoDelFormulario {
  if (d === undefined) return { forma: "ninguno", porcentaje: "", monto: "" };
  return d.tipo === "porcentaje"
    ? { forma: "porcentaje", porcentaje: d.porcentaje, monto: "" }
    : { forma: "monto", porcentaje: "", monto: montoParaCampo(d.monto) };
}

export function inicial(plan: PlanDTO | null, inicioCiclo: string, precioDesde: string): Formulario {
  const precio = plan?.precio ?? { tipo: "sin_precio" };
  const descuentos = precio.tipo === "monto" ? precio.descuentos : {};
  return {
    nombre: plan?.nombre ?? "",
    visibilidad: plan?.visibilidad ?? "publico",
    organizacionId: plan?.organizacionId ?? "",
    porRol: Object.fromEntries(ROLES_CON_TOPE.map((r) => [r, texto(plan?.topes.porRol[r])])) as Record<
      RolConTope,
      string
    >,
    apiKeys: texto(plan?.topes.apiKeys),
    modulos: plan?.modulos ?? [],
    precio: precio.tipo,
    mensual: precio.tipo === "monto" ? montoParaCampo(precio.mensual) : "",
    descuentos: Object.fromEntries(TIPOS_COBRO.map((t) => [t, descuentoInicial(descuentos[t])])) as Record<
      TipoCobro,
      DescuentoDelFormulario
    >,
    costoPorOrden: plan?.costoPorOrden == null ? "" : montoParaCampo(plan.costoPorOrden),
    modoCosto: plan?.costoPorOrdenPorcentual == null ? "fijo" : "porcentual",
    porcentajePorOrden: plan?.costoPorOrdenPorcentual?.porcentaje ?? "",
    minimoPorOrden:
      plan?.costoPorOrdenPorcentual?.minimo == null ? "" : montoParaCampo(plan.costoPorOrdenPorcentual.minimo),
    // SLT-118 (R35): un DTO sin ella es un plan quincenal, el DEFAULT de la columna (P14).
    periodicidadOrdenes: plan?.periodicidadOrdenes ?? "quincenal",
    aplicar: "inmediato",
    vigenteDesde: "",
    precioDesde,
    tipoCobro: "mensual",
    inicioCiclo,
  };
}

/** Un tope del formulario: vacío = sin límite (`null`); lo demás lo valida el esquema. */
export function tope(valor: string): number | null {
  return valor.trim() === "" ? null : Number(valor.trim());
}

/** SLT-86 (R23): solo viaja el dato de la forma elegida; «Ninguno» no deja clave (sin descuento). */
export function precioDe(f: Formulario): PrecioPlan {
  if (f.precio !== "monto") return { tipo: f.precio };
  const descuentos: Partial<Record<TipoCobro, DescuentoPeriodo>> = {};
  for (const tipo of TIPOS_COBRO) {
    const d = f.descuentos[tipo];
    if (d.forma === "porcentaje") descuentos[tipo] = { tipo: "porcentaje", porcentaje: d.porcentaje.trim() };
    if (d.forma === "monto") descuentos[tipo] = { tipo: "monto", monto: d.monto.trim() };
  }
  return { tipo: "monto", mensual: f.mensual.trim(), descuentos };
}

export function versionDe(f: Formulario) {
  const porRol: Partial<Record<RolConTope, number>> = {};
  for (const rol of ROLES_CON_TOPE) {
    const maximo = tope(f.porRol[rol]);
    if (maximo !== null) porRol[rol] = maximo;
  }
  return {
    nombre: f.nombre,
    // SLT-86 (R8): sin tope de órdenes.
    topes: { porRol, apiKeys: tope(f.apiKeys) },
    // En el orden de pantalla, sea cual sea el orden en que se marcaron.
    modulos: ORDEN_MODULOS.filter((m) => f.modulos.includes(m)),
    precio: precioDe(f),
    // SLT-83 (R20): solo viajan los datos del modo elegido; el otro, `null`.
    costoPorOrden: f.modoCosto === "fijo" && f.costoPorOrden.trim() !== "" ? f.costoPorOrden.trim() : null,
    costoPorOrdenPorcentual:
      f.modoCosto === "porcentual"
        ? {
            porcentaje: f.porcentajePorOrden.trim(),
            minimo: f.minimoPorOrden.trim() === "" ? null : f.minimoPorOrden.trim(),
          }
        : null,
    // SLT-118 (R35): siempre en la petición, al crear y al editar.
    periodicidadOrdenes: f.periodicidadOrdenes,
  };
}

/** Los errores de zod en el cliente, con las mismas rutas que los `fieldErrors` de la action. */
export function erroresDeZod(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Errores {
  const errores: Errores = {};
  for (const issue of issues) {
    const clave = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
    (errores[clave] ??= []).push(issue.message);
  }
  return errores;
}

/** Qué campos condicionales están en pantalla ahora mismo. */
export type CamposVisibles = { pideInicioCiclo: boolean; pideFechaDeEfecto: boolean; cambiaPrecio: boolean };

/**
 * Las rutas de error que tienen un campo propio y visible ahora mismo, EN EL ORDEN DE PANTALLA (el foco
 * va al primero con error). El resto va al aviso general, para que ningún rechazo se quede sin pintar
 * por caer en un campo oculto.
 */
export function camposEnOrden(modo: ModoDelPlanForm, f: Formulario, v: CamposVisibles): string[] {
  const claves = ["nombre"];
  if (modo === "crear") claves.push("visibilidad");
  if (modo === "crear" && f.visibilidad === "custom") claves.push("organizacionId");
  claves.push(...ROLES_CON_TOPE.map((r) => `topes.porRol.${r}`), "topes.apiKeys", "modulos", "precio");
  if (f.precio === "monto") {
    claves.push("precio.mensual");
    // SLT-86 (R10, R23): el error de un descuento va en su grupo o en el campo de su forma.
    for (const tipo of TIPOS_COBRO) {
      const forma = f.descuentos[tipo].forma;
      claves.push(`precio.descuentos.${tipo}`);
      if (forma !== "ninguno") claves.push(`precio.descuentos.${tipo}.${forma}`);
    }
  }
  if (f.modoCosto === "fijo") claves.push("costoPorOrden");
  else claves.push("costoPorOrdenPorcentual.porcentaje", "costoPorOrdenPorcentual.minimo");
  claves.push("periodicidadOrdenes");
  if (modo === "crear" && f.visibilidad === "custom") claves.push("tipoCobro");
  if (modo === "crear" && v.pideInicioCiclo) claves.push("inicioCiclo");
  if (modo === "crear" && v.pideFechaDeEfecto) claves.push("vigenteDesde");
  if (modo === "editar" && (v.cambiaPrecio || f.aplicar === "programado")) claves.push("vigenteDesde");
  return claves;
}

/** SLT-130 (design §4): los pasos del formulario. «vigencia» («Cuándo rige») solo existe al editar. */
export type IdPaso = "general" | "precio" | "orden" | "topes" | "modulos" | "vigencia" | "revisar";

/**
 * Un paso tal como lo pinta el componente de pasos. Es la forma de `PasoDelFormulario`
 * (`components/shared/FormularioPorPasos.tsx`) con el id acotado a `IdPaso`; se declara aquí para que
 * el estado no dependa de un componente.
 */
export type PasoDelPlan = { id: IdPaso; titulo: string };

/** SLT-130 (R7): los pasos en orden; el título de «Revisar» dice qué hace el botón final del modo. */
export function pasosDe(modo: ModoDelPlanForm): PasoDelPlan[] {
  const t = TEXTOS_PLAN_FORM.pasos;
  return [
    { id: "general", titulo: t.general },
    { id: "precio", titulo: t.precio },
    { id: "orden", titulo: t.orden },
    { id: "topes", titulo: t.topes },
    { id: "modulos", titulo: t.modulos },
    ...(modo === "editar" ? [{ id: "vigencia" as const, titulo: t.vigencia }] : []),
    { id: "revisar", titulo: modo === "crear" ? t.revisarCrear : t.revisarEditar },
  ];
}

const CLAVES_DE_GENERAL = new Set(["nombre", "visibilidad", "organizacionId", "tipoCobro", "inicioCiclo"]);

const empiezaPor = (clave: string, raiz: string) => clave === raiz || clave.startsWith(`${raiz}.`);

/**
 * SLT-130 (design §4; R18, R25): el paso donde está el campo de una clave de error. `null` si no tiene
 * campo en ningún paso (`_`, `planId`…): va al aviso general de «Revisar» (R26).
 */
export function pasoDeLaClave(clave: string, modo: ModoDelPlanForm): IdPaso | null {
  if (CLAVES_DE_GENERAL.has(clave)) return "general";
  // Al crear, `vigenteDesde` es la fecha de efecto del custom (General); al editar, el cambio programado.
  if (clave === "vigenteDesde") return modo === "crear" ? "general" : "vigencia";
  if (empiezaPor(clave, "precio")) return "precio";
  if (empiezaPor(clave, "costoPorOrden") || empiezaPor(clave, "costoPorOrdenPorcentual")) return "orden";
  if (clave === "periodicidadOrdenes") return "orden";
  if (empiezaPor(clave, "topes")) return "topes";
  if (clave === "modulos") return "modulos";
  return null;
}
