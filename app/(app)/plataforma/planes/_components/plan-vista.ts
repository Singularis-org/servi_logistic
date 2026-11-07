import { ROL_LABELS } from "@/lib/auth/rol-label";
import { formatearConteo } from "@/lib/planes/consumo";
import type { PlanParaCosto } from "@/lib/planes/costo-concreto";
import {
  SIN_LIMITE,
  textoDelCostoPorOrden,
  textoDelCostoPorOrdenPorcentual,
  textoDelPrecio,
} from "@/lib/planes/mensajes";
import { ROLES_CON_TOPE, type TopesPlan } from "@/lib/types/planes";

// SLT-58 (design §6.3, §6.5) — cómo se pinta un plan en el catálogo y en su detalle. Puro: sin React.
// Ningún texto nombra la marca, el país ni la moneda.

export const TEXTOS_PLAN = {
  publico: "Público",
  customDe: (empresa: string) => `Custom de ${empresa}`,
  /** Un custom cuya empresa no se pudo leer: se dice que es custom sin inventar a quién. */
  custom: "Custom",
  archivado: "Archivado",
  apiKeys: "API keys activas",
  /** El mismo nombre del tope en el catálogo, el detalle y el formulario (y en `lib/planes/mensajes.ts`). */
  rol: (etiqueta: string) => `Usuarios activos con el rol ${etiqueta}`,
  sinTopesDeRol: "Usuarios: sin límite por rol",
  // SLT-66 (design §6.2; R9, R10, R24).
  costoBase: (texto: string) => `Costo base: ${texto}`,
  costoPorOrden: (texto: string) => `Costo por orden: ${texto}`,
} as const;

/** «Público» o «Custom de <empresa>» (R13). */
export function textoDeVisibilidad(visibilidad: "publico" | "custom", empresaNombre: string | null): string {
  if (visibilidad === "publico") return TEXTOS_PLAN.publico;
  return empresaNombre === null ? TEXTOS_PLAN.custom : TEXTOS_PLAN.customDe(empresaNombre);
}

const limite = (n: number | null | undefined) => (n === null || n === undefined ? SIN_LIMITE : formatearConteo(n));

/**
 * Una línea por tope: los roles en el orden de `ROLES_CON_TOPE` y API keys; SLT-86 (R8, R24): sin
 * órdenes, que ya no tienen tope. Con `compacto`
 * (la tabla del catálogo) los roles sin tope se resumen en una línea para no alargar la fila.
 */
export function lineasDeTopes(topes: TopesPlan, compacto = false): string[] {
  const roles = ROLES_CON_TOPE.filter((rol) => !compacto || topes.porRol[rol] !== undefined).map(
    (rol) => `${TEXTOS_PLAN.rol(ROL_LABELS[rol])}: ${limite(topes.porRol[rol])}`,
  );
  return [
    ...(roles.length === 0 ? [TEXTOS_PLAN.sinTopesDeRol] : roles),
    `${TEXTOS_PLAN.apiKeys}: ${limite(topes.apiKeys)}`,
  ];
}

/**
 * SLT-83 (design §6.2; R21) — el costo por orden de un plan: el porcentual si lo tiene; si no, el fijo o
 * «se aplica el valor global», como en SLT-66 R24.
 */
export function textoDelCostoPorOrdenDelPlan(plan: Pick<PlanParaCosto, "costoPorOrden" | "costoPorOrdenPorcentual">): string {
  return plan.costoPorOrdenPorcentual !== null
    ? textoDelCostoPorOrdenPorcentual(plan.costoPorOrdenPorcentual)
    : textoDelCostoPorOrden(plan.costoPorOrden);
}

/**
 * SLT-66 (design §6.2; R24, R10) — el costo del plan: costo base y costo por orden (sin costo por orden,
 * «se aplica el valor global»). SLT-86 (R24, R28): el costo base lleva sus descuentos por período
 * (`textoDelPrecio`) y ya no hay aviso del anual, porque ningún descuento toca el costo por orden (R13).
 */
export function lineasDeCosto(plan: PlanParaCosto): string[] {
  return [
    TEXTOS_PLAN.costoBase(textoDelPrecio(plan.precio)),
    TEXTOS_PLAN.costoPorOrden(textoDelCostoPorOrdenDelPlan(plan)),
  ];
}
