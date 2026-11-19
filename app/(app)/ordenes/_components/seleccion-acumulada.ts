/**
 * SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» — las piezas
 * PURAS de la selección acumulada, compartidas por las dos tablas de órdenes con casilla
 * (`OrdenesModule` en `/ordenes` y `SateliteOrdenesListado` en la bodega satélite). D2: un mismo
 * flujo, un mismo modelo (`Map id -> fila`) y un mismo texto en el contador.
 */

/**
 * R1509 — sustituye en la selección las filas que el servidor acaba de devolver, para que una
 * marcada que deja de verse conserve su ÚLTIMO estado conocido y no el del momento de marcarla.
 *
 * Devuelve el MISMO `Map` si ninguna marcada viene en `filas` o si ya es la misma fila: quien lo
 * usa ajusta estado durante el render y un `Map` nuevo equivalente sería un render de más.
 */
export function refrescarSeleccion<T extends { id: string }>(
  seleccion: ReadonlyMap<string, T>,
  filas: readonly T[],
): ReadonlyMap<string, T> {
  let next: Map<string, T> | null = null;
  for (const fila of filas) {
    const guardada = seleccion.get(fila.id);
    if (guardada === undefined || guardada === fila) continue;
    next ??= new Map(seleccion);
    next.set(fila.id, fila);
  }
  return next ?? seleccion;
}

/**
 * Las filas marcadas, de TODAS las búsquedas y páginas: las visibles se toman de `filas` (dato
 * recién leído) y a ellas se suman las de fuera, tal como se guardaron.
 */
export function filasSeleccionadas<T extends { id: string }>(
  seleccion: ReadonlyMap<string, T>,
  filas: readonly T[],
): T[] {
  const visibles = new Set(filas.map((fila) => fila.id));
  return [
    ...filas.filter((fila) => seleccion.has(fila.id)),
    ...[...seleccion.values()].filter((fila) => !visibles.has(fila.id)),
  ];
}

/** R1506 — cuántas marcadas no están en el resultado visible. */
export function contarFueraDeVista<T extends { id: string }>(
  seleccion: ReadonlyMap<string, T>,
  filas: readonly T[],
): number {
  const visibles = new Set(filas.map((fila) => fila.id));
  let fuera = 0;
  for (const id of seleccion.keys()) if (!visibles.has(id)) fuera += 1;
  return fuera;
}

/** R1506 / D8 — «N seleccionadas · M fuera de esta búsqueda» (sin la coletilla si M es 0). */
export function textoContadorSeleccion(total: number, fueraDeVista: number): string {
  const base = `${total} seleccionada${total === 1 ? "" : "s"}`;
  return fueraDeVista > 0 ? `${base} · ${fueraDeVista} fuera de esta búsqueda` : base;
}
