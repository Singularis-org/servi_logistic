// SLT-74 — el aviso que ve el mensajero cuando pulsa «Sincronizar ruta» con la primera ruta del
// dia pendiente y poco recogido (SLT-59 R64). Puro: no lee reloj, config ni base; la accion le
// pasa los numeros ya resueltos.

/**
 * Menor numero de paquetes recogidos que pasa la guarda del service
 * (`recogidas * 100 < asignadas * pct` corta), o sea ceil(asignadas * pct / 100). En aritmetica
 * entera para no arrastrar error de coma flotante (7 * 80 / 100 = 5,6 -> 6).
 */
export function minimoRecogida(asignadas: number, pct: number): number {
  return Math.floor((asignadas * pct + 99) / 100);
}

/**
 * Tiempo de espera legible: `X min Y s`, o solo `Y s` por debajo del minuto. Los segundos se
 * redondean hacia ARRIBA (decir «0 s» cuando aun falta algo seria mentir). 60 s es `1 min 0 s`:
 * el formato es siempre el mismo a partir del minuto. Un valor <= 0 da `0 s`.
 */
export function formatearEspera(ms: number): string {
  const totalS = Math.max(0, Math.ceil(ms / 1000));
  if (totalS < 60) return `${totalS} s`;
  return `${Math.floor(totalS / 60)} min ${totalS % 60} s`;
}

export interface DatosAvisoRecogida {
  asignadas: number;
  recogidas: number;
  /** `RUTA_PRIMERA_MIN_RECOGIDO_PCT` de la config. */
  pct: number;
  /**
   * Lo que falta para que corra el job pendiente de la primera ruta del dia (puede ser <= 0 si
   * ya vencio y espera al cron). `undefined` = no hay job pendiente: solo se pide recoger.
   */
  esperaMs?: number;
}

/** El `motivo` del `conflict`. Tres formas: sin job pendiente, con espera, o con el job ya vencido. */
export function avisoRecogidaInsuficiente(d: DatosAvisoRecogida): string {
  const base =
    `Todavía no se calcula la ruta: recoge al menos ${minimoRecogida(d.asignadas, d.pct)} ` +
    `de tus ${d.asignadas} paquetes (llevas ${d.recogidas})`;
  if (d.esperaMs === undefined) return `${base}.`;
  if (d.esperaMs <= 0) return `${base} o espera unos segundos: ya se está calculando con los que llevas.`;
  return `${base} o espera ${formatearEspera(d.esperaMs)} y se calculará con los que llevas.`;
}
