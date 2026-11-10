// SLT-81 (design §5; R8; decisión del 2026-11-07) — las zonas horarias IANA que acepta la
// plataforma. Módulo PURO: sin DB ni `process.env`.
//
// La lista es la del runtime (`Intl.supportedValuesOf`), no una fija versionada: así lo que ofrece el
// selector (calculado en el servidor y pasado por props) y lo que acepta `PaisService` salen del
// mismo tzdata, el que usa `calendario-zona.ts`. Que Postgres también la conozca lo comprueba aparte
// el repositorio (`zonaConocidaPorLaBase`): los dos tzdata pueden no coincidir.

let memo: readonly string[] | null = null;
let conjunto: ReadonlySet<string> | null = null;

/** Las zonas IANA del runtime, ordenadas. Se calcula una vez por proceso: no cambia sin reiniciar. */
export function zonasIana(): readonly string[] {
  if (memo === null) memo = Object.freeze([...Intl.supportedValuesOf("timeZone")].sort());
  return memo;
}

/** `true` si `zona` está, tal cual, en `zonasIana()`. */
export function esZonaIana(zona: string): boolean {
  if (conjunto === null) conjunto = new Set(zonasIana());
  return conjunto.has(zona);
}
