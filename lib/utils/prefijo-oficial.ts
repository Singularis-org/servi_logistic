// SLT-81 (design §4.2, §5; R26; decisión del 2026-11-07) — el prefijo telefónico oficial de un país
// según libphonenumber-js (ya aprobada). Módulo PURO.
//
// Variante `min`: el prefijo de país está en todos los metadatos y aquí no se valida ningún número,
// así que no hace falta cargar los de `max` (que usa `lib/validacion/telefono.ts`).
import { getCountryCallingCode, isSupportedCountry } from "libphonenumber-js/min";

/**
 * El prefijo internacional oficial de `paisId` (ISO alfa-2), en dígitos y sin `+`, o `null` si
 * libphonenumber no conoce el país (los de prueba `XA`–`XZ`, o `AQ`, `BV`, `HM`…): por decisión del
 * 2026-11-07 un país así no tiene prefijo aceptable y no se puede dar de alta ni editar (R26).
 */
export function prefijoOficial(paisId: string): string | null {
  if (!isSupportedCountry(paisId)) return null;
  return getCountryCallingCode(paisId);
}
