import type { Prisma } from "@prisma/client";

/**
 * SL-38 (design §4) — LA MARCA DE ZONA ESPECIAL ES DE LA EMPRESA, Y SE LEE EN UN SOLO SITIO.
 *
 * Hasta SL-38 la marca era una columna del distrito (`distrito.zona_especial`), comun a todas las
 * empresas. Ahora es una fila de `distrito_zona_especial` por (empresa, distrito): «este distrito
 * es especial PARA ESTA EMPRESA». Sin fila, no lo es.
 *
 * POR QUE BASTA CON LEERLA ANIDADA. La relacion `Distrito.zonasEspeciales` la acota la RLS de la
 * tabla a la empresa de la transaccion: es el mismo mecanismo que ya decide la zona de un distrito
 * por `distrito.zonas` → `zona_distrito` en esas mismas consultas (SL-17 §6.2). La extension no ve
 * los `select` anidados; la politica si.
 *
 * POR QUE VIVE AQUI. Hay ocho lecturas de la marca repartidas en cuatro repositorios, y todas
 * deciden dinero (el flete del pacto especial). Una copia a mano que divergiera —por ejemplo, que
 * olvidara el `take` o leyera otra relacion— tarifaria mal sin romper ningun test. Lo vigila
 * `tests/unit/guards/zona-especial-punto-unico.guardia.test.ts` (R22).
 */

/**
 * Fragmento `select` de `Distrito`: la marca de la EMPRESA de la transaccion (la RLS la acota).
 *
 * `take: 1` porque el unico (empresa, distrito) deja como mucho una fila con RLS; el `take` limita
 * lo que viaja cuando se lee como dueno, sin RLS (plataforma, design §7).
 */
export const SELECT_MARCA_ZONA_ESPECIAL = {
  zonasEspeciales: { select: { id: true }, take: 1 },
} as const satisfies Prisma.DistritoSelect;

/** La forma que proyecta `SELECT_MARCA_ZONA_ESPECIAL`, para tipar sin repetirla. */
export interface MarcaZonaEspecialProyectada {
  zonasEspeciales: readonly { id: string }[];
}

/**
 * `true` si el distrito tiene marca de la empresa. Un distrito ausente (orden sin distrito) no es
 * especial: es lo mismo que respondia `row.distrito?.zonaEspecial === true`.
 */
export function esZonaEspecialDeLaEmpresa(
  d: MarcaZonaEspecialProyectada | null | undefined,
): boolean {
  return (d?.zonasEspeciales.length ?? 0) > 0;
}

/**
 * SLT-44 (design §3) — el cliente minimo para leer las marcas. Se exporta desde aqui para que
 * `CatalogoGeograficoRepository` tipe su transaccion sin escribir el nombre del modelo, que la
 * guardia de R22 solo permite en este archivo y en el repositorio de escritura.
 */
export type ClienteDeMarcas = Pick<Prisma.TransactionClient, "distritoZonaEspecial">;

/**
 * SLT-44 (design §3; R12) — los nodos marcados por la EMPRESA de la transaccion, para el catalogo
 * en memoria. La empresa la ponen la extension (en el `where`) y la RLS: aqui no hay parametro de
 * empresa que un llamador pueda rellenar mal.
 *
 * El nodo es `distrito_id` y no `nodo_geografico_id`: el nodo tiene el mismo id que el distrito, y
 * asi la lectura no depende de que haya corrido el backfill de SLT-43 (decision cerrada de SLT-44).
 */
export async function leerNodosConMarcaDeLaEmpresa(tx: ClienteDeMarcas): Promise<string[]> {
  const filas = await tx.distritoZonaEspecial.findMany({
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  return filas.map((f) => f.distritoId);
}
