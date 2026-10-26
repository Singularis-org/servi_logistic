/**
 * SL-36 (design §3, §6; R4, R38) — la configuracion de la boveda de integraciones.
 *
 * Se lee EN CADA LLAMADA y nada aqui lanza al importar (QC inv. 14): la app arranca sin las
 * variables y solo falla quien cifra o descifra; y rotar la clave activa no exige reiniciar.
 *
 * Ningun error lleva el valor de una variable ni la etiqueta de una entrada del anillo (QC inv. 13):
 * se nombra la VARIABLE y, dentro del anillo, la POSICION («entrada 2»). Un trozo de clave en un
 * mensaje acaba en el agregador de logs.
 */

export const VARIABLE_CLAVES_CIFRADO = "INTEGRACIONES_CLAVES_CIFRADO";
export const VARIABLE_CLAVE_ACTIVA = "INTEGRACIONES_CLAVE_ACTIVA";
export const VARIABLE_PRUEBAS_POR_MINUTO = "INTEGRACIONES_PRUEBAS_POR_MINUTO";

/**
 * Design §6: valor propuesto, sin medicion detras. Cinco cubren corregir un token mal pegado dos o
 * tres veces, y ninguna cuota de los cuatro proveedores se acerca a cinco por minuto.
 */
export const PRUEBAS_POR_MINUTO_DEFECTO = 5;

/** Bytes de una clave maestra: AES-256. */
const BYTES_DE_CLAVE = 32;

/** `v<n>`, entero positivo sin ceros a la izquierda (QC §2). */
const FORMA_VERSION = /^v[1-9][0-9]*$/;

/**
 * Base64 ESTANDAR estricta de 32 bytes: 43 caracteres y un `=`. Con regex y no con lo que acepte el
 * runtime, que decodifica basura en silencio (QC inv. 15).
 */
const FORMA_CLAVE_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

/** La configuracion de la boveda falta o esta mal formada (R4). Nunca lleva valores. */
export class ConfiguracionBovedaError extends Error {
  readonly codigo = "configuracion_boveda" as const;
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ConfiguracionBovedaError";
  }
}

export interface AnilloDeClaves {
  /** La version con la que se cifra todo valor nuevo (R38). */
  readonly activa: string;
  /** Version -> clave de 32 bytes. Las viejas siguen aqui para descifrar hasta el recifrado. */
  readonly claves: ReadonlyMap<string, Buffer>;
}

type Entorno = Readonly<Record<string, string | undefined>>;

function leerNoVacia(env: Entorno, nombre: string): string {
  const crudo = env[nombre]?.trim();
  if (crudo === undefined || crudo === "") {
    throw new ConfiguracionBovedaError(`${nombre} no esta definida`);
  }
  return crudo;
}

/**
 * Una entrada `v<n>:<base64>`. Se parte por el PRIMER `:` porque la base64 no lo contiene; asi una
 * entrada con dos `:` cae en la regex de la clave y no se reinterpreta.
 */
function leerEntrada(entrada: string, posicion: number): [string, Buffer] {
  const separador = entrada.indexOf(":");
  const version = separador === -1 ? "" : entrada.slice(0, separador).trim();
  const base64 = separador === -1 ? "" : entrada.slice(separador + 1).trim();
  if (!FORMA_VERSION.test(version) || !FORMA_CLAVE_BASE64.test(base64)) {
    throw new ConfiguracionBovedaError(
      `${VARIABLE_CLAVES_CIFRADO}: la entrada ${posicion} no tiene la forma v<n>:<base64 de ${BYTES_DE_CLAVE} bytes>`,
    );
  }
  const clave = Buffer.from(base64, "base64");
  if (clave.length !== BYTES_DE_CLAVE) {
    throw new ConfiguracionBovedaError(
      `${VARIABLE_CLAVES_CIFRADO}: la entrada ${posicion} no mide ${BYTES_DE_CLAVE} bytes`,
    );
  }
  return [version, clave];
}

/**
 * El anillo de claves maestras: `INTEGRACIONES_CLAVES_CIFRADO = "v1:<base64>,v2:<base64>"` y
 * `INTEGRACIONES_CLAVE_ACTIVA = "v2"`. Lanza `ConfiguracionBovedaError` si falta algo, si una
 * entrada esta mal formada, si una version se repite o si la activa no esta en el anillo.
 */
export function leerAnilloDeClaves(env: Entorno = process.env): AnilloDeClaves {
  const entradas = leerNoVacia(env, VARIABLE_CLAVES_CIFRADO).split(",");
  const claves = new Map<string, Buffer>();
  entradas.forEach((entrada, i) => {
    const [version, clave] = leerEntrada(entrada.trim(), i + 1);
    // Una version repetida haria ambiguo con que clave se descifra: se rechaza, no se elige una.
    if (claves.has(version)) {
      throw new ConfiguracionBovedaError(
        `${VARIABLE_CLAVES_CIFRADO}: la entrada ${i + 1} repite una version anterior`,
      );
    }
    claves.set(version, clave);
  });

  const activa = leerNoVacia(env, VARIABLE_CLAVE_ACTIVA);
  if (!FORMA_VERSION.test(activa)) {
    throw new ConfiguracionBovedaError(`${VARIABLE_CLAVE_ACTIVA} no tiene la forma v<n>`);
  }
  if (!claves.has(activa)) {
    throw new ConfiguracionBovedaError(
      `${VARIABLE_CLAVE_ACTIVA} no corresponde a ninguna entrada de ${VARIABLE_CLAVES_CIFRADO}`,
    );
  }
  return { activa, claves };
}

/**
 * Pruebas por minuto y por empresa (design §6, R16). Ausente, vacio o no entero positivo -> el
 * defecto: un limite mal escrito no debe dejar la pantalla sin poder probar, ni sin limite.
 */
export function pruebasPorMinuto(env: Entorno = process.env): number {
  const crudo = env[VARIABLE_PRUEBAS_POR_MINUTO]?.trim();
  if (crudo === undefined || !/^[1-9][0-9]*$/.test(crudo)) return PRUEBAS_POR_MINUTO_DEFECTO;
  return Number.parseInt(crudo, 10);
}
