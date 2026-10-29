import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-49 (2026-10-28) — LA REGLA DE DUEÑO DE LAS ETIQUETAS DE GUIA, EN UN SOLO SITIO.
//
// QUE PROBLEMA RESUELVE. Hasta la SLT-49 la etiqueta era un READ derivado abierto a cualquier
// rol con sesion (feature 32) y solo el rol `apiKey` se filtraba por dueño (feature 136), con un
// `if` escrito a mano dentro de `EtiquetaGuiaService`. La SLT-49 le da a la tienda la impresion
// por lote y cierra el hueco: una tienda leia la etiqueta (destinatario, telefono, direccion,
// monto) de una orden de otra tienda si conocia su id o su guia. La misma pregunta —«hasta donde
// alcanzan las etiquetas de este actor»— la hacen ahora DOS sitios: el service (que pone el
// dueño en el `where`) y la pagina `/ordenes` (que decide si ofrece «Imprimir etiquetas» por lote
// limitado a lo suyo). Dos copias de una regla de frontera divergen; por eso vive aqui (R14).
// Patron: `resolverAlcanceBorradoOrden` (`alcance-borrado-orden.ts`, FICHA 358). NO es esa
// funcion: el borrado es otra pregunta, con otro valor por defecto.
//
// LO QUE ESTE MODULO **NO** ES. No es la frontera. Responder «propias» no impide nada por si
// solo: lo que impide leer lo ajeno es el `tienda_id` dentro del `where` de
// `findEtiquetasByIds`/`findEtiquetaByNumGuia`, medido contra Postgres en
// `tests/integration/db/etiquetas-frontera-tienda.test.ts`.
//
// PURO: sin Prisma, sin `next/`, sin lecturas de entorno, para que lo importen la pagina y el
// service y se pruebe sin dobles.

/**
 * Hasta donde alcanzan las etiquetas de guia de este actor.
 *
 * Union discriminada y no un `string | null`: obliga a cada llamador a decidir que hace con
 * «todas». Un `ownerId` nullable se olvida en silencio y falla ABIERTO.
 */
export type AlcanceEtiquetasOrden =
  /** Etiquetas de cualquier orden de la empresa (la frontera de empresa la pone la RLS). */
  | { alcance: "todas" }
  /** Solo las etiquetas de las ordenes cuya `tienda_id` sea `ownerId`. */
  | { alcance: "propias"; ownerId: string };

/**
 * LA REGLA, y la unica copia de ella.
 *
 * `adminTienda` -> **propias** (SLT-49, R7-R10). `apiKey` -> **propias** (feature 136, sin
 * cambio, R13). Son las dos formas que tiene UNA tienda de dirigirse al sistema —la sesion de su
 * pantalla y la credencial de su integracion— y las dos ven solo lo suyo. `actor.usuarioId` ES el
 * `tienda_id` de sus ordenes: el mismo hecho que usan `OrdenService.construirWhere` y
 * `resolverAlcanceBorradoOrden`.
 *
 * `maestro` y `admin` -> **todas** (R11, sin cambio).
 *
 * `mensajero`, `adminSatelite` y cualquier otro rol -> **todas**. ⚠ DIFERENCIA DELIBERADA con el
 * borrado: aqui el valor por defecto es `todas`, no `denegado`, porque hasta la SLT-49 la
 * etiqueta era legible para todo rol con sesion (feature 32) y estrechar a los demas roles NO es
 * de esta feature (R12). Es una lista de EXCLUSION: un rol nuevo nace leyendo todas las
 * etiquetas. **SLT-50** («Etiquetas: limitar por dueño a mensajero y demas roles») cambia esta
 * linea y, con ella, la DIRECCION de la lista; hacerlo aqui cambia a la vez el `where` del
 * servidor y la oferta de la pantalla.
 */
export function resolverAlcanceEtiquetasOrden(actor: Actor): AlcanceEtiquetasOrden {
  if (actor.rol === "adminTienda" || actor.rol === "apiKey") {
    return { alcance: "propias", ownerId: actor.usuarioId };
  }
  // SLT-50: aqui decide el alcance de mensajero/adminSatelite. Hoy, comportamiento previo (R12).
  return { alcance: "todas" };
}
