import type { ModuloApagable, RolValue } from "@prisma/client";

import { ROL_LABELS } from "@/lib/auth/rol-label";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { ROLES_CON_TOPE, type PrecioPlan, type RolConTope } from "@/lib/types/planes";

// SL-24 (design §6.4, §6.6) — los textos del tope del plan. Un solo sitio para las tres vías (carga
// de órdenes, usuarios y API keys) y para el superadmin. El rol sale de `ROL_LABELS`, la etiqueta que
// ya ve la pantalla de usuarios. Ningún texto nombra la marca ni el país.

export type TopeDelPlan =
  | { tope: "ordenes"; maximo: number; usados: number; pedidas: number }
  | { tope: "rol"; rol: RolValue; maximo: number; usados: number; pedidas: number }
  | { tope: "api_keys"; maximo: number; usados: number; pedidas: number };

/** El texto que ve quien provocó el alta rechazada. */
export function mensajeDelTope(t: TopeDelPlan): string {
  switch (t.tope) {
    case "ordenes":
      return (
        `Tu plan permite ${t.maximo} órdenes por ciclo. Llevas ${t.usados} y esta carga trae ${t.pedidas}. ` +
        "Anula órdenes que no vayas a enviar o pide un cambio de plan."
      );
    case "rol":
      return (
        `Tu plan permite ${t.maximo} usuarios activos con el rol ${ROL_LABELS[t.rol]}. Ya tienes ${t.usados}. ` +
        "Inactiva alguno o pide un cambio de plan."
      );
    case "api_keys":
      return (
        `Tu plan permite ${t.maximo} API keys activas. Ya tienes ${t.usados}. ` +
        "Desactiva o elimina alguna, o pide un cambio de plan."
      );
  }
}

/** Un tope que una empresa ya pasa, visto por el superadmin al asignar o editar un plan (R12, R16). */
export interface TopePasado {
  empresa: string;
  tope: "ordenes" | "api_keys" | RolValue;
  usados: number;
  maximo: number;
}

function cosaDelTope(tope: TopePasado["tope"]): string {
  if (tope === "ordenes") return "órdenes en el ciclo en curso";
  if (tope === "api_keys") return "API keys activas";
  return `usuarios activos con el rol ${ROL_LABELS[tope]}`;
}

/** Una línea por tope excedido: «{empresa} ya tiene {usados} {cosa} y el plan permite {maximo}.» */
export function mensajeTopesPasados(topes: readonly TopePasado[]): string {
  return topes
    .map((t) => `${t.empresa} ya tiene ${t.usados} ${cosaDelTope(t.tope)} y el plan permite ${t.maximo}.`)
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Correos del cambio de plan (T12; design §16.4; R41, R42, R45)               */
/* -------------------------------------------------------------------------- */
// Los usa `lib/services/email/plantillas/cambio-plan.ts`. Las fechas llegan YA pintadas: este módulo
// no lee relojes ni formatea fechas. Literales del spec: `mensajeCambioCancelado` (R45) y
// `lineaReemplazo` (§16.2). El resto son propuestas de T12, pendientes de aprobación humana
// (`progress/impl_SL-24.md > T12`).

export type TipoCorreoCambioPlan = "guardado" | "recordatorio_7" | "recordatorio_1" | "cancelado";

/** El asunto de cada correo. */
export function asuntoCambioPlan(tipo: TipoCorreoCambioPlan, planNombre: string): string {
  switch (tipo) {
    case "guardado":
      return `Cambios en el plan ${planNombre}`;
    case "recordatorio_7":
      return `El plan ${planNombre} cambia en 7 días`;
    case "recordatorio_1":
      return `El plan ${planNombre} cambia mañana`;
    case "cancelado":
      return `Se canceló el cambio del plan ${planNombre}`;
  }
}

/**
 * La primera frase: qué plan cambia y desde cuándo (R41). `fecha` null = edición inmediata (solo con
 * `guardado`: los recordatorios siempre tienen fecha).
 */
export function introCambioPlan(
  tipo: Exclude<TipoCorreoCambioPlan, "cancelado">,
  planNombre: string,
  empresaNombre: string,
  fecha: string | null,
): string {
  if (tipo === "recordatorio_7") {
    return `Faltan 7 días: el plan ${planNombre} de ${empresaNombre} cambia a partir del ${fecha}.`;
  }
  if (tipo === "recordatorio_1") {
    return `Mañana cambia el plan ${planNombre} de ${empresaNombre}: rige a partir del ${fecha}.`;
  }
  return fecha === null
    ? `El plan ${planNombre} de ${empresaNombre} cambió y los cambios ya rigen.`
    : `El plan ${planNombre} de ${empresaNombre} cambia a partir del ${fecha}.`;
}

/** §16.2: el correo de guardado de un cambio que reemplaza a otro (no sale correo de cancelación). */
export function lineaReemplazo(fechaAnterior: string): string {
  return `Este cambio reemplaza al previsto para ${fechaAnterior}.`;
}

/** R45, literal: el único texto del correo de cancelación (a mano o al archivar). */
export function mensajeCambioCancelado(planNombre: string, fecha: string): string {
  return `El cambio del plan ${planNombre} previsto para ${fecha} se canceló; tu plan sigue igual.`;
}

/**
 * Decisiones cerradas («Texto del cambio programado») y design §6.5: el mismo texto para el cambio
 * pendiente en todas las pantallas (la empresa, el detalle de la empresa y el detalle del plan).
 */
export function textoCambioProgramado(fecha: string): string {
  return `Cambio programado desde ${fecha}`;
}

export const TITULO_LINEAS_DE_CAMBIO = "Esto es lo que cambia:";
/** Un reemplazo por la versión vigente: hay correo (reemplaza al previsto), pero nada que listar. */
export const SIN_LINEAS_DE_CAMBIO = "El plan queda igual que el actual.";
export const TITULO_TOPES_PASADOS = "Con el plan nuevo, tu empresa ya pasa estos topes:";

/** Una línea por campo que cambia: `<qué>: <antes> → <después>`. */
export interface CambioDelPlanParaCorreo {
  nombre?: { antes: string; despues: string };
  topes?: { antes: TopesDelPlanParaCorreo; despues: TopesDelPlanParaCorreo };
  modulos?: { antes: readonly ModuloApagable[]; despues: readonly ModuloApagable[] };
  precio?: { antes: PrecioPlan; despues: PrecioPlan };
}

type TopesDelPlanParaCorreo = {
  ordenesPorCiclo: number | null;
  porRol: Partial<Record<RolConTope, number>>;
  apiKeys: number | null;
};

export const SIN_LIMITE = "sin límite";

function limite(n: number | null | undefined): string {
  return n === null || n === undefined ? SIN_LIMITE : String(n);
}

/** El precio como texto informativo, sin símbolo de moneda (D26). Lo pintan también las pantallas (SLT-58 R1, R13). */
export function textoDelPrecio(p: PrecioPlan): string {
  if (p.tipo === "sin_precio") return "sin precio";
  if (p.tipo === "negociable") return "negociable";
  const mensual = `${p.mensual} al mes`;
  if (p.anual === null) return mensual;
  return p.anual.tipo === "fijo"
    ? `${mensual}, ${p.anual.monto} al año`
    : `${mensual}, con ${p.anual.porcentaje} % de descuento en el pago anual`;
}

/**
 * Las líneas de «qué cambia», a partir de `diferenciasDelPlan` (solo los campos que cambiaron). Sin
 * marca ni país: los importes van tal cual, sin símbolo de moneda.
 */
export function lineasDeCambioDelPlan(c: CambioDelPlanParaCorreo): string[] {
  const lineas: string[] = [];
  if (c.nombre) lineas.push(`Nombre del plan: ${c.nombre.antes} → ${c.nombre.despues}`);
  if (c.topes) {
    const { antes, despues } = c.topes;
    if (antes.ordenesPorCiclo !== despues.ordenesPorCiclo) {
      lineas.push(`Órdenes por ciclo: ${limite(antes.ordenesPorCiclo)} → ${limite(despues.ordenesPorCiclo)}`);
    }
    for (const rol of ROLES_CON_TOPE) {
      if (antes.porRol[rol] === despues.porRol[rol]) continue;
      lineas.push(
        `Usuarios activos con el rol ${ROL_LABELS[rol]}: ${limite(antes.porRol[rol])} → ${limite(despues.porRol[rol])}`,
      );
    }
    if (antes.apiKeys !== despues.apiKeys) {
      lineas.push(`API keys activas: ${limite(antes.apiKeys)} → ${limite(despues.apiKeys)}`);
    }
  }
  if (c.modulos) {
    const { antes, despues } = c.modulos;
    for (const m of despues) if (!antes.includes(m)) lineas.push(`Se incluye el módulo ${nombreDelModulo(m)}.`);
    for (const m of antes) if (!despues.includes(m)) lineas.push(`Deja de incluirse el módulo ${nombreDelModulo(m)}.`);
  }
  if (c.precio) lineas.push(`Precio: ${textoDelPrecio(c.precio.antes)} → ${textoDelPrecio(c.precio.despues)}`);
  return lineas;
}
