import { ROL_LABELS } from "@/lib/auth/rol-label";
import { formatearConteo } from "@/lib/planes/consumo";
import { SIN_LIMITE } from "@/lib/planes/mensajes";
import { ROLES_CON_TOPE, type TopesPlan } from "@/lib/types/planes";

// SLT-58 (design §6.3, §6.5) — cómo se pinta un plan en el catálogo y en su detalle. Puro: sin React.
// Ningún texto nombra la marca, el país ni la moneda.

export const TEXTOS_PLAN = {
  publico: "Público",
  customDe: (empresa: string) => `Custom de ${empresa}`,
  /** Un custom cuya empresa no se pudo leer: se dice que es custom sin inventar a quién. */
  custom: "Custom",
  archivado: "Archivado",
  ordenes: "Órdenes por ciclo",
  apiKeys: "API keys activas",
  rol: (etiqueta: string) => `Usuarios con el rol ${etiqueta}`,
  sinTopesDeRol: "Usuarios: sin límite por rol",
} as const;

/** «Público» o «Custom de <empresa>» (R13). */
export function textoDeVisibilidad(visibilidad: "publico" | "custom", empresaNombre: string | null): string {
  if (visibilidad === "publico") return TEXTOS_PLAN.publico;
  return empresaNombre === null ? TEXTOS_PLAN.custom : TEXTOS_PLAN.customDe(empresaNombre);
}

const limite = (n: number | null | undefined) => (n === null || n === undefined ? SIN_LIMITE : formatearConteo(n));

/**
 * Una línea por tope: órdenes, los roles en el orden de `ROLES_CON_TOPE` y API keys. Con `compacto`
 * (la tabla del catálogo) los roles sin tope se resumen en una línea para no alargar la fila.
 */
export function lineasDeTopes(topes: TopesPlan, compacto = false): string[] {
  const roles = ROLES_CON_TOPE.filter((rol) => !compacto || topes.porRol[rol] !== undefined).map(
    (rol) => `${TEXTOS_PLAN.rol(ROL_LABELS[rol])}: ${limite(topes.porRol[rol])}`,
  );
  return [
    `${TEXTOS_PLAN.ordenes}: ${limite(topes.ordenesPorCiclo)}`,
    ...(roles.length === 0 ? [TEXTOS_PLAN.sinTopesDeRol] : roles),
    `${TEXTOS_PLAN.apiKeys}: ${limite(topes.apiKeys)}`,
  ];
}
