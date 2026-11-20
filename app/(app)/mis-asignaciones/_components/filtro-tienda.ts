// SLT-190 «Recoger y Recolección según el canvas» (R850-R851, DS1, DS2) — el filtro «Tienda» de las
// pantallas Recoger en bodega y Recolección. Funciones puras: sin servidor nuevo, las opciones salen
// de las órdenes YA cargadas (el DTO solo trae el NOMBRE de la tienda, así que se compara por él).
//
// Como el término del buscador, el filtro solo cambia lo que se VE: los contadores y lo que acepta
// el escáner siguen mirando la lista completa (277 R16/R20/R22). Eso lo hace el consumidor; aquí
// solo se ofrece y se filtra.

/** Clave del filtro en el selector «Filtros» de `BuscadorFiltros`. */
export const FILTRO_TIENDA = "tienda";

/** Rótulo del filtro: en el selector y delante del valor elegido («Tienda: {nombre}»). */
export const ETIQUETA_FILTRO_TIENDA = "Tienda";

/** Placeholder del control sin tienda elegida. */
export const TIENDA_TODAS = "Todas";

/** Nombre accesible del control. */
export const ARIA_FILTRO_TIENDA = "Filtrar por tienda";

/** Lo mínimo que el filtro lee de una orden. */
export interface OrdenConTienda {
  tiendaNombre: string;
}

/**
 * R850 / DS1 — las tiendas de las órdenes cargadas, sin repetir y en orden alfabético (español,
 * sin distinguir mayúsculas ni acentos para ORDENAR; los nombres se devuelven tal cual). Se toma
 * de todas las listas de la pantalla, no solo de la visible: el filtro es uno para todas.
 */
export function opcionesTienda(
  ...listas: ReadonlyArray<readonly OrdenConTienda[]>
): string[] {
  const nombres = new Set<string>();
  for (const lista of listas) {
    for (const orden of lista) {
      const nombre = orden.tiendaNombre.trim();
      if (nombre !== "") nombres.add(nombre);
    }
  }
  return [...nombres].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

/**
 * R851 — deja solo las órdenes de la tienda elegida. `""` = sin filtro (todas, en el mismo
 * orden). Se compone con `filtrarAsignaciones` (término AND tienda).
 */
export function filtrarPorTienda<T extends OrdenConTienda>(
  ordenes: readonly T[],
  tienda: string,
): T[] {
  if (tienda === "") return [...ordenes];
  return ordenes.filter((orden) => orden.tiendaNombre.trim() === tienda);
}
