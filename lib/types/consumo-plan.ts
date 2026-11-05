import type { ModuloApagable } from "@prisma/client";

import type { RolConTope, TipoCobro } from "@/lib/types/planes";

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
 * SLT-83 (design §4.3; R22, R23): la regla vigente de la empresa, la de `cobro_plataforma_tarifa_de`.
 * El modo porcentual solo sale del plan: el global y la excepción son siempre fijos (R7).
 */
export type CostoVigente =
  | { modo: "fijo"; monto: string; fuente: FuenteDelCosto }
  | { modo: "porcentual"; porcentaje: string; minimo: string | null; fuente: "plan" };

/** SLT-83 (R24): lo cobrado en el ciclo en curso (por fecha del movimiento) y las órdenes porcentuales sin estado final. */
export type CobroDelCiclo = { cobrado: string; pendientes: number };

/** Lo que comparten los dos modos del costeo. */
type CosteoComun = {
  /** `"0.00"` es un monto (R20). */
  base: { tipo: "monto"; mensual: string } | { tipo: "por_definir" };
  /** Base no «monto» o plan sin costo por orden: el aviso del superadmin (R20). */
  sinCostoConcreto: boolean;
  /** R10: el plan tiene anual fijo o descuento, que no se aplican al costo por orden. */
  anualNoAplicaAlCosto: boolean;
};

/**
 * SLT-66 (design §4.3; R18–R20, R10): el total estimado del ciclo. Importes como texto con dos
 * decimales: se calculan en decimal exacto en el servidor (`costeoDelCiclo`). SLT-83: discriminado por
 * `modo`; el fijo es el de SLT-66 sin cambios.
 */
export type CosteoDelCiclo =
  | (CosteoComun & {
      modo: "fijo";
      /** Siempre el vigente (R12, P1): excepción > plan > global > 0. */
      costoPorOrden: string;
      fuente: FuenteDelCosto;
      /** Las órdenes del ciclo: el mismo `uso.ordenes` que cuenta el tope. */
      ordenes: number;
      /** `ordenes × costoPorOrden`. */
      subtotalOrdenes: string;
      /** `base + subtotal`; `null` solo si la base está por definir (R19, R20). */
      total: string | null;
    })
  | (CosteoComun & {
      modo: "porcentual";
      porcentaje: string;
      /** `null` = sin mínimo. */
      minimo: string | null;
      /** R24: Σ cargos − Σ reversos con instante en el ciclo. */
      cobrado: string;
      /** R23: órdenes del ciclo aún sin estado final; solo el conteo, sin estimar su importe. */
      pendientes: number;
      /** `base + cobrado`; `null` si la base está por definir (R23). */
      total: string | null;
    });

/**
 * Ajuste planes-custom (D7–D9): cómo paga la empresa su plan. Solo informativo: no mueve dinero.
 */
export type CobroDelPlan = {
  tipo: TipoCobro;
  /** D7: lo de UN período (mes o año), dos decimales; `null` si el plan no tiene costo base. */
  montoPeriodo: string | null;
  /** D8: `AAAA-MM-DD` en la hora de la plataforma; hoy si hoy es el aniversario. */
  siguienteCobro: string;
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
  /** Ajuste planes-custom (D9): tipo de cobro, monto del período y siguiente cobro. */
  cobro: CobroDelPlan;
};

export type MiPlanResult =
  | { estado: "ok"; plan: PlanConConsumo | null } // null = sin plan (R6)
  | { estado: "forbidden" };
