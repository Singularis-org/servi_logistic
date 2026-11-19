/**
 * SLT-80 «Guía de integración por API en la ayuda» — dónde vive la guía y sus descargas.
 *
 * R1315: la pantalla de la guía, los enlaces de `/configuracion/api` y `/configuracion/integraciones`
 * y las rutas de descarga sacan sus URLs de AQUÍ, y de ningún otro sitio. Una URL copiada a mano en
 * un componente se desfasaría de la ruta real en el primer cambio.
 *
 * D7: la guía no declara `pantalla:` (la de `/configuracion/api` ya es de
 * `oficina/configuracion-api.md`); se alcanza por estos enlaces, no por el «?».
 */

/** Slug de la guía en el catálogo de Ayuda (`docs/ayuda/<slug>.md`), el que recibe `leerDocumentoAyuda`. */
export const SLUG_GUIA_API = "oficina/guia-integracion-api";

/** La guía en la pantalla de Ayuda. */
export const RUTA_GUIA_API = `/ayuda/${SLUG_GUIA_API}`;

/** El PDF de la guía, generado desde el mismo `.md`. */
export const RUTA_DESCARGA_GUIA_API_PDF = "/ayuda/descargas/guia-integracion-api";

/** La colección de Postman del canal por API key. */
export const RUTA_DESCARGA_POSTMAN = "/ayuda/descargas/postman";
