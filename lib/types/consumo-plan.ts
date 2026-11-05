import type { ModuloApagable } from "@prisma/client";

import type { RolConTope, TipoCobro } from "@/lib/types/planes";

// SLT-58 (design §5) — lo que ve una empresa de su plan y el superadmin en el detalle de una empresa.
// Todo serializable (cruza de Server Component a cliente): las fechas viajan como `AAAA-MM-DD`.

/** El uso que cuentan los topes de SL-24 (`plan_uso_*`): una sola definición de «uso». */
export type UsoDelPlan = { ordenes: number; apiKeys: number; porRol: Record<RolConTope, number> };

export type EstadoFila = "sin_limite" | "normal" | "cerca" | "lleno";

// SLT-86 (R8): sin fila de órdenes: ya no tienen tope. Su conteo va en `PlanConConsumo.ordenesDelPeriodo`.
export type FilaConsumo = {
  clave: "api_keys" | RolConTope;
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

/**
 * SLT-83 (R24): lo cobrado en el ciclo en curso (por fecha del movimiento) y las órdenes porcentuales sin
 * estado final. SLT-86 (R28): el ciclo es el período en curso de calendario, con su tramo.
 */
export type CobroDelCiclo = { cobrado: string; pendientes: number };

/** Lo que comparten los dos modos del costeo. */
type CosteoComun = {
  /**
   * `"0.00"` es un monto (R20). SLT-86 (R28): el costo base del período en curso, o de su tramo, con el
   * descuento del período; ya no el mensual.
   */
  base: { tipo: "monto"; periodo: string } | { tipo: "por_definir" };
  /** Base no «monto» o plan sin costo por orden: el aviso del superadmin (R20). */
  sinCostoConcreto: boolean;
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
      /** SLT-86 (R7): las órdenes del período en curso, el mismo `uso.ordenes` de `plan_de_la_empresa`. */
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
 * SLT-86 (R26, R32): el cambio pendiente de una empresa, sin el actor. `desde` es `AAAA-MM-DD` en la hora
 * de la plataforma: rige desde sus 00:00. `planNombre` es el plan que entra (el mismo si solo cambia el tipo).
 */
export type PendienteDeEmpresa = { planNombre: string; tipo: TipoCobro; desde: string };

/** SLT-86 (R5, R27): el período en curso; `desde` y `hasta` en `AAAA-MM-DD`, `hasta` = su último día. */
export type PeriodoDelCobro = { desde: string; hasta: string; esTramo: boolean };

/**
 * Ajuste planes-custom (D7–D9): cómo paga la empresa su plan. Solo informativo: no mueve dinero. SLT-86
 * (R9–R12, R15, R27): el período en curso de calendario, su costo y el siguiente cobro.
 */
export type CobroDelPlan = {
  tipo: TipoCobro;
  periodo: PeriodoDelCobro;
  /** El costo base del período en curso o de su tramo, dos decimales; `null` si el plan no tiene costo base. */
  costo: string | null;
  /** `AAAA-MM-DD`: el inicio del siguiente período de calendario o, con un pendiente, su fecha (R27). */
  siguienteCobro: string;
  pendiente: PendienteDeEmpresa | null;
};

export type PlanConConsumo = {
  nombre: string;
  /** `textoDelPrecio`: sin moneda (D26). */
  precioTexto: string;
  modulos: { clave: ModuloApagable; nombre: string }[];
  filas: FilaConsumo[];
  /** SLT-86 (R7, R8): las órdenes vivas del período en curso, sin tope. */
  ordenesDelPeriodo: number;
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
