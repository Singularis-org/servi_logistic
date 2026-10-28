// SL-43 (medición del build de QA, 2026-10-26) — trabajos a la vez que terminan TODOS antes de
// fallar.
//
// La demo corre A y B a la vez, y dentro de cada una tramos independientes (design D10.4: el build
// de QA va contra una base a ~90 ms por ida y vuelta, y en serie no cabía en el tope). `Promise.all`
// rechaza con el primer fallo y deja a los demás corriendo sin nadie que los espere: el entrypoint
// cerraría las conexiones con consultas en vuelo. Aquí el primer error se lanza cuando ya no queda
// ninguno corriendo.

/**
 * Cuántos trabajos de una misma empresa van a la vez como mucho. A y B comparten el pool de la app
 * (`CONEXIONES_DE_LA_APP` en `demo-qa.ts`), y una transacción que espera conexión más de 2 s cae con
 * P2028 (el `maxWait` por defecto de Prisma, que es el de la app): medido con 90 ms de latencia y
 * 37 escrituras a la vez por empresa.
 */
export const TANDA = 3;

/**
 * `fn` sobre cada elemento, de `TANDA` en `TANDA` (`enParalelo` dentro de cada tanda). Devuelve los
 * resultados en el orden de `elementos`.
 */
export async function enTandas<E, R>(elementos: readonly E[], fn: (e: E) => Promise<R>, tanda = TANDA): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < elementos.length; i += tanda) {
    resultados.push(...(await enParalelo(elementos.slice(i, i + tanda).map(fn))));
  }
  return resultados;
}

/** Como `Promise.all`, pero espera a que todos terminen y entonces lanza el primer error, si lo hay. */
export async function enParalelo<T extends unknown[]>(trabajos: [...{ [K in keyof T]: Promise<T[K]> }]): Promise<T> {
  const resultados = await Promise.allSettled(trabajos);
  const fallo = resultados.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (fallo) throw fallo.reason;
  return resultados.map((r) => (r as PromiseFulfilledResult<unknown>).value) as T;
}
