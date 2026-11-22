// Formato por unidad (R20, R21) y total por columna (R23). Modulo PURO: se
// invoca y se prueba sin renderizar ningun componente, que es donde vive la
// logica que de verdad puede equivocarse (design.md §6.2).
//
// Ni un simbolo de moneda ni un codigo ISO escritos aqui (R13): la moneda sale
// de `lib/config/moneda.ts`. Ni un literal de idioma (R20): el locale sale del
// mismo modulo de configuracion y las unidades de tiempo las nombra `Intl`.
//
// SLT-242 (design §3; R5, R6) — el dinero se pinta con la moneda QUE SE LE PASA
// (la del pais de la empresa, `useMonedaDelPais()` en pantalla), no con la de la
// plataforma. Conteos, porcentajes y duraciones siguen con `monedaConfig.locale`.

import type { MetricaUnidad } from "@/lib/analytics/types";
import { formatearMontoEn, monedaConfig, SIN_MONTO, type FormatoMoneda } from "@/lib/config/moneda";

/** Las unidades que nunca son dinero: con ellas no hace falta moneda. */
type UnidadSinMoneda = Exclude<MetricaUnidad, "moneda">;

const SEGUNDOS_POR_MINUTO = 60;
const SEGUNDOS_POR_HORA = 3600;

function numero(valor: number, opciones: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(monedaConfig.locale, opciones).format(valor);
}

/**
 * Un `porcentaje` llega como FRACCION (0,842 = 84,2 %), no en puntos.
 *
 * Es coherente con como lo define el catalogo de la 135 —una razon
 * numerador/denominador (`lib/analytics/types.ts`, `DefinicionMetrica.razon`)—
 * y con `Intl`, que multiplica por 100 en `style: "percent"`. El tablero (131)
 * pasa la razon cruda; no la pre-multiplica.
 */
function formatearPorcentaje(valor: number): string {
  return numero(valor, { style: "percent", maximumFractionDigits: 1 });
}

/**
 * Duracion legible sin literal de idioma: `Intl` con `style: "unit"` nombra la
 * unidad en el locale configurado. Se elige la unidad por magnitud para que
 * "5400 s" no se lea como ruido cuando son hora y media.
 */
function formatearSegundos(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto < SEGUNDOS_POR_MINUTO) {
    return numero(valor, { style: "unit", unit: "second", unitDisplay: "short", maximumFractionDigits: 0 });
  }
  if (absoluto < SEGUNDOS_POR_HORA) {
    return numero(valor / SEGUNDOS_POR_MINUTO, {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    });
  }
  return numero(valor / SEGUNDOS_POR_HORA, {
    style: "unit",
    unit: "hour",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });
}

/**
 * Formatea un valor segun la unidad declarada por la metrica (R20).
 *
 * `null` es DATO AUSENTE y se marca con `SIN_MONTO` (`lib/config/moneda.ts`),
 * nunca con `0` (R11, R14): un cero es una afirmacion sobre el dato y aqui no
 * hay dato que afirmar.
 *
 * Dos firmas y no un tercer parametro opcional (SLT-242 R6): con un default, un
 * llamador que olvide la moneda pintaria en silencio con la de la plataforma, y
 * con Costa Rica nadie lo veria. Asi el typecheck rechaza
 * `formatearValor(x, unidad)` cuando `unidad` puede ser `moneda`.
 */
/** Conteo, porcentaje o duracion: no hay dinero, no hace falta moneda. */
export function formatearValor(valor: number | null, unidad: UnidadSinMoneda): string;
/** Una unidad que puede ser `moneda` (la de una metrica, una columna, una prop): la moneda es obligatoria. */
export function formatearValor(valor: number | null, unidad: MetricaUnidad, moneda: FormatoMoneda): string;
export function formatearValor(valor: number | null, unidad: MetricaUnidad, moneda?: FormatoMoneda): string {
  if (valor === null || !Number.isFinite(valor)) return SIN_MONTO;
  switch (unidad) {
    case "moneda":
      // Solo llega aqui sin moneda desde codigo sin tipos: es un fallo de
      // programacion, no una caida, y se dice en voz alta.
      if (moneda === undefined) {
        throw new Error(`formatearValor: la unidad "${unidad}" necesita una moneda y no se paso ninguna`);
      }
      return formatearMontoEn(moneda, valor);
    case "porcentaje":
      return formatearPorcentaje(valor);
    case "segundos":
      return formatearSegundos(valor);
    case "conteo":
      return numero(valor, { maximumFractionDigits: 0 });
  }
}

/**
 * Total de una columna (R23), calculado en una funcion pura y NUNCA sumando
 * dentro del JSX.
 *
 * Los ausentes se ignoran en vez de contar como cero; si TODOS lo son, el total
 * tambien es ausente: sumar nada da `null`, no `0`.
 */
export function totalizar(valores: readonly (number | null)[]): number | null {
  const presentes = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (presentes.length === 0) return null;
  return presentes.reduce((acumulado, actual) => acumulado + actual, 0);
}
