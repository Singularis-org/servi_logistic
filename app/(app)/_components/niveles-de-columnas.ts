import type { EtiquetasGeograficas } from "@/lib/types/pais";
import { columnasDeNivel, type NivelDelPais, type Ruta } from "@/lib/utils/ubicacion-presentacion";

// SLT-125 (design §5; R1–R5) — LOS NIVELES CON LOS QUE SE ARMAN LAS COLUMNAS DE LUGAR de las tablas y
// descargas de órdenes, satélite y cobertura.
//
// Módulo PURO: sin React ni DOM. Las pantallas pasan los niveles del país de la empresa
// (`useNivelesGeograficos`). Sin ellos (sin proveedor: superadmin sin país, componentes montados
// sueltos en un test) se usan los tres niveles que nombran las `etiquetas`, que es exactamente lo que
// estas columnas pintaban antes de SLT-125: así nada cambia donde los niveles no llegan.
//
// Ningún texto de nivel va escrito aquí (R42): los rótulos salen de `niveles` o de `etiquetas`.

const CLAVES_DE_ETIQUETAS = ["provincia", "canton", "distrito"] as const;

/**
 * Los niveles del país para las columnas de lugar: los que llegan, o, si no llega ninguno, los tres
 * de las `etiquetas`. `String(...)` deja el rótulo como texto tal cual; además permite que la sonda de
 * `columnas-sensibles.guardia` (un objeto que se convierte en texto) recorra la proyección.
 */
export function nivelesDeColumnas(
  etiquetas: EtiquetasGeograficas,
  niveles?: readonly NivelDelPais[],
): readonly NivelDelPais[] {
  if (niveles !== undefined && niveles.length > 0) return niveles;
  return CLAVES_DE_ETIQUETAS.map((clave, i) => ({
    profundidad: i + 1,
    singular: String(etiquetas[clave].singular),
  }));
}

/**
 * Los niveles para proyectar las CELDAS de lugar: los del país, o los tres de hoy si no llegan. Las
 * celdas solo usan la profundidad (la clave), así que aquí no hace falta ningún rótulo.
 */
export function nivelesDeCeldas(niveles?: readonly NivelDelPais[]): readonly NivelDelPais[] {
  if (niveles !== undefined && niveles.length > 0) return niveles;
  return CLAVES_DE_ETIQUETAS.map((_, i) => ({ profundidad: i + 1, singular: "" }));
}

/**
 * Columnas de un archivo con las de lugar EN EL SITIO de las tres de hoy (R1): la lista de columnas
 * de hoy (`provincia`, `canton` y `distrito` contiguas) con esas tres sustituidas por una por nivel,
 * de 1 a P. El encabezado de cada una es el tipo del nivel, o `nivel_<k>` si choca con otra cabecera
 * del mismo archivo o con otro nivel (R2); la clave, la de `claveDeColumnaDeNivel` (R3).
 */
export function conColumnasDeNivel<C extends { clave: string; encabezado: string }>(
  columnasDeHoy: readonly C[],
  niveles: readonly NivelDelPais[],
): (C | { clave: string; encabezado: string })[] {
  const esDeNivel = (c: C) => (CLAVES_DE_ETIQUETAS as readonly string[]).includes(c.clave);
  const otras = columnasDeHoy.filter((c) => !esDeNivel(c));
  const deNivel = columnasDeNivel(
    niveles,
    otras.map((c) => c.encabezado),
  );
  const sitio = columnasDeHoy.findIndex(esDeNivel);
  if (sitio === -1) return [...columnasDeHoy];
  const antes = columnasDeHoy.slice(0, sitio).filter((c) => !esDeNivel(c));
  const despues = columnasDeHoy.slice(sitio).filter((c) => !esDeNivel(c));
  return [...antes, ...deNivel, ...despues];
}

/**
 * La ruta del lugar de una fila, del nivel 1 al lugar: la que trae el DTO (`lugarRuta`, `ruta`) o,
 * si no la trae (DTO de un lector que no la anota, como el detalle de `/monitoreo`), los tres
 * nombres de hoy en su orden. Un nombre ausente queda como paso vacío, y la celda sale vacía.
 *
 * `Array.isArray` y no `??`: la ruta es opcional en los DTO (patrón aditivo) y solo una lista es una
 * ruta.
 */
export function rutaDeLaFila(ruta: unknown, nombresDeHoy: readonly (string | null | undefined)[]): Ruta {
  if (Array.isArray(ruta)) return ruta as Ruta;
  return nombresDeHoy.map((nombre) => ({ id: null, nombre: nombre ?? "" }));
}
