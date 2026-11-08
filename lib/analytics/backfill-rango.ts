import {
  esFechaCalendarioValida,
  fechaCalendario,
  sumarDiasCalendario,
  ultimosNDias,
} from "@/lib/utils/calendario-zona";

// Feature 125 (design §3, T1.1) — PLANIFICADOR PURO del rango del backfill.
//
// Es el hermano de `rollup-dia.ts`: aritmetica de dia calendario de la zona de la empresa
// (SLT-42; antes, Costa Rica fija) y nada mas. Sin Prisma, sin variables de entorno, sin
// `console`, sin `new Date()` propio (el reloj se INYECTA, igual que en la 124) y sin una sola
// hora de desplazamiento escrita a mano: todo sale de `@/lib/utils/calendario-zona`.
//
// Este modulo NO agrega nada. La agregacion es de la feature 124
// (`AnaliticaRollupService.agregarFecha`), que esta entregada; aqui solo se decide QUE fechas
// se le van a pedir y COMO se etiqueta cada una.

/**
 * R20 — HORIZONTE DEL HISTORIAL. Procedencia, que es lo que hace util a la constante:
 * `orden_historial_estado` se creo en
 * `db/migrations/20260713120000_orden_historial_estado/migration.sql`, y esa migracion fue
 * **ADITIVA Y SIN BACKFILL**: no genero ni una fila para las ordenes que ya existian.
 *
 * Consecuencia medida (limitacion L1 de `requirements.md`, comprobada en
 * `tests/integration/db/analytics-daily-backfill.test.ts`): las consultas del agregador de la
 * 124 unen contra la CTE `estatus_al_corte`, que exige al menos una transicion anterior al
 * corte. Una orden sin historial anterior al corte no entra en NINGUN cubo, asi que para toda
 * fecha anterior a este horizonte el agregador termina con exito y CERO filas en TODAS las
 * medidas. No es un dia vacio: es un dia que no se puede saber. De ahi la clasificacion
 * `no_comparable`, que es informativa y no cambia ni una llamada (R21).
 */
export const HORIZONTE_HISTORIAL_CR = "2026-07-13";

/** Forma de una fecha calendario: `YYYY-MM-DD`. Nada de `Date.parse` permisivo. */
const FECHA_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;

/** Plan aceptado: las fechas a recorrer y cuales de ellas caen bajo el horizonte. */
export interface PlanBackfill {
  readonly desde: string;
  readonly hasta: string;
  /** Fechas calendario del rango, ascendentes, inclusivas en ambos extremos y sin repetidos. */
  readonly fechas: readonly string[];
  /** Subconjunto de `fechas` anterior al horizonte del historial (R20). */
  readonly noComparables: readonly string[];
}

export type ResultadoPlan =
  | { readonly ok: true; readonly plan: PlanBackfill }
  | { readonly ok: false; readonly motivo: string };

export interface RangoPedido {
  readonly desde: string;
  readonly hasta: string;
  /** Reloj INYECTADO: sin default, para que ningun test crea que controla lo que no controla. */
  readonly ahora: Date;
  /** Zona IANA del pais de la empresa: de ella salen «hoy» y «ayer» (SLT-42). */
  readonly zona: string;
}

/** `true` si la fecha es anterior al horizonte del historial (R20). Comparacion lexicografica: `YYYY-MM-DD` lo permite. */
export function esNoComparable(fecha: string): boolean {
  return fecha < HORIZONTE_HISTORIAL_CR;
}

/**
 * Fecha calendario valida DE VERDAD: la forma no basta, porque `2026-02-30` y `2026-13-01`
 * la cumplen. El ROUND-TRIP de `esFechaCalendarioValida` exige que el dia exista.
 */
function esFechaCalendario(fecha: string): boolean {
  return FECHA_CALENDARIO.test(fecha) && esFechaCalendarioValida(fecha);
}

/** Fecha calendario siguiente a `fecha` (R8: nada de sumar 24 h aqui; se suma un dia de calendario). */
function fechaSiguiente(fecha: string): string {
  return sumarDiasCalendario(fecha, 1);
}

/**
 * R6-R10 — planifica el rango o lo rechaza ENTERO, siempre antes de que nadie abra una
 * conexion. Los cuatro motivos de rechazo:
 *
 * 1. alguna fecha no es una fecha calendario `YYYY-MM-DD` valida;
 * 2. `desde > hasta`;
 * 3. el rango incluye el dia en curso de la zona (D3: el ultimo recomputable es AYER, porque el
 *    dia de hoy es del job de la 124 y no hay lock compartido con el);
 * 4. el rango incluye una fecha futura (caso particular del anterior, con su propio mensaje).
 *
 * El rechazo NOMBRA la fecha ofensora: un «rango invalido» a secas obliga al operador a
 * adivinar cual de las dos puntas esta mal.
 */
export function planificarBackfill({ desde, hasta, ahora, zona }: RangoPedido): ResultadoPlan {
  if (!esFechaCalendario(desde)) {
    return { ok: false, motivo: `--desde invalido: se espera YYYY-MM-DD y llego "${desde}"` };
  }
  if (!esFechaCalendario(hasta)) {
    return { ok: false, motivo: `--hasta invalido: se espera YYYY-MM-DD y llego "${hasta}"` };
  }
  if (desde > hasta) {
    return { ok: false, motivo: `rango invertido: --desde ${desde} es posterior a --hasta ${hasta}` };
  }

  const hoy = fechaCalendario(ahora, zona);
  // `ultimosNDias(2, ahora, zona).desde` es AYER: dos dias calendario contando hoy.
  const ayer = ultimosNDias(2, ahora, zona).desde;
  if (hasta >= hoy) {
    // La ofensora es la PRIMERA fecha del rango que ya no es recomputable.
    const ofensora = desde >= hoy ? desde : hoy;
    const que = ofensora > hoy ? "es futura" : "es el dia en curso";
    return {
      ok: false,
      motivo:
        `el rango incluye ${ofensora}, que ${que}: el backfill solo recomputa dias CERRADOS ` +
        `(el ultimo admitido es ayer, ${ayer}). El dia en curso lo agrega el ` +
        `job diario de la 124; recomputarlo desde aqui seria pisarse con el.`,
    };
  }

  const fechas: string[] = [];
  for (let f = desde; f <= hasta; f = fechaSiguiente(f)) fechas.push(f);

  return {
    ok: true,
    plan: { desde, hasta, fechas, noComparables: fechas.filter(esNoComparable) },
  };
}
