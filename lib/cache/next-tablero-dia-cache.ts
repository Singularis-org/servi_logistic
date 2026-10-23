// Feature 192 (B9.3, design.md §5.quater) — EL UNICO ARCHIVO DE ESTA FEATURE QUE IMPORTA
// `next/cache`.
//
// R71 lo hace cumplir `tests/unit/tablero-dia/cache-sin-invalidacion.guardia.test.ts`, que
// censa el arbol y sobrevive al merge. No es higiene: `unstable_cache` lanza `Invariant:
// incrementalCache missing` fuera de un request de Next, asi que un import mal colocado
// tumbaria la suite unitaria del servicio —que corre sin runtime de Next y sin
// `DATABASE_URL`—. Es la leccion ya pagada por la 128.
//
// ⛔ Aqui NO hay `revalidateTag`, `revalidatePath` ni `updateTag`, y no es un olvido: la
// entrada expira UNICAMENTE por tiempo (R71). Si algun dia esto se ve tentado de invalidacion
// por evento, la señal correcta no es añadirla: es que el indice era la respuesta y hay que
// reabrir `design.md §5.ter`.
//
// ⚠ LIMITE DECLARADO: este archivo NO es testeable en unitario. Por eso se diseña para que
// sea lo mas fino posible — una delegacion, sin ramas y sin logica. (SL-17 le anade la
// resolucion de la empresa, que si se prueba en `tests/unit/cache/cache-por-empresa.test.ts`
// con `next/cache` simulado.)

import { unstable_cache } from "next/cache";

import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { TABLERO_DIA_CACHE_TTL_SEGUNDOS } from "@/lib/config/tablero-dia-cache";
import { conEmpresa, contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type { ITableroDiaCache } from "@/lib/interfaces/external/ITableroDiaCache";

/**
 * SL-17 (design §7.6, R34) — la empresa se resuelve FUERA de `unstable_cache`, que no deja
 * llamar a `cookies()` dentro. Un contexto de plataforma no es una empresa: `null`.
 */
async function empresaDeLaEntrada(): Promise<string | null> {
  const contexto = contextoActual();
  if (contexto?.tipo === "empresa") return contexto.organizacionId;
  if (contexto === undefined) return empresaDeLaPeticion();
  return null;
}

export class NextTableroDiaCache implements ITableroDiaCache {
  /**
   * SL-17 (R34): la empresa encabeza la clave porque `claveDeTablero` solo codifica el alcance
   * DENTRO de una empresa; dos empresas con el mismo alcance compartirian la entrada. Sin
   * empresa se lanza en vez de producir sin cache. `producir` corre en `conEmpresa` porque
   * `unstable_cache` la ejecuta fuera del contexto del llamador.
   */
  async envolver<T>(clave: string, producir: () => Promise<T>): Promise<T> {
    const organizacionId = await empresaDeLaEntrada();
    if (!organizacionId) throw new EmpresaNoResuelta("cache_tablero_dia", "envolver");
    return unstable_cache(() => conEmpresa(organizacionId, producir), [`org:${organizacionId}`, clave], {
      revalidate: TABLERO_DIA_CACHE_TTL_SEGUNDOS,
    })();
  }
}

/** El puerto que se cablea en produccion (lo llama la Server Action). */
export function crearTableroDiaCacheDeNext(): ITableroDiaCache {
  return new NextTableroDiaCache();
}
