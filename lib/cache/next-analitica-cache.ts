// Feature 128 (T2.1, D1) — EL UNICO ARCHIVO DEL ARBOL DE ANALITICA QUE IMPORTA `next/cache`.
//
// R21 lo hace cumplir con `tests/unit/analytics/cache-aislamiento.guardia.test.ts`, que
// SOBREVIVE al merge. No es higiene: `unstable_cache` lanza `Invariant: incrementalCache
// missing` fuera de un request de Next (`unstable-cache.js:59-67`) y `revalidateTag` lanza
// `Invariant: static generation store missing` (`revalidate.js:104-107`), asi que un import
// mal colocado tumbaria la suite unitaria del servicio —que hoy corre sin runtime de Next y
// sin `DATABASE_URL`— y el script CLI del backfill.
//
// D1 (humano, 2026-08-03) = (a) — `unstable_cache({ tags })` + `revalidateTag`, y
// **`next.config.ts` NO se toca**. `cacheTag()` lanza «`cacheTag()` is only available with the
// `cacheComponents` config» (`node_modules/next/dist/server/use-cache/cache-tag.js:15`) y
// activar `cacheComponents` es una bandera GLOBAL que cambia el modelo de renderizado de toda
// la aplicacion; ningun gate de este repo corre `next build`, asi que esa regresion no la
// veria nadie hasta produccion.
//
// ⚠ LIMITE DECLARADO, SIN MAQUILLAJE (`design.md §11`): este archivo **no es testeable en
// unitario**. Es la pulgada no cubierta de la feature, y por eso se disena para que sea lo mas
// fina posible: dos delegaciones, sin ramas y sin logica. Todo lo demas —clave, codec,
// decorador, handlers, script— corre sin Next. (SL-17 le anade la resolucion de la empresa;
// esa parte se prueba en `tests/unit/cache/cache-por-empresa.test.ts` con `next/cache` simulado.)

import { revalidateTag, unstable_cache } from "next/cache";
import { ANALITICA_CACHE_TTL_SEGUNDOS, analiticaCacheHabilitada } from "@/lib/config/analitica-cache";
import { CONTEO_ENTREGAS_CACHE_TTL_SEGUNDOS } from "@/lib/config/conteo-entregas-cache";
import { cacheNula } from "@/lib/cache/cache-nula";
import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { conEmpresa, contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { conRegistroDeInvalidacion } from "@/lib/cache/registro-invalidacion";
import type { IAnaliticaCache, OrigenInvalidacion } from "@/lib/interfaces/external/IAnaliticaCache";

/**
 * DATO DE INVENTARIO QUE `design.md §3` NO RECOGIA (verificado en el arbol de `C:/w128`, no
 * heredado): en Next 16.2.10 `revalidateTag` tiene DOS parametros obligatorios,
 * `revalidateTag(tag: string, profile: string | { expire?: number })`
 * (`node_modules/next/dist/server/web/spec-extension/revalidate.d.ts:9`). La llamada de un
 * solo argumento ni siquiera compila, y en ejecucion emite «"revalidateTag" without the second
 * argument is now deprecated, add second argument of "max" or use "updateTag"»
 * (`revalidate.js:41-44`).
 *
 * Se usa `"max"`, que es exactamente lo que ese mensaje indica como sustituto del
 * comportamiento de un solo argumento. `updateTag` NO sirve aqui: lanza fuera de una Server
 * Action y esta invalidacion la disparan handlers de job desde un route handler de cron
 * (`revalidate.js:49-57`).
 */
const PERFIL_INVALIDACION = "max";

/**
 * SL-17 (design §7.6, R34) — la empresa de la entrada, resuelta FUERA de `unstable_cache`:
 * dentro de su callback no se puede llamar a `cookies()`. Un contexto de plataforma no es una
 * empresa: devolver `null` ahi hace que una entrada de negocio nunca se comparta entre
 * empresas ni se escriba sin dueno.
 */
async function empresaDeLaEntrada(): Promise<string | null> {
  const contexto = contextoActual();
  if (contexto?.tipo === "empresa") return contexto.organizacionId;
  if (contexto === undefined) return empresaDeLaPeticion();
  return null;
}

/** La etiqueta lleva la empresa: invalidar en una empresa no vacia la cache de las demas. */
function etiquetaDeEmpresa(organizacionId: string, tag: string): string {
  return `org:${organizacionId}:${tag}`;
}

export class NextAnaliticaCache implements IAnaliticaCache {
  /**
   * El TTL entra por CONSTRUCTOR, con el de la analitica por defecto.
   *
   * Se parametrizo (2026-08-17) al aparecer un segundo consumidor del MISMO puerto con otro
   * TTL: el conteo de entregas, que pide 15 min porque lee tablas VIVAS y no tiene
   * invalidador por evento (`lib/config/conteo-entregas-cache.ts`). La alternativa era un
   * segundo archivo adaptador, y eso obliga a tocar la allowlist de
   * `cache-aislamiento.guardia.test.ts` (R21) para meter un tercer import de `next/cache` en
   * el arbol — un parametro es mas barato y deja intacta la garantia que ese guardia compra.
   */
  constructor(private readonly ttlSegundos: number = ANALITICA_CACHE_TTL_SEGUNDOS) {}

  /**
   * `revalidate` va SIEMPRE con un TTL y NUNCA `false` (R17): sin TTL, un invalidador que no
   * llegue congela la cifra para siempre.
   *
   * SL-17 (R34): sin empresa se LANZA en vez de producir sin cache. Producir fuera de una
   * empresa leeria sin filtro o fallaria mas abajo con otro nombre; y una entrada sin empresa
   * en la clave la serviria a cualquiera que hiciera la misma consulta. `producir` corre en
   * `conEmpresa` porque `unstable_cache` la ejecuta fuera del contexto del llamador.
   */
  async envolver<T>(
    clave: string,
    tags: readonly string[],
    producir: () => Promise<T>,
  ): Promise<T> {
    const organizacionId = await empresaDeLaEntrada();
    if (!organizacionId) throw new EmpresaNoResuelta("cache_analitica", "envolver");
    return unstable_cache(() => conEmpresa(organizacionId, producir), [`org:${organizacionId}`, clave], {
      tags: tags.map((tag) => etiquetaDeEmpresa(organizacionId, tag)),
      revalidate: this.ttlSegundos,
    })();
  }

  /**
   * R11 — sin `try/catch`: lo que lance `revalidateTag` sube al llamador.
   *
   * SL-17 (R42): invalida la etiqueta de la empresa en contexto. Sin empresa LANZA: no hay
   * etiqueta global que vaciar, y un exito sin invalidar nada es el fallo mudo que R11 evita.
   */
  async invalidar(_origen: OrigenInvalidacion, tags: readonly string[]): Promise<void> {
    const organizacionId = await empresaDeLaEntrada();
    if (!organizacionId) throw new EmpresaNoResuelta("cache_analitica", "invalidar");
    for (const tag of tags) revalidateTag(etiquetaDeEmpresa(organizacionId, tag), PERFIL_INVALIDACION);
  }
}

/**
 * El puerto que se cablea en produccion: adaptador de Next + registro (R23), o la cache nula
 * si la bandera de entorno la apago (R16/D5).
 */
export function crearAnaliticaCacheDeNext(
  env: Readonly<Record<string, string | undefined>> = process.env,
): IAnaliticaCache {
  if (!analiticaCacheHabilitada(env)) return cacheNula();
  return conRegistroDeInvalidacion(new NextAnaliticaCache());
}

/**
 * El puerto que consume el CONTEO DE ENTREGAS (2026-08-17). Mismo adaptador, mismo
 * kill-switch y TTL propio de 15 min.
 *
 * El kill-switch se comparte a proposito (`ANALITICA_CACHE_DISABLED`): una segunda variable
 * de entorno para lo mismo obligaria a acordarse de las dos el dia que haya que apagar la
 * analitica en produccion, y ese dia nadie lee comentarios.
 *
 * SIN `conRegistroDeInvalidacion`: ese decorador registra INVALIDACIONES, y esta vertical no
 * tiene ninguna —su unico mecanismo de caducidad es el TTL, porque lee tablas vivas sin job
 * que avise—. Envolverla dejaria un registro que no puede emitir nunca una linea.
 */
export function crearConteoEntregasCacheDeNext(
  env: Readonly<Record<string, string | undefined>> = process.env,
): IAnaliticaCache {
  if (!analiticaCacheHabilitada(env)) return cacheNula();
  return new NextAnaliticaCache(CONTEO_ENTREGAS_CACHE_TTL_SEGUNDOS);
}
