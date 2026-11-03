// SLT-74 — el aviso que ve el mensajero cuando pulsa «Sincronizar ruta» con la primera ruta del
// dia pendiente y poco recogido (SLT-59 R64). Puro: no lee reloj, config ni base; la accion le
// pasa los numeros ya resueltos.
//
// SLT-79 (2026-11-03, decision humana «todo manual»): el boton es el UNICO que calcula la primera
// ruta, y la espera ya no es la de un job sino la de RUTA_PRIMERA_DEBOUNCE_MIN desde la ultima
// recogida. Dos formas de texto, segun haya algo recogido o no.

/**
 * Menor numero de paquetes recogidos que pasa la guarda del service
 * (`recogidas < minimoRecogida(...)` corta), o sea ceil(asignadas * pct / 100). En aritmetica
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
  /** `RUTA_PRIMERA_MIN_RECOGIDO_PCT` de la config. */
  pct: number;
  /**
   * SLT-79: lo que falta para que pasen RUTA_PRIMERA_DEBOUNCE_MIN desde la ultima recogida.
   * `undefined` = no hay nada recogido: solo vale llegar al minimo.
   */
  esperaMs?: number;
}

/**
 * SLT-79 — el `motivo` del `conflict`. Dos formas:
 *  - con algo recogido: `Recoge 12 de 15 paquetes o espera 4 min 20 s para poder iniciar ruta.`
 *  - sin nada recogido: `Recoge 12 de 15 paquetes para poder iniciar ruta.`
 */
export function avisoRecogidaInsuficiente(d: DatosAvisoRecogida): string {
  const recoge = `Recoge ${minimoRecogida(d.asignadas, d.pct)} de ${d.asignadas} paquetes`;
  if (d.esperaMs === undefined) return `${recoge} para poder iniciar ruta.`;
  return `${recoge} o espera ${formatearEspera(d.esperaMs)} para poder iniciar ruta.`;
}
