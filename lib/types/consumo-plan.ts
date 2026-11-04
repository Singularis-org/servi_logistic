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

/** SLT-66 (R12): de dónde sale el costo por orden vigente; los mismos valores que `cobro_plataforma_fuente`. */
export type FuenteDelCosto = "empresa" | "plan" | "global" | "sin_configurar";

/**
 * SLT-66 (design §4.3; R18–R20, R10): el total estimado del ciclo. Importes como texto con dos
 * decimales: se calculan en decimal exacto en el servidor (`costeoDelCiclo`).
 */
export type CosteoDelCiclo = {
  /** `"0.00"` es un monto (R20). */
  base: { tipo: "monto"; mensual: string } | { tipo: "por_definir" };
  /** Siempre el vigente (R12, P1): excepción > plan > global > 0. */
  costoPorOrden: string;
  fuente: FuenteDelCosto;
  /** Las órdenes del ciclo: el mismo `uso.ordenes` que cuenta el tope. */
  ordenes: number;
  /** `ordenes × costoPorOrden`. */
  subtotalOrdenes: string;
  /** `base + subtotal`; `null` solo si la base está por definir (R19, R20). */
  total: string | null;
  /** Base no «monto» o plan sin costo por orden: el aviso del superadmin (R20). */
  sinCostoConcreto: boolean;
  /** R10: el plan tiene anual fijo o descuento, que no se aplican al costo por orden. */
  anualNoAplicaAlCosto: boolean;
};

export type PlanConConsumo = {
  nombre: string;
  /** `textoDelPrecio`: sin moneda (D26). */
  precioTexto: string;
  modulos: { clave: ModuloApagable; nombre: string }[];
  filas: FilaConsumo[];
  reinicio: ReinicioDelCiclo;
  cambioPendiente: CambioPendienteVista | null;
  /** SLT-66 (R18–R20). */
  costeo: CosteoDelCiclo;
};

export type MiPlanResult =
  | { estado: "ok"; plan: PlanConConsumo | null } // null = sin plan (R6)
  | { estado: "forbidden" };
