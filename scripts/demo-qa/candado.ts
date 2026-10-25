import type { PrismaClient } from "@prisma/client";

// SL-43 (design §10.2; R32) — el candado entre ejecuciones de la demo.
//
// Dos despliegues de `dev` seguidos pueden compilar a la vez. Sin candado, los dos borrarían y
// crearían a la vez y chocarían por los slugs (o dejarían cuatro empresas a medias). Con él, el
// segundo espera y recrea la demo después del primero: el resultado es el mismo, dos empresas demo.
//
// Es un advisory lock de SESIÓN sobre la conexión única del dueño (`DIRECT_URL`, modo sesión): dura
// lo que dura la conexión, así que si el proceso muere, cae con ella. Por eso el cliente dueño se
// abre con `max: 1` y sin cierre de conexiones ociosas: si el pool cerrara la conexión a mitad de la
// receta, el candado se soltaría en silencio.

/** La clave del candado. `hashtext` la convierte en el entero que pide `pg_try_advisory_lock`. */
export const CLAVE_CANDADO = "servi_logistic:demo-qa";

/** Cada cuánto se reintenta si otra ejecución tiene el candado. */
export const INTERVALO_REINTENTO_MS = 5_000;

/** Cada cuántos reintentos se repite la línea de espera: una por minuto, no una cada 5 s. */
const REINTENTOS_POR_AVISO = 12;

/** La conexión única del dueño. Solo hace falta lanzar SQL. */
export type ClienteCandado = Pick<PrismaClient, "$queryRaw">;

export interface OpcionesCandado {
  /** Espera entre intentos. Inyectable para que un test no espere 5 s de verdad. */
  esperar: (ms: number) => Promise<void>;
  /** Escribe la línea «espera a otra ejecución». */
  avisar: (linea: string) => void;
  /** El tope de la demo venció: deja de reintentar. */
  cancelado: () => boolean;
  intervaloMs?: number;
}

/** Lo que el entrypoint usa del candado. Inyectable: T10 lo sustituye para medir la mutación 12. */
export interface CandadoDemo {
  /** `true` si lo tomó; `false` si se canceló antes de conseguirlo. */
  tomar(cliente: ClienteCandado, opciones: OpcionesCandado): Promise<boolean>;
  soltar(cliente: ClienteCandado): Promise<void>;
}

async function intentar(cliente: ClienteCandado): Promise<boolean> {
  const [fila] = await cliente.$queryRaw<{ tomado: boolean }[]>`
    SELECT pg_try_advisory_lock(hashtext(${CLAVE_CANDADO})) AS "tomado"`;
  return fila?.tomado === true;
}

/**
 * Toma el candado o reintenta cada `intervaloMs` hasta conseguirlo o hasta que el tope lo cancele.
 * No tiene tope propio: el de la demo (15 min) envuelve esta espera, y un candado que nunca se
 * suelta acaba como un build rojo con mensaje (R33).
 */
export async function tomarCandado(cliente: ClienteCandado, opciones: OpcionesCandado): Promise<boolean> {
  const intervalo = opciones.intervaloMs ?? INTERVALO_REINTENTO_MS;
  for (let intento = 0; ; intento++) {
    if (opciones.cancelado()) return false;
    if (await intentar(cliente)) return true;
    if (intento % REINTENTOS_POR_AVISO === 0) {
      opciones.avisar(
        `[demo-qa] otra ejecución de la demo tiene el candado de esta base: espera a otra ejecución ` +
          `(reintento cada ${Math.round(intervalo / 1000)} s)`,
      );
    }
    await opciones.esperar(intervalo);
  }
}

/** Suelta el candado. Si la conexión ya cayó, el servidor ya lo soltó: el error no se propaga. */
export async function soltarCandado(cliente: ClienteCandado): Promise<void> {
  try {
    await cliente.$queryRaw`SELECT pg_advisory_unlock(hashtext(${CLAVE_CANDADO})) AS "soltado"`;
  } catch {
    // Sin conexión no hay sesión, y sin sesión no hay candado que soltar.
  }
}

export const CANDADO_DE_POSTGRES: CandadoDemo = { tomar: tomarCandado, soltar: soltarCandado };
