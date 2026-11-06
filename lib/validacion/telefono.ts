// SLT-42 (R14, R15, R16) — validez de un telefono de persona usuaria con las reglas de numeracion
// del pais de la empresa. Es el UNICO modulo que importa libphonenumber-js (design §7): la decision
// de llevarla al cliente es de SLT-81.
//
// Variante `max`: valida por tipo de linea y rangos asignados, no solo por largo (`min`). En el
// servidor el tamaño de los metadatos no importa.
import {
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";

export type ResultadoTelefono =
  | { ok: true; nacional: string }
  | { ok: false; motivo: "invalido" | "pais_sin_reglas" };

/**
 * Valida `raw` para la region `paisId` (ISO alfa-2, la clave de `pais`). Si es valido devuelve el
 * numero nacional en digitos, sin prefijo internacional ni separadores, que es lo que se guarda
 * (R15). Un pais sin metadatos en la libreria (p. ej. los de prueba) da `pais_sin_reglas` (R16).
 *
 * Se exige ademas que el numero sea DE ese pais: con un `+` explicito la libreria acepta numeros
 * validos de otra region, y uno de otro pais no debe guardarse como nacional de este.
 */
export function validarTelefonoDelPais(raw: string, paisId: string): ResultadoTelefono {
  if (!isSupportedCountry(paisId)) return { ok: false, motivo: "pais_sin_reglas" };
  const region = paisId as CountryCode;
  const numero = parsePhoneNumberFromString(raw, region);
  if (!numero || !numero.isValid() || numero.country !== region) {
    return { ok: false, motivo: "invalido" };
  }
  return { ok: true, nacional: numero.nationalNumber };
}
