// SLT-64 (R17) — LAS ETIQUETAS DE CACHE DE LAS LECTURAS DE ENTREGAS, EN UNA SOLA LISTA.
//
// La consumen el botón «Actualizar» (`lib/actions/analitica-refrescar.ts`) y las dos escrituras que
// mueven la última gestión vigente (`deshacerGestion` y `corregirResultadoGestion`). Una segunda
// lista escrita a mano es como una invalidación deja de coincidir con la lectura, en silencio.
//
// No vive en `entregas-conteo.ts` porque `productos-consulta.ts` ya importa valores de ese archivo:
// traer de vuelta `TAG_CONTEO_PRODUCTOS` crearía un ciclo.

import {
  TAG_CICLO_VIDA,
  TAG_COHORTE_CARGA,
  TAG_CONTEO_CARGADAS_POR_DIA,
  TAG_CONTEO_DEVOLUCIONES,
  TAG_CONTEO_ENTREGAS,
  TAG_CONTEO_HOY_GESTION,
  TAG_CONTEO_POR_STATUS,
} from "@/lib/analytics/entregas-conteo";
import { TAG_CONTEO_PRODUCTOS } from "@/lib/analytics/productos-consulta";

/**
 * Las ocho verticales de entregas, cada una con espacio de caché propio porque no salen del rollup.
 *
 * Si falta una, esa vertical sigue sirviendo lo cacheado hasta 15 minutos mientras el resto del
 * tablero ya se refrescó: dos mitades de la misma pantalla con distinta edad.
 */
export const TAGS_LECTURAS_ENTREGAS: readonly string[] = [
  TAG_CONTEO_ENTREGAS,
  TAG_CONTEO_POR_STATUS,
  TAG_CONTEO_CARGADAS_POR_DIA,
  TAG_CONTEO_HOY_GESTION,
  TAG_CONTEO_DEVOLUCIONES,
  TAG_CICLO_VIDA,
  TAG_CONTEO_PRODUCTOS,
  TAG_COHORTE_CARGA,
];
