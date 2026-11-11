import type { ModuloApagable, RolValue } from "@prisma/client";

import { ROL_LABELS } from "@/lib/auth/rol-label";
import { money } from "@/lib/config/moneda";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { importeCanonico } from "@/lib/planes/rastro";
import type { CosteoDelCiclo, CostoVigente } from "@/lib/types/consumo-plan";
import {
  ROLES_CON_TOPE,
  TIPOS_COBRO,
  type CostoPorOrdenPorcentual,
  type DescuentoPeriodo,
  type PeriodicidadOrdenes,
  type PrecioPlan,
  type RolConTope,
  type TipoCobro,
} from "@/lib/types/planes";

// SL-24 (design §6.4, §6.6) — los textos del tope del plan. Un solo sitio para las tres vías (carga
// de órdenes, usuarios y API keys) y para el superadmin. El rol sale de `ROL_LABELS`, la etiqueta que
// ya ve la pantalla de usuarios. Ningún texto nombra la marca ni el país.

// SLT-86 (R8): sin la variante `ordenes`: ningún plan topa ya las órdenes.
export type TopeDelPlan =
  | { tope: "rol"; rol: RolValue; maximo: number; usados: number; pedidas: number }
  | { tope: "api_keys"; maximo: number; usados: number; pedidas: number };

/** El texto que ve quien provocó el alta rechazada. */
export function mensajeDelTope(t: TopeDelPlan): string {
  switch (t.tope) {
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
  tope: "api_keys" | RolValue;
  usados: number;
  maximo: number;
}

function cosaDelTope(tope: TopePasado["tope"]): string {
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
/* SLT-58 (design §6.5, §11.4) — primera asignación con fecha de inicio        */
/* -------------------------------------------------------------------------- */
// Textos aprobados (P13, P15). Los conteos llegan YA pintados (`formatearConteo` de
// `lib/planes/consumo.ts`, «3.200»): este módulo no formatea números (importar `consumo.ts`, que ya lo importa a él, haría un ciclo).

// SLT-86 (R8): sin el aviso de órdenes de R36/R37 (`ordenesYaPasadas`): ya no hay tope de órdenes.

/** Aviso de R37/R42 para un rol con tope; `{rol}` es su etiqueta de `ROL_LABELS`. */
export function rolYaPasado(usados: string, maximo: string, rol: RolConTope): string {
  return `La empresa ya tiene ${usados} de ${maximo} ${ROL_LABELS[rol]}: no podrá activar ni crear más hasta bajar del tope.`;
}

/** Aviso de R37/R42 para las API keys. */
export function apiKeysYaPasadas(usados: string, maximo: string): string {
  return `La empresa ya tiene ${usados} de ${maximo} API keys activas: no podrá crear ni activar más hasta bajar del tope.`;
}

/** Error del campo `inicioCiclo` fuera del rango permitido (R30). `min`/`max` en `AAAA-MM-DD`. */
export function rangoInicioCiclo(min: string, max: string): string {
  return `Elige una fecha entre el ${min} y el ${max}.`;
}

/** Error del campo `inicioCiclo` cuando la empresa ya tiene plan (R31). */
export const SOLO_PRIMERA_ASIGNACION = "La fecha de inicio solo se elige en la primera asignación.";

/** SLT-86 (R16): error del campo `vigenteDesde` cuando falta en un cambio a una empresa con plan. */
export const FECHA_DE_EFECTO_OBLIGATORIA = "Elige desde qué fecha rige el cambio.";

/** SLT-86 (R22): error del campo `vigenteDesde` con una fecha anterior a hoy. */
export const FECHA_DE_EFECTO_PASADA = "La fecha de efecto no puede ser anterior a hoy.";

/** SLT-86 (R2, R16): error del campo `vigenteDesde` en una empresa sin plan, que lleva fecha de inicio. */
export const SOLO_CON_PLAN = "La fecha de efecto es de un cambio a una empresa con plan; la primera asignación lleva fecha de inicio.";

/**
 * SLT-118 (R37, P12): error del campo `periodicidadOrdenes` al pasar un plan a órdenes mensuales con `empresas`
 * empresas que lo tienen, o lo tienen como cambio pendiente, con tipo de cobro quincenal. El de `tipoCobro` es
 * `TIPO_QUINCENAL_CON_ORDENES_MENSUALES` de `lib/types/planes.ts` (lo usa el esquema, que este módulo importa).
 */
export function periodicidadIncompatible(empresas: number): string {
  const quien = empresas === 1 ? "1 empresa tiene" : `${empresas} empresas tienen`;
  return `${quien} este plan, o lo tiene${empresas === 1 ? "" : "n"} como cambio pendiente, con tipo de cobro quincenal: con facturación de órdenes mensual su cuota del 16 no tendría factura. Cámbiales antes el tipo de cobro.`;
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
 * SLT-86 (design §5.3, §7.1; R19, R26; decisión del 2026-11-05): la celda del tipo de cobro de una fila
 * `cambio_cancelado` del historial de asignaciones. `tipo` llega ya con su etiqueta («Quincenal»), que vive
 * con las del selector; el plan va en su propia columna. Sin fecha (no debería pasar) solo dice el tipo.
 */
export function textoDelCambioCancelado(tipo: string, desde: string | null): string {
  return desde === null ? `Cambio cancelado: ${tipo}` : `Cambio cancelado: ${tipo} desde el ${desde}`;
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
  /** SLT-86 (R30): una fila de antes de la ficha trae aquí el anual (`PrecioAnterior`). */
  precio?: { antes: PrecioDelRastro; despues: PrecioDelRastro };
  /** SLT-86 (R31): un descuento por período, en su propia clave del rastro (`rastro.ts`). */
  descuento_quincenal?: CambioDeDescuento;
  descuento_mensual?: CambioDeDescuento;
  descuento_bimestral?: CambioDeDescuento;
  descuento_anual?: CambioDeDescuento;
  /**
   * SLT-86 (R30, R34): la fila `editado` que deja la migración al retirar el tope de órdenes, con
   * `antes` como texto («<n>») y `despues` en `null`. Ningún cambio nuevo la escribe.
   */
  tope_ordenes_ciclo?: { antes: string | number | null; despues: string | number | null };
  costoPorOrden?: { antes: string | null; despues: string | null };
  /** SLT-83 (R4): un rastro anterior a la ficha no la trae y no pinta esa línea. */
  costoPorOrdenPorcentual?: { antes: CostoPorOrdenPorcentual | null; despues: CostoPorOrdenPorcentual | null };
  /**
   * SLT-118 (R35): la periodicidad de órdenes del plan. Un rastro anterior a la ficha no la trae; el alta
   * la trae con `antes: null`: no es un cambio y no pinta línea.
   */
  periodicidadOrdenes?: { antes: PeriodicidadOrdenes | null; despues: PeriodicidadOrdenes | null };
}

type CambioDeDescuento = { antes: DescuentoPeriodo | null; despues: DescuentoPeriodo | null };

type TopesDelPlanParaCorreo = {
  /** SLT-86 (R8, R30): solo en las filas de antes de la ficha; las nuevas no lo traen. */
  ordenesPorCiclo?: number | null;
  porRol: Partial<Record<RolConTope, number>>;
  apiKeys: number | null;
};

export const SIN_LIMITE = "sin límite";

function limite(n: number | null | undefined): string {
  return n === null || n === undefined ? SIN_LIMITE : String(n);
}

/** Un tope tal como lo guardó la migración de SLT-86 en el rastro: texto o número; `null` = sin límite. */
function limiteDelRastro(n: string | number | null): string {
  return n === null ? SIN_LIMITE : String(n);
}

function ladoDelDescuento(d: DescuentoPeriodo | null): string {
  return d === null ? SIN_DESCUENTO : valorDelDescuento(d);
}

/**
 * El precio tal como lo guardó `plan_rastro` antes de SLT-86 (y los correos ya encolados): con el anual
 * fijo o el descuento anual, sin `descuentos`. R30: esas filas se siguen pintando tal cual.
 */
type PrecioAnterior = {
  tipo: "monto";
  mensual: string;
  anual?: { tipo: "fijo"; monto: string } | { tipo: "descuento"; porcentaje: string } | null;
};

/**
 * Un precio leído del rastro o de una versión: el de hoy, el de antes de SLT-86, o el `precio` del rastro
 * de SLT-86, que no trae los descuentos porque van en sus propias claves (`rastro.ts`).
 */
export type PrecioDelRastro = PrecioPlan | PrecioAnterior | { tipo: "monto"; mensual: string } | { tipo: string };

/** SLT-86 (design §7.1): «Descuento {tipo}: {p} %» o «Descuento {tipo}: {monto}», sin moneda. */
export function textoDelDescuento(tipo: TipoCobro, d: DescuentoPeriodo): string {
  return `Descuento ${tipo}: ${valorDelDescuento(d)}`;
}

function valorDelDescuento(d: DescuentoPeriodo): string {
  return d.tipo === "porcentaje" ? `${importeCanonico(d.porcentaje)} %` : importeCanonico(d.monto);
}

/** El lado vacío de la línea de un descuento en «qué cambia». */
export const SIN_DESCUENTO = "sin descuento";

/**
 * El precio como texto informativo, sin símbolo de moneda (D26). Lo pintan también las pantallas (SLT-58
 * R1, R13). SLT-86 (R24, design §7.1): «{mensual} / mes» y un «Descuento {tipo}: …» por cada período con
 * descuento, en el orden de `TIPOS_COBRO`.
 */
export function textoDelPrecio(p: PrecioDelRastro): string {
  // D1 (ajuste planes-custom): «negociable» ya no existe, pero `plan_rastro` y los correos encolados
  // antes de 20261104130000 pueden traerlo; se pinta como lo que es ahora, «sin precio».
  if (p.tipo !== "monto" || !("mensual" in p)) return "sin precio";
  const partes = [`${p.mensual} / mes`];
  if ("descuentos" in p) {
    for (const tipo of TIPOS_COBRO) {
      const d = p.descuentos[tipo];
      if (d !== undefined) partes.push(textoDelDescuento(tipo, d));
    }
  }
  // R30: una fila de antes de SLT-86 con el anual fijo o el descuento anual, con su texto de entonces.
  if ("anual" in p && p.anual) {
    partes.push(
      p.anual.tipo === "fijo" ? `${p.anual.monto} al año` : `con ${p.anual.porcentaje} % de descuento en el pago anual`,
    );
  }
  return partes.join(" · ");
}

/** SLT-66 (design §4.4): el costo por orden del plan, sin símbolo de moneda; vacío = el global (R12). */
export function textoDelCostoPorOrden(c: string | null): string {
  return c === null ? "se aplica el valor global" : `${c} por orden`;
}

/**
 * SLT-83 (R4; aprobado por el humano el 2026-11-04): el lado del costo fijo en la línea «Costo por
 * orden» cuando ese lado está vacío porque el plan cobra porcentual, en lugar de «se aplica el valor
 * global».
 */
export const COBRA_PORCENTUAL = "cobra porcentual";

/**
 * SLT-83 (R4): un lado de la línea «Costo por orden». Vacío con el porcentual de ese mismo lado no
 * nulo es «cobra porcentual»; sin porcentual, o en un rastro anterior a la ficha, sigue SLT-66.
 */
function textoDelLadoFijo(c: string | null, porcentual: CostoPorOrdenPorcentual | null | undefined): string {
  return c === null && porcentual ? COBRA_PORCENTUAL : textoDelCostoPorOrden(c);
}

/**
 * SLT-83 (design §4.4; R21): el costo por orden de un plan porcentual, sin símbolo de moneda y con dos
 * decimales aunque llegue «2» de una versión aún sin guardar.
 */
export function textoDelCostoPorOrdenPorcentual(c: CostoPorOrdenPorcentual): string {
  const porcentaje = `${importeCanonico(c.porcentaje)} % del valor del paquete`;
  return c.minimo === null ? porcentaje : `${porcentaje}, mínimo ${importeCanonico(c.minimo)}`;
}

/**
 * SLT-83 (R4): el lado vacío de la línea «Costo por orden porcentual» (el plan es fijo o vacío).
 * Texto aprobado por el humano el 2026-11-04 (`progress/impl_SLT-83.md > Textos aprobados`).
 */
export const SIN_COSTO_PORCENTUAL = "sin costo porcentual";

function textoDelPorcentualOVacio(c: CostoPorOrdenPorcentual | null): string {
  return c === null ? SIN_COSTO_PORCENTUAL : textoDelCostoPorOrdenPorcentual(c);
}

/**
 * SLT-83 (design §4.4; R22): la columna «Cobro por orden» del listado de «Empresas». El modo fijo es el
 * importe de hoy, con `money` como lo pinta la celda desde SL-40; el porcentual, `«{p} % (mín. {m})»` o
 * `«{p} %»`, sin moneda como el resto de importes del plan (SLT-66 §2.5). La fuente va aparte.
 */
export function textoDelCobroVigente(c: CostoVigente): string {
  if (c.modo === "fijo") return money(c.monto);
  const porcentaje = `${importeCanonico(c.porcentaje)} %`;
  return c.minimo === null ? porcentaje : `${porcentaje} (mín. ${importeCanonico(c.minimo)})`;
}

/** SLT-83 (design §4.4; R23): la nota bajo el costo por orden porcentual de «Mi plan». */
export const NOTA_COBRO_PORCENTUAL = "se cobra cuando la orden llega a un estado final";

/** Las líneas del costo del ciclo de «Mi plan» y del detalle de empresa con un plan porcentual. */
export interface LineasDelCosteoPorcentual {
  costoPorOrden: string;
  nota: string;
  cobrado: string;
  pendientes: string;
  /** `null` con la base por definir: sin total (SLT-66 R20). */
  total: string | null;
}

/**
 * SLT-83 (R23; aprobado por el humano el 2026-11-04): el término del cobrado en la línea del total. Un
 * cobrado negativo se pinta como resta con su valor absoluto («− 500.00», U+2212), nunca «+ -500.00».
 * El signo sale del texto decimal: la pantalla no hace aritmética con el dinero.
 */
function sumaDelCobrado(cobrado: string): string {
  return cobrado.startsWith("-") ? `\u2212 ${cobrado.slice(1)}` : `+ ${cobrado}`;
}

/**
 * SLT-83 (design §4.4; R23): los textos de un costeo porcentual. Los importes llegan ya calculados del
 * servidor (`costeoDelCiclo`) y se pintan tal cual, sin moneda, como las líneas del modo fijo. Las
 * órdenes sin estado final son solo un conteo: no se estima su importe.
 */
export function lineasDelCosteoPorcentual(c: Extract<CosteoDelCiclo, { modo: "porcentual" }>): LineasDelCosteoPorcentual {
  return {
    costoPorOrden: `Costo por orden: ${textoDelCostoPorOrdenPorcentual(c)}`,
    nota: NOTA_COBRO_PORCENTUAL,
    // SLT-86 (R28; decisiones del 2026-11-05 y del 2026-11-06): «período» en lugar de «ciclo»,
    // también en las órdenes sin estado final.
    cobrado: `Cobrado en el período: ${c.cobrado}`,
    pendientes: `Órdenes del período sin estado final: ${c.pendientes}`,
    total:
      c.total === null || c.base.tipo !== "monto"
        ? null
        : `Total del período hasta hoy: ${c.base.periodo} ${sumaDelCobrado(c.cobrado)} = ${c.total}`,
  };
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
  // SLT-66 (R9): el precio mensual de SL-24 se llama ahora «costo base».
  if (c.precio) lineas.push(`Costo base: ${textoDelPrecio(c.precio.antes)} → ${textoDelPrecio(c.precio.despues)}`);
  // SLT-86 (R31): un descuento por línea, en el orden de los tipos.
  for (const tipo of TIPOS_COBRO) {
    const d = c[`descuento_${tipo}`];
    if (d) lineas.push(`Descuento ${tipo}: ${ladoDelDescuento(d.antes)} → ${ladoDelDescuento(d.despues)}`);
  }
  // SLT-86 (R30): la fila de la migración que retiró el tope de órdenes.
  if (c.tope_ordenes_ciclo) {
    const { antes, despues } = c.tope_ordenes_ciclo;
    lineas.push(`Órdenes por ciclo: ${limiteDelRastro(antes)} → ${limiteDelRastro(despues)}`);
  }
  if (c.costoPorOrden) {
    const { antes, despues } = c.costoPorOrden;
    const porcentual = c.costoPorOrdenPorcentual;
    lineas.push(
      `Costo por orden: ${textoDelLadoFijo(antes, porcentual?.antes)} → ${textoDelLadoFijo(despues, porcentual?.despues)}`,
    );
  }
  if (c.costoPorOrdenPorcentual) {
    const { antes, despues } = c.costoPorOrdenPorcentual;
    lineas.push(`Costo por orden porcentual: ${textoDelPorcentualOVacio(antes)} → ${textoDelPorcentualOVacio(despues)}`);
  }
  // SLT-118 (R35; texto del humano, 2026-11-11): «Facturación de órdenes: quincenal → mensual», el valor tal
  // cual, en minúscula.
  if (c.periodicidadOrdenes?.antes && c.periodicidadOrdenes.despues) {
    lineas.push(`Facturación de órdenes: ${c.periodicidadOrdenes.antes} → ${c.periodicidadOrdenes.despues}`);
  }
  return lineas;
}
