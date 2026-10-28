import type { RolValue } from "@prisma/client";

import { ROL_LABELS } from "@/lib/auth/rol-label";

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
