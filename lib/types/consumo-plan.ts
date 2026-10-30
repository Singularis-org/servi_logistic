import type { ModuloApagable } from "@prisma/client";

import type { RolConTope } from "@/lib/types/planes";

// SLT-58 (design §5) — lo que ve una empresa de su plan y el superadmin en el detalle de una empresa.
// Todo serializable (cruza de Server Component a cliente): las fechas viajan como `AAAA-MM-DD`.

/** El uso que cuentan los topes de SL-24 (`plan_uso_*`): una sola definición de «uso». */
export type UsoDelPlan = { ordenes: number; apiKeys: number; porRol: Record<RolConTope, number> };

export type EstadoFila = "sin_limite" | "normal" | "cerca" | "lleno";

export type FilaConsumo = {
  clave: "ordenes" | "api_keys" | RolConTope;
  etiqueta: string;
  usados: number;
  /** `null` = sin límite. */
  maximo: number | null;
  estado: EstadoFila;
  texto: string;
};

/** `vigenteDesde` en la hora de la plataforma. */
export type CambioPendienteVista = { vigenteDesde: string; lineas: string[] };

export type ReinicioDelCiclo = { dias: number; fecha: string };

export type PlanConConsumo = {
  nombre: string;
  /** `textoDelPrecio`: sin moneda (D26). */
  precioTexto: string;
  modulos: { clave: ModuloApagable; nombre: string }[];
  filas: FilaConsumo[];
  reinicio: ReinicioDelCiclo;
  cambioPendiente: CambioPendienteVista | null;
};

export type MiPlanResult =
  | { estado: "ok"; plan: PlanConConsumo | null } // null = sin plan (R6)
  | { estado: "forbidden" };
