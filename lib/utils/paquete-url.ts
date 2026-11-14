// URL pública del "paquete" (detalle de una orden) a la que apunta el QR de la
// etiqueta. El QR codifica una URL absoluta `<origin>/paquete/<numGuia>` para que
// una cámara externa (no el escáner in-app) la abra en el navegador; la ruta valida
// sesión (middleware) y muestra los detalles. La etiqueta lleva ADEMÁS un CODE128
// con el mismo `num_guia` en dígitos. `leerGuia` es la ÚNICA lectura de guía de la
// app (SLT-157): entiende los dos códigos, venga el texto de la cámara o de una
// pistola que teclea. CORTE LIMPIO: el QR ya NO codifica `orden.id` (UUID) y NO se
// acepta un UUID escaneado; las etiquetas impresas con el formato anterior dejan de
// escanear y se reimprimen.

/** Segmento base de la ruta de detalle del paquete. */
export const PAQUETE_BASE_PATH = "/paquete";

/** Un `num_guia` válido en la URL: entero positivo en base 10, sin signo ni relleno. */
const NUM_GUIA_PATTERN = /^\d+$/;

/**
 * Origin base de la app. Se toma de `NEXT_PUBLIC_APP_URL` (inlineada por Next tanto
 * en server como en cliente); si no está configurada, cae a `window.location.origin`
 * (client-side) y, en último caso, a cadena vacía (ruta relativa). Se normaliza sin
 * barra final para no duplicarla al concatenar el path.
 */
function resolveAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/**
 * Construye la URL absoluta del paquete a partir del `num_guia` de la orden.
 * `origin` por defecto se resuelve del env `NEXT_PUBLIC_APP_URL` (ver
 * `resolveAppOrigin`); se puede inyectar en tests o en contextos donde se quiera
 * forzar un origin distinto.
 */
export function buildPaqueteUrl(numGuia: number, origin?: string): string {
  const base = origin ?? resolveAppOrigin();
  return `${base}${PAQUETE_BASE_PATH}/${numGuia}`;
}

/** Parsea un segmento a `num_guia`: entero positivo estricto o `null`. */
function parseNumGuia(segment: string): number | null {
  if (!NUM_GUIA_PATTERN.test(segment)) return null; // "123abc" / "" / "-1" / "1.5"
  const n = Number(segment);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Lo que una pistola o una persona deja en los EXTREMOS de una lectura: espacios,
 * tabuladores, saltos de línea y caracteres de control (p. ej. `\u001d`, el separador
 * GS que añaden algunas pistolas). Nunca se toca el medio: `10 24` no es una guía.
 */
const RELLENO_EXTREMOS = /^[\s\p{Cc}]+|[\s\p{Cc}]+$/gu;

/** Ruta del QR de la etiqueta: exactamente `/paquete/<segmento>`, con o sin barra final. */
const RUTA_PAQUETE = new RegExp(`^${PAQUETE_BASE_PATH}/([^/]+)/?$`);

/** `num_guia` de la URL del QR, con cualquier origen (Preview y producción difieren). */
function guiaDeUrl(texto: string): number | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null; // Ni dígitos ni URL: no es una guía.
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const coincidencia = RUTA_PAQUETE.exec(url.pathname);
  if (coincidencia === null) return null; // `/ordenes/1024` no es el QR de la etiqueta.
  return parseNumGuia(coincidencia[1]);
}

/**
 * Lee el `num_guia` de cualquier texto capturado, por cámara o por teclado (pistola):
 * - el CODE128 de la etiqueta: solo dígitos (`"1024"`), admite UN `#` delante (`"#1024"`);
 * - el QR de la etiqueta: la URL `<origin>/paquete/<numGuia>` (con o sin barra final).
 * Ignora el relleno de los extremos (`RELLENO_EXTREMOS`). Devuelve `null` si el texto
 * no es una guía (vacío, letras, espacios en medio, `0`, negativos, decimales, fuera
 * de entero seguro, `##1024`, otra ruta, UUID de etiquetas viejas).
 */
export function leerGuia(texto: string): number | null {
  const limpio = texto.replace(RELLENO_EXTREMOS, "");
  if (limpio === "") return null;
  if (limpio.startsWith("#")) return parseNumGuia(limpio.slice(1));
  if (NUM_GUIA_PATTERN.test(limpio)) return parseNumGuia(limpio);
  return guiaDeUrl(limpio);
}
