/**
 * Feature 486 — evidencias de UNA gestion de cierre, de ruta cruda a URL firmada.
 *
 * Desde la 119 las fotos viven en `gestion_orden_evidencia` (1..N, `indice`), y la columna
 * `gestion_orden.evidencia_storage_path` es solo la PORTADA (indice 0). Los cierres leian solo la
 * columna y por eso mostraban una foto de tres. Estas dos funciones puras son la unica regla de
 * como se pasa del conjunto a la lista que ve el usuario.
 */

/**
 * Rutas de evidencia de UNA gestion, en el orden en que llegan las hijas (la consulta las trae
 * por `indice` asc, R4). Las hijas MANDAN: si hay alguna, la portada se ignora —tras la 119 la
 * portada ES la hija `indice 0`, y mezclarlas duplicaria la foto—. Sin hijas, la portada sola
 * (R5: el escritor conserva una rama que escribe la columna sin hijas). Sin nada, `[]` (R6).
 */
export function rutasEvidenciaGestion(
  hijas: ReadonlyArray<{ storagePath: string }>,
  portada: string | null,
): string[] {
  if (hijas.length > 0) return hijas.map((h) => h.storagePath);
  return portada !== null ? [portada] : [];
}

/**
 * URLs firmadas en el orden de `rutas`, OMITIENDO las que el firmador no devolvio (R9: el
 * provider entrega un resultado parcial). Nunca devuelve una ruta cruda (R7).
 */
export function urlsEvidenciaFirmadas(
  rutas: readonly string[],
  urlByPath: Readonly<Record<string, string>>,
): string[] {
  const urls: string[] = [];
  for (const ruta of rutas) {
    const url = Object.prototype.hasOwnProperty.call(urlByPath, ruta) ? urlByPath[ruta] : undefined;
    if (url) urls.push(url);
  }
  return urls;
}

/** Todas las rutas a firmar de un detalle, para UNA sola llamada a `createSignedUrls` (R8). */
export function rutasAFirmar(
  gestiones: ReadonlyArray<{ evidenciaStoragePaths: readonly string[] }>,
): string[] {
  return gestiones.flatMap((g) => g.evidenciaStoragePaths);
}
