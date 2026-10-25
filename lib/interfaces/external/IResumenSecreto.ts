// SL-36 (design §3, R18, R19) — el resumen del token de verificacion del webhook.

/**
 * SHA-256 en hex minuscula, SIN sal. Solo vale para secretos aleatorios de alta entropia, como el
 * token de 32 bytes que genera `IFuenteAleatoria` (QC inv. 16): un secreto que teclea una persona se
 * adivinaria por diccionario.
 */
export interface IResumenSecreto {
  resumen(secreto: string): string;
  /** Compara en tiempo constante; un resumen mal formado da `false` sin comparar. */
  coincide(secreto: string, resumen: string): boolean;
}
