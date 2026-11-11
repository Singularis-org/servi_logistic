import { Prisma, type PrismaClient } from "@prisma/client";

import { PROFUNDIDAD_DEL_NIVEL } from "@/lib/repositories/_shared/lugar-orden";
import { ancestros, nodo, type CatalogoGeografico } from "@/lib/services/geografia-dominio";
import type { NivelGeografico } from "@/lib/types/geografia-nodo";
import { ESTADOS_BODEGA_SATELITE, ESTADOS_CUSTODIA_SATELITE } from "@/lib/utils/estados-bodega-satelite";

import type { FacetasDeHoy } from "./analitica-de-hoy";

// SLT-47 (design §4.2, §7) — DE LAS FACETAS DE HOY AL LUGAR ELEGIDO.
//
// Hoy un filtro de lugar son hasta tres facetas por nivel (`provincia_id`, `canton_id`, `distrito_id`)
// cruzadas en AND. Desde SLT-47 es un solo `lugar_id`. Esta traduccion es la del cliente (un enlace
// viejo renombrado a `nivel_<k>` y validado por la barra): de cada nivel solo sobrevive lo que la lista
// de ese nivel ofrece (un id de esa profundidad), y de los niveles hondos solo lo que cuelga de lo
// elegido arriba (la poda de `dependsOn`). El lugar es lo que queda en el nivel mas hondo con eleccion.
//
// Si una faceta pedida no deja ningun id (un canton pedido como distrito, una combinacion
// incoherente), hoy esa faceta daba cero ordenes. El servidor nuevo da cero con un id que no esta en el
// catalogo (R12): se usa `LUGAR_INEXISTENTE`.
//
// Lo usan los scripts de equivalencia y sus tests. Vive en `scripts/` porque nombra las claves viejas.
// Se borra con SLT-48.

/** Un id que no esta en ningun catalogo: el lugar de un filtro que hoy daba cero ordenes. */
export const LUGAR_INEXISTENTE = "slt47-lugar-inexistente";

const NIVELES: readonly { nivel: NivelGeografico; clave: keyof FacetasDeHoy }[] = [
  { nivel: "provincia", clave: "provincia_id" },
  { nivel: "canton", clave: "canton_id" },
  { nivel: "distrito", clave: "distrito_id" },
];

/** Si el filtro trae alguna faceta geografica de hoy. */
export function tieneFacetasDeHoy(f: FacetasDeHoy): boolean {
  return NIVELES.some(({ clave }) => (f[clave]?.length ?? 0) > 0);
}

/**
 * Las facetas de hoy como `lugar_id`. `undefined` si no hay ninguna faceta geografica (sin filtro de
 * lugar). Si queda alguna faceta pedida sin ids validos, `[LUGAR_INEXISTENTE]`: cero ordenes, como hoy.
 */
export function lugarDeFacetas(cat: CatalogoGeografico, f: FacetasDeHoy): string[] | undefined {
  if (!tieneFacetasDeHoy(f)) return undefined;
  let arriba: Set<string> | null = null;
  let lugar: string[] = [];
  for (const { nivel, clave } of NIVELES) {
    const pedidos = f[clave];
    if (pedidos === undefined || pedidos.length === 0) continue;
    const profundidad = PROFUNDIDAD_DEL_NIVEL[nivel];
    const validos = [...new Set(pedidos)].filter((id) => {
      const n = nodo(cat, id);
      if (n === null || n.profundidad !== profundidad) return false;
      if (arriba === null) return true;
      const elegidosArriba = arriba;
      return ancestros(cat, id).some((a) => elegidosArriba.has(a.id));
    });
    if (validos.length === 0) return [LUGAR_INEXISTENTE];
    arriba = new Set(validos);
    lugar = validos;
  }
  return [...lugar].sort();
}

/** El `raw` de una consulta con las facetas de hoy pasado a `lugar_id` (el resto de claves, igual). */
export function rawConLugar<R extends FacetasDeHoy>(
  cat: CatalogoGeografico,
  raw: R,
): Omit<R, keyof FacetasDeHoy> & { lugar_id?: string[] } {
  const { provincia_id: _p, canton_id: _c, distrito_id: _d, ...resto } = raw;
  const lugar = lugarDeFacetas(cat, raw);
  return lugar === undefined ? resto : { ...resto, lugar_id: lugar };
}

/** Solo las facetas de hoy de un `raw`. */
export function facetasDe(raw: FacetasDeHoy): FacetasDeHoy {
  const { provincia_id, canton_id, distrito_id } = raw;
  return {
    ...(provincia_id ? { provincia_id } : {}),
    ...(canton_id ? { canton_id } : {}),
    ...(distrito_id ? { distrito_id } : {}),
  };
}

/**
 * El `where` de Prisma de HOY para las tres facetas: la copia congelada de lo que hacia
 * `OrdenRepository.list` con `criterioColumna("provinciaId" | "cantonId" | "distritoId", ...)` antes de
 * SLT-47 (y `condicionesSatelite` en SQL crudo): cada faceta pedida, un `IN` sobre su columna, en AND.
 */
export function whereDeHoy(f: FacetasDeHoy): { provinciaId?: { in: string[] }; cantonId?: { in: string[] }; distritoId?: { in: string[] } } {
  return {
    ...(f.provincia_id?.length ? { provinciaId: { in: [...f.provincia_id] } } : {}),
    ...(f.canton_id?.length ? { cantonId: { in: [...f.canton_id] } } : {}),
    ...(f.distrito_id?.length ? { distritoId: { in: [...f.distrito_id] } } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// SLT-47 (design §9; R29) — las dos consultas que mide `geo:explain-filtros`, CONGELADAS aqui.
//
// El listado de `/ordenes` y la pagina de la bodega satelite ya no filtran por columna: el «antes»
// no existe en `lib/`. Se copia la parte de cada consulta que depende del filtro (el `where` y el
// orden de la pagina) con un hueco para la geografia: el «antes» lo llena con las columnas de hoy y el
// «despues» con las condiciones de lugar de `lib/` (`whereDeLugares`, `condicionesDeLugar`). La
// hidratacion de las filas (tarifas, marcas, señales) no depende del filtro y no se mide.
// ---------------------------------------------------------------------------------------------

/** Las condiciones de HOY de la bodega satelite: un `IN` por faceta pedida, sobre su columna, en AND. */
export function condicionesSateliteDeHoy(f: FacetasDeHoy): Prisma.Sql[] {
  const condiciones: Prisma.Sql[] = [];
  const columnas: [Prisma.Sql, readonly string[] | undefined][] = [
    [Prisma.sql`o."provincia_id"`, f.provincia_id],
    [Prisma.sql`o."canton_id"`, f.canton_id],
    [Prisma.sql`o."distrito_id"`, f.distrito_id],
  ];
  for (const [columna, ids] of columnas) {
    if (ids !== undefined && ids.length > 0) condiciones.push(Prisma.sql`${columna} IN (${Prisma.join([...ids])})`);
  }
  return condiciones;
}

/**
 * La pagina de la bodega satelite (copia de `OrdenRepository.findRecepcionSatelitePaginada`,
 * `condicionesSatelite`, `desdeSatelite` y `ordenBodegaSatelite` en `c541602a`), con los cinco
 * estados del listado y la geografia que se le pase.
 */
export function paginaSateliteSql(zonaId: string, geografia: readonly Prisma.Sql[], take: number): Prisma.Sql {
  const custodia = Prisma.join([...ESTADOS_CUSTODIA_SATELITE]);
  const condiciones: Prisma.Sql[] = [
    Prisma.sql`o."zona_id" = ${zonaId}`,
    Prisma.sql`o."deleted_at" IS NULL`,
    Prisma.sql`(
        os."value" IN (${custodia})
        OR EXISTS (
          SELECT 1
          FROM "orden_historial_estado" h
          JOIN "order_status" hos ON hos."id" = h."estatus_destino_id"
          WHERE h."orden_id" = o."id" AND hos."value" IN (${custodia})
        )
      )`,
    Prisma.sql`os."value" IN (${Prisma.join([...ESTADOS_BODEGA_SATELITE])})`,
    ...geografia,
  ];
  return Prisma.sql`
      SELECT o."id", (COUNT(*) OVER ())::int AS "total"
      FROM "orden" o
      JOIN "order_status" os ON os."id" = o."estatus_id"
      WHERE ${Prisma.join(condiciones, " AND ")}
      ORDER BY
        array_position(ARRAY[${Prisma.join([...ESTADOS_BODEGA_SATELITE])}]::text[], os."value") ASC,
        o."prioridad" DESC,
        o."created_at" DESC,
        o."id" ASC
      LIMIT ${take} OFFSET ${0}
    `;
}

/**
 * La pagina del listado de `/ordenes` (copia del `findMany` + `count` de `OrdenRepository.list` en
 * `c541602a`: no borradas, el orden de la pagina y su desempate), con el `where` de geografia que se
 * le pase. Solo los ids: la proyeccion no depende del filtro.
 */
export async function paginaListadoOrdenes(
  cliente: PrismaClient,
  geografia: Prisma.OrdenWhereInput,
  take: number,
): Promise<{ ids: string[]; total: number }> {
  const where: Prisma.OrdenWhereInput = { deletedAt: null, ...geografia };
  const [filas, total] = await Promise.all([
    cliente.orden.findMany({
      where,
      orderBy: [{ prioridad: "desc" }, { createdAt: "desc" }, { id: "asc" }],
      skip: 0,
      take,
      select: { id: true },
    }),
    cliente.orden.count({ where }),
  ]);
  return { ids: filas.map((f) => f.id), total };
}
