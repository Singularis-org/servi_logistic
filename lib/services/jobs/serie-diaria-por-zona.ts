// SLT-42 (design §6.1; R25, R26, R28) — una serie de job diario por tipo, con una corrida por zona.
// Modulo PURO: sin Prisma, sin reloj propio y sin zona fija. Lo comparten `liberar_reprogramadas` y
// `analitica_rollup_diario` (handler, recurrencia y siembra).
//
// - La proxima corrida es la de la zona que antes llega a la hora objetivo (R25).
// - La clave lleva la zona: `<prefijo>:<zona>:<fecha local>`. El handler la lee y solo procesa las
//   empresas cuya zona llega a la hora objetivo en ese mismo instante (R25).
// - Una clave vieja, sin zona (`<prefijo>:<fecha>`), es la de antes del despliegue: corre para todas
//   las empresas, cada una con su zona (R26).
import { fechaCalendario, instanteDeParedEnUtc, proximaHoraLocal } from "@/lib/utils/calendario-zona";

/**
 * Zona de la corrida cuando ningun pais con empresas tiene zona. La serie no puede morir (nadie la
 * re-sembraria hasta el proximo despliegue), asi que se agenda en UTC: esa corrida no procesa
 * ninguna empresa con zona y una empresa sin zona falla sola (R28).
 */
export const ZONA_SIN_EMPRESAS = "UTC";

/** Hora de pared objetivo de una serie diaria. */
export interface HoraObjetivo {
  hora: number;
  minuto: number;
}

/**
 * R25: la proxima corrida ESTRICTAMENTE posterior a `now`, la de la zona que antes llega a la hora
 * objetivo. Empate (dos zonas con el mismo desfase): la primera por orden alfabetico, y el handler
 * procesa las dos (`zonaLlegaALaHora`). Sin zonas: `ZONA_SIN_EMPRESAS`.
 */
export function proximaCorridaPorZona(
  now: Date,
  zonas: readonly string[],
  objetivo: HoraObjetivo,
): { runAfter: Date; zona: string } {
  const candidatas = zonas.length > 0 ? [...zonas].sort() : [ZONA_SIN_EMPRESAS];
  let mejor: { runAfter: Date; zona: string } | null = null;
  for (const zona of candidatas) {
    const runAfter = proximaHoraLocal(now, zona, objetivo.hora, objetivo.minuto);
    if (mejor === null || runAfter.getTime() < mejor.runAfter.getTime()) mejor = { runAfter, zona };
  }
  // `candidatas` nunca esta vacia.
  return mejor as { runAfter: Date; zona: string };
}

/** `<prefijo>:<zona>:<fecha>`. */
export function claveConZona(prefijo: string, zona: string, fecha: string): string {
  return `${prefijo}:${zona}:${fecha}`;
}

/**
 * La zona y la fecha de una clave con zona. `null` si la clave es la vieja, sin zona, o no es de
 * este prefijo: el handler la trata como «todas las empresas, cada una con su zona» (R26).
 */
export function leerClaveConZona(
  dedupeKey: string | null,
  prefijo: string,
): { zona: string; fecha: string } | null {
  if (typeof dedupeKey !== "string" || !dedupeKey.startsWith(`${prefijo}:`)) return null;
  const resto = dedupeKey.slice(prefijo.length + 1).split(":");
  if (resto.length !== 2) return null;
  const [zona, fecha] = resto;
  if (zona === "" || fecha === "") return null;
  return { zona, fecha };
}

/** Instante de la corrida del dia `fecha` (local de `zona`) a la hora objetivo. */
export function instanteDeLaCorrida(fecha: string, zona: string, objetivo: HoraObjetivo): Date {
  return instanteDeParedEnUtc(fecha, objetivo.hora, objetivo.minuto, zona);
}

/**
 * `true` si la pared de `zona` marca la hora objetivo en `instante`. Es la regla del handler: una
 * empresa entra en la corrida si su zona llega a la hora objetivo en el mismo instante que la zona
 * de la corrida (la misma zona, o una con el mismo desfase ese dia).
 */
export function zonaLlegaALaHora(zona: string, instante: Date, objetivo: HoraObjetivo): boolean {
  const fecha = fechaCalendario(instante, zona);
  return instanteDeLaCorrida(fecha, zona, objetivo).getTime() === instante.getTime();
}
