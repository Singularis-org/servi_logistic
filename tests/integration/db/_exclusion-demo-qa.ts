import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { urlDeBaseDeDatos } from "./_postgres-real";

// SL-43 (T10) — exclusión entre los archivos de test que crean o borran empresas demo.
//
// NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.
//
// `borrarEmpresasDemo` borra TODA empresa con `es_demo` de la base, y los dos tests que la usan
// (`demo-qa.test.ts` y `demo-qa-borrado.test.ts`) afirman cuántas hay. En CI cada shard corre sus
// archivos en paralelo contra la MISMA base: sin esto, uno borraría las empresas del otro a mitad.
//
// Además, mientras la demo del test tiene sus filas en la base, caen los tests que recorren la base
// entera (los `down` de enums de `notificacion-evento-*-migration` y `caja-backfill`, medido en T10:
// 14 casos en 8 archivos). Esos toman el turno COMPARTIDO: corren a la vez entre ellos, pero nunca a
// la vez que un archivo de la demo, que lo toma EXCLUSIVO.
//
// Es un advisory lock de SESIÓN, en una conexión propia (`max: 1`, sin cierre por ociosa), con una
// clave distinta de la del candado de la demo (`servi_logistic:demo-qa`): la demo que corre dentro
// del test tiene que poder tomar el suyo.
//
// POR QUÉ NO `tomarLockDeEscrituraReal` (review SL-43, m1). Ese lock lo piden ~200 archivos para
// cada escritura real (`serializarEscriturasReales`, `bajoLockDeEscrituraReal`), con 20 s de
// `testTimeout`/`hookTimeout`. Sostenerlo los ~80 s de `demo-qa.test.ts` los tumba: medido el
// 2026-10-25, con ese lock tomado 80 s, 6 archivos pequeños que lo usan cayeron enteros por timeout
// (9 de 10 casos; sin el lock, 2, por la base sin usuarios). Esta clave solo la piden los 8 archivos
// de abajo, y con 660 s de hook.
//
// LÍMITE CONOCIDO: la lista es a mano. Un test nuevo que recorra la base entera y caiga con filas de
// la demo vivas tiene que pedir aquí el turno compartido; si no, es un rojo intermitente en CI.

const CLAVE = "servi_logistic:demo-qa:tests";
const REINTENTO_MS = 2_000;
const ESPERA_MAXIMA_MS = 10 * 60 * 1000;

export interface ExclusionDemoQa {
  soltar(): Promise<void>;
}

/**
 * Espera su turno y se lo queda hasta `soltar`. Exclusivo (por defecto): los archivos que crean
 * empresas demo. Compartido: los que caen si las ven.
 */
export async function tomarExclusionDemoQa(opciones: { compartida?: boolean } = {}): Promise<ExclusionDemoQa> {
  const compartida = opciones.compartida === true;
  const cliente = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 1, idleTimeoutMillis: 0 }),
  });
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  for (;;) {
    const [fila] = compartida
      ? await cliente.$queryRaw<{ tomado: boolean }[]>`
          SELECT pg_try_advisory_lock_shared(hashtext(${CLAVE})) AS "tomado"`
      : await cliente.$queryRaw<{ tomado: boolean }[]>`
          SELECT pg_try_advisory_lock(hashtext(${CLAVE})) AS "tomado"`;
    if (fila?.tomado === true) break;
    if (Date.now() > limite) {
      await cliente.$disconnect();
      throw new Error("SL-43: el turno de la demo de QA no quedó libre en 10 min");
    }
    await new Promise((resolver) => setTimeout(resolver, REINTENTO_MS));
  }
  return {
    soltar: async () => {
      try {
        if (compartida) await cliente.$queryRaw`SELECT pg_advisory_unlock_shared(hashtext(${CLAVE}))`;
        else await cliente.$queryRaw`SELECT pg_advisory_unlock(hashtext(${CLAVE}))`;
      } finally {
        // Cerrar la sesión también lo suelta: es de sesión.
        await cliente.$disconnect();
      }
    },
  };
}
