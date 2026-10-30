import type { PrismaClient } from "@prisma/client";

import type { DistritoCoberturaRow } from "@/lib/interfaces/repositories/ICoberturaRepository";
import type {
  CantonRow,
  DistritoResueltoRow,
  DistritoRow,
  ProvinciaRow,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  GeografiaFiltrosDTO,
  OpcionCatalogo,
  OpcionGeografica,
  OpcionGeograficaConPadre,
} from "@/lib/types/filtros-ordenes";
import type {
  CantonArbolDTO,
  DistritoArbolDTO,
  ProvinciaArbolDTO,
  ProvinciaPlataformaDTO,
} from "@/lib/types/geografia-nodo";
import {
  SELECT_CADENA_CANTON,
  SELECT_CADENA_DISTRITO,
  SELECT_FLAG_PROPIO,
  disponibleDesdeCadena,
  disponibleDesdeCadenaCanton,
} from "@/lib/repositories/_shared/geografia-activa";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import {
  esZonaEspecialDeLaEmpresa,
  SELECT_MARCA_ZONA_ESPECIAL,
} from "@/lib/repositories/_shared/zona-especial";

// SLT-44 (design §6.1) — LA LECTURA DE HOY, CONGELADA. NO SE EDITA.
//
// Copia literal de las lecturas de geografia tal como estaban en `dev` en el commit
// 3c4c22c077a46cc977b3c62baa04f7db609c4a9a, ANTES de que SLT-44 las pasara al catalogo
// (`nodo_geografico`). Es «el antes» contra el que se comparan las lecturas nuevas: el test de CI
// `tests/integration/db/geo-lecturas-catalogo.test.ts` (R14–R20) y el script de equivalencia. Si se
// tocara para que un test pase, la comparacion dejaria de probar nada.
//
// Unico cambio respecto del original: cada metodo es una funcion que recibe el cliente
// (`this.prisma` -> `cliente`). Los cuerpos, comentarios incluidos, son los de entonces; el helper
// privado `nodoPlataforma` se copia igual. Vive en `scripts/` y no en `lib/` porque las guardias
// `zona-especial-punto-unico` y `geografia-predicado-unico` barren `lib/` y `app/`.
//
// Se borra con SLT-48.

// Cada funcion pide solo la tabla que lee: sirve el `PrismaClient`, el cliente de una transaccion o
// el `Pick` de cualquiera de los tres repositorios de origen.
type ClienteProvincia = Pick<PrismaClient, "provincia">;
type ClienteCanton = Pick<PrismaClient, "canton">;
type ClienteDistrito = Pick<PrismaClient, "distrito">;

// --- Helper privado de `GeoRepository`, copiado igual ---

interface FilaDeNodo {
  id: string;
  nombre: string;
  codigoDta: string | null;
  activo: boolean;
}

function nodoPlataforma(n: FilaDeNodo) {
  return { id: n.id, nombre: n.nombre, codigo: n.codigoDta, activo: n.activo };
}

// === OrdenRepository (lib/repositories/OrdenRepository.ts) ===

/**
 * R19/R21: TODAS las provincias (catálogo pequeño). NO se filtra por nombre en la
 * query: el service resuelve el match normalizando en AMBOS lados (`normalizeName`
 * -> minúsculas + sin acentos), que es insensible a tildes/mayúsculas. Un
 * `where { nombre: { in, mode: "insensitive" } }` solo cubre mayúsculas, no
 * acentos, y descartaría "Bogotá" cuando el archivo trae "Bogota".
 */
export async function findAllProvincias(cliente: ClienteProvincia): Promise<ProvinciaRow[]> {
  // FICHA 374 (R31): PROYECTA el flag, NO recorta. Un `where` aqui haria caer la fila en
  // «provincia no encontrada», que MIENTE sobre una provincia que existe; el rechazo con
  // mensaje propio vive en `resolveGeo`.
  const rows = await cliente.provincia.findMany({
    select: { id: true, nombre: true, ...SELECT_FLAG_PROPIO },
  });
  // Una provincia no tiene ascendiente: su flag propio ES su disponibilidad efectiva.
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, disponible: r.activo }));
}

/** R19: cantones de las provincias resueltas (todo el universo, el service filtra por jerarquia). */
export async function findCantonesByProvinciaIds(cliente: ClienteCanton, provinciaIds: string[]): Promise<CantonRow[]> {
  if (provinciaIds.length === 0) return [];
  const rows = await cliente.canton.findMany({
    where: { provinciaId: { in: provinciaIds } },
    // FICHA 374 (R31): se proyecta la cadena; el `WHERE` no gana ni una condicion.
    select: { id: true, nombre: true, provinciaId: true, ...SELECT_CADENA_CANTON },
  });
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    provinciaId: r.provinciaId,
    disponible: disponibleDesdeCadenaCanton(r),
  }));
}

/** R19: distritos de los cantones resueltos. */
export async function findDistritosByCantonIds(cliente: ClienteDistrito, cantonIds: string[]): Promise<DistritoRow[]> {
  if (cantonIds.length === 0) return [];
  const rows = await cliente.distrito.findMany({
    where: { cantonId: { in: cantonIds } },
    // La zona del distrito vive en la N:M `zona_distrito` (feature 24): es ahi donde
    // la UI/ZonaForm asigna distritos a zonas, NO en la columna escalar distrito.zona_id
    // (que quedo sin poblar). La carga masiva deriva orden.zona_id de esta relacion.
    // Feature 98/R2: junto al `zonaId` de la N:M se proyecta `zona.esCentral` (flag que elige
    // la columna del flete al tarifar la carga por API), sin una consulta extra.
    select: {
      id: true,
      nombre: true,
      cantonId: true,
      // SL-38: la marca de la EMPRESA de la transaccion, por el punto unico.
      ...SELECT_MARCA_ZONA_ESPECIAL,
      // FICHA 374 (R31): la cadena se PROYECTA. El `WHERE` sigue siendo el de siempre.
      ...SELECT_CADENA_DISTRITO,
      zonas: { select: { zonaId: true, zona: { select: { esCentral: true } } } },
    },
  });
  // Un distrito con EXACTAMENTE una zona resuelve orden.zona_id; con 0 zonas -> sin zona
  // asignada (error de fila); con >1 -> ambiguo/no derivable -> null (mismo trato seguro:
  // no se inventa una zona). El caso normal de negocio es 1 zona por distrito.
  //
  // Ficha 327/B2: el colapso ya NO se escribe aqui. Vive en `zonaUnicaDeDistrito`, y lo comparte
  // con `findDistritoParaCorreccion`. La salida de esta lectura no cambia.
  return rows.map((d) => {
    const zona = zonaUnicaDeDistrito(d.zonas);
    return {
      id: d.id,
      nombre: d.nombre,
      cantonId: d.cantonId,
      zonaId: zona?.zonaId ?? null,
      // Feature 98/R2: `esCentral` de la unica zona; `false` si el distrito no resuelve UNA
      // zona (0 o >1 -> `zonaId` null -> la fila no llega a tarifarse).
      esCentral: zona?.zona.esCentral ?? false,
      // A diferencia de `esCentral`, esta NO depende de que el distrito resuelva UNA zona: la
      // marca es del distrito para la empresa, no de su zona (SL-38).
      esZonaEspecial: esZonaEspecialDeLaEmpresa(d),
      // FICHA 374: la disponibilidad EFECTIVA, ya compuesta con canton y provincia.
      disponible: disponibleDesdeCadena(d),
    };
  });
}

/**
 * FICHA 327 (design §9.4) — EL DISTRITO PROPUESTO, RESUELTO ENTERO EN UNA CONSULTA.
 *
 * Trae `provinciaId` por la relacion `canton.provinciaId` para que el servicio pueda comprobar
 * la cadena provincia -> canton -> distrito (R6) SIN una segunda consulta, y la zona por el
 * mismo colapso de la N:M que usa la carga masiva (R7).
 *
 * `zonaId: null` significa «este distrito no resuelve UNA zona» (0 o >1), y el servicio lo
 * rechaza nombrando el motivo: `orden.zona_id` es NOT NULL y elegir una de varias seria
 * inventar la tarifa.
 */
export async function findDistritoParaCorreccion(cliente: ClienteDistrito, distritoId: string): Promise<DistritoResueltoRow | null> {
  const row = await cliente.distrito.findFirst({
    where: { id: distritoId },
    select: {
      id: true,
      nombre: true,
      cantonId: true,
      // SL-38: la marca de la EMPRESA de la transaccion, por el punto unico.
      ...SELECT_MARCA_ZONA_ESPECIAL,
      // FICHA 374 (R31): se proyecta la cadena entera. `provinciaId` sigue viniendo por la misma
      // relacion; el `activo` de canton y provincia viaja al lado, sin una segunda consulta.
      ...SELECT_CADENA_DISTRITO,
      // El `canton` de arriba se re-declara para sumarle `provinciaId`, que esta lectura ya
      // traia. La cadena de flags entra por el fragmento compartido, NO escrita a mano: la
      // guardia de R11 prohibe el literal `activo: true` fuera de `_shared/geografia-activa.ts`.
      canton: { select: { provinciaId: true, ...SELECT_CADENA_CANTON } },
      zonas: { select: { zonaId: true, zona: { select: { nombre: true, esCentral: true } } } },
    },
  });
  if (row === null) return null;
  const zona = zonaUnicaDeDistrito(row.zonas);
  return {
    id: row.id,
    nombre: row.nombre,
    cantonId: row.cantonId,
    provinciaId: row.canton.provinciaId,
    zonaId: zona?.zonaId ?? null,
    zonaNombre: zona?.zona.nombre ?? null,
    esCentral: zona?.zona.esCentral ?? false,
    esZonaEspecial: esZonaEspecialDeLaEmpresa(row),
    // FICHA 374 (R30): la disponibilidad EFECTIVA. El servicio la usa para rechazar la
    // correccion con un motivo PROPIO —«el distrito fue retirado»— distinto del de «no existe».
    disponible: disponibleDesdeCadena(row),
  };
}

// === CoberturaRepository (lib/repositories/CoberturaRepository.ts) ===

export async function listDistritos(cliente: ClienteDistrito): Promise<DistritoCoberturaRow[]> {
  // SIN `where`: activos e inactivos (R4). La disponibilidad se PROYECTA, no se recorta.
  const rows = await cliente.distrito.findMany({
    // Los flags se proyectan con `SELECT_FLAG_PROPIO` (guardia 374/R11: el literal del flag
    // solo vive en `_shared/geografia-activa.ts`).
    select: {
      nombre: true,
      ...SELECT_FLAG_PROPIO,
      // SL-38: la marca de la EMPRESA del actor (R15), por el punto unico.
      ...SELECT_MARCA_ZONA_ESPECIAL,
      canton: {
        select: {
          nombre: true,
          ...SELECT_FLAG_PROPIO,
          provincia: { select: { nombre: true, ...SELECT_FLAG_PROPIO } },
        },
      },
      zonas: { select: { zona: { select: { id: true, nombre: true, esCentral: true } } } },
    },
  });

  return rows.map(
    (d): DistritoCoberturaRow => ({
      provincia: { nombre: d.canton.provincia.nombre, activo: d.canton.provincia.activo },
      canton: { nombre: d.canton.nombre, activo: d.canton.activo },
      distrito: {
        nombre: d.nombre,
        activo: d.activo,
        zonaEspecial: esZonaEspecialDeLaEmpresa(d),
      },
      disponible: disponibleDesdeCadena(d),
      zonas: d.zonas.map((zd) => zd.zona),
    }),
  );
}

// === GeoRepository (lib/repositories/GeoRepository.ts) ===

// --- Feature 144/B2 (R48/R49/R54): proyecciones planas del catalogo completo ---
//
// FICHA 374: las tres PROYECTAN la disponibilidad efectiva y NO recortan (R28/R31). En geografia
// el desplegable es la UNICA via —nadie teclea un uuid—, asi que ocultar un nodo retirado
// dejaria INFILTRABLES las ordenes historicas de ese nodo. Es al reves que en la ficha 351, y
// por eso se razona en vez de copiarse.

export async function listProvinciasLite(cliente: ClienteProvincia): Promise<OpcionGeografica[]> {
  const rows = await cliente.provincia.findMany({
    select: { id: true, nombre: true, ...SELECT_FLAG_PROPIO },
    orderBy: { nombre: "asc" }, // R49: orden determinista
  });
  // Una provincia no tiene ascendiente: su flag propio ES su disponibilidad efectiva.
  return rows.map((r) => ({ id: r.id, nombre: r.nombre, disponible: r.activo }));
}

export async function listCantonesLite(cliente: ClienteCanton): Promise<OpcionGeograficaConPadre[]> {
  const rows = await cliente.canton.findMany({
    select: { id: true, nombre: true, provinciaId: true, ...SELECT_CADENA_CANTON },
    orderBy: { nombre: "asc" },
  });
  // `padreId` en vez de `provinciaId`: el consumidor generico no sabe de geografia,
  // solo de "padre" (R48).
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    padreId: r.provinciaId,
    disponible: disponibleDesdeCadenaCanton(r),
  }));
}

export async function listDistritosLite(cliente: ClienteDistrito): Promise<OpcionGeograficaConPadre[]> {
  // Sin `zonas`: la zona de la ORDEN esta congelada en `orden.zona_id` y no se
  // deriva del distrito (decision (b) del spec). Traerla aqui seria peso muerto en
  // el payload de las 494 filas.
  const rows = await cliente.distrito.findMany({
    select: { id: true, nombre: true, cantonId: true, ...SELECT_CADENA_DISTRITO },
    orderBy: { nombre: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    padreId: r.cantonId,
    disponible: disponibleDesdeCadena(r),
  }));
}

/**
 * La cadena geografica de UNA zona (contrato en `IGeoRepository`). Una sola consulta:
 * los distritos asociados a la zona por la N:M, con su canton y la provincia de ese
 * canton; provincias y cantones se DERIVAN de esas filas en vez de pedirse aparte,
 * porque «los cantones de la zona» son exactamente los de sus distritos y dos consultas
 * mas podrian dar un conjunto distinto si la puente cambiara entre medias.
 *
 * El orden por nombre lo fija la consulta para los distritos y la insercion en el `Map`
 * para los otros dos niveles; los tres se reordenan al final para no depender de eso.
 */
export async function listGeografiaLitePorZona(cliente: ClienteDistrito, zonaId: string): Promise<GeografiaFiltrosDTO> {
  const rows = await cliente.distrito.findMany({
    where: { zonas: { some: { zonaId } } },
    select: {
      id: true,
      nombre: true,
      cantonId: true,
      ...SELECT_CADENA_DISTRITO,
      canton: {
        select: {
          id: true,
          nombre: true,
          provinciaId: true,
          ...SELECT_CADENA_CANTON,
          provincia: { select: { id: true, nombre: true, ...SELECT_FLAG_PROPIO } },
        },
      },
    },
    orderBy: { nombre: "asc" },
  });

  const provincias = new Map<string, OpcionGeografica>();
  const cantones = new Map<string, OpcionGeograficaConPadre>();
  for (const row of rows) {
    provincias.set(row.canton.provincia.id, {
      id: row.canton.provincia.id,
      nombre: row.canton.provincia.nombre,
      disponible: row.canton.provincia.activo,
    });
    cantones.set(row.canton.id, {
      id: row.canton.id,
      nombre: row.canton.nombre,
      padreId: row.canton.provinciaId,
      disponible: disponibleDesdeCadenaCanton(row.canton),
    });
  }

  const porNombre = (a: OpcionCatalogo, b: OpcionCatalogo) =>
    a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });

  return {
    provincias: [...provincias.values()].sort(porNombre),
    cantones: [...cantones.values()].sort(porNombre),
    distritos: rows
      .map((r) => ({
        id: r.id,
        nombre: r.nombre,
        padreId: r.cantonId,
        disponible: disponibleDesdeCadena(r),
      }))
      .sort(porNombre),
  };
}

// --- FICHA 374: la administracion del catalogo ---

/**
 * El arbol COMPLETO (R26). MUDADO desde `lib/actions/geografia.ts`, donde vivia contra Prisma
 * directo porque «el catalogo es de solo lectura»; esa premisa muere con la primera escritura.
 *
 * La consulta es la misma salvo DOS cambios, los dos deliberados:
 *
 *  1. proyecta `activo` en los tres niveles (el flag PROPIO, no la efectiva): la pantalla de
 *     administracion necesita distinguir «inactivo» de «inactivo POR SU CANTON», y para eso el
 *     padre tiene que estar literalmente encima en el mismo arbol;
 *
 *  2. ⚠️ las zonas del distrito YA NO son `take: 1`. Con `take: 1`, un distrito en DOS zonas
 *     mostraba «(zona: X)» aunque la carga masiva lo rechaza por ambiguo —`zonaUnicaDeDistrito`
 *     colapsa >1 a `null`—: esa etiqueta MENTIA, y la marca «sin zona» de la pantalla nueva
 *     heredaria la mentira. Ahora se piden todas y se aplica el MISMO colapso 1/0/>1 que usan la
 *     carga y la correccion. Medido en produccion el 2026-09-05: 0 distritos con mas de una
 *     zona, asi que hoy no cambia lo que nadie ve — pero la señal nueva no se construye sobre
 *     una rota.
 */
export async function listArbol(cliente: ClienteProvincia): Promise<ProvinciaArbolDTO[]> {
  const provincias = await cliente.provincia.findMany({
    orderBy: { nombre: "asc" },
    select: {
      id: true,
      nombre: true,
      ...SELECT_FLAG_PROPIO,
      cantones: {
        orderBy: { nombre: "asc" },
        select: {
          id: true,
          nombre: true,
          ...SELECT_FLAG_PROPIO,
          distritos: {
            orderBy: { nombre: "asc" },
            select: {
              id: true,
              nombre: true,
              // SL-38: la marca de la EMPRESA de la transaccion, por el punto unico.
              ...SELECT_MARCA_ZONA_ESPECIAL,
              ...SELECT_FLAG_PROPIO,
              zonas: { select: { zona: { select: { id: true, nombre: true } } } },
            },
          },
        },
      },
    },
  });

  return provincias.map(
    (p): ProvinciaArbolDTO => ({
      id: p.id,
      nombre: p.nombre,
      activo: p.activo,
      cantones: p.cantones.map(
        (c): CantonArbolDTO => ({
          id: c.id,
          nombre: c.nombre,
          activo: c.activo,
          distritos: c.distritos.map((d): DistritoArbolDTO => {
            // El colapso 1/0/>1, compartido: `null` con 0 zonas Y TAMBIEN con mas de una.
            const zona = zonaUnicaDeDistrito(d.zonas)?.zona ?? null;
            return {
              id: d.id,
              nombre: d.nombre,
              zonaId: zona?.id ?? null,
              zonaNombre: zona?.nombre ?? null,
              // SL-38: especial PARA LA EMPRESA del maestro que abre Tarifas (R14).
              zonaEspecial: esZonaEspecialDeLaEmpresa(d),
              activo: d.activo,
            };
          }),
        }),
      ),
    }),
  );
}

/**
 * SL-20 — el arbol de UN pais para el superadmin. Mismo recorrido que `listArbol`, sin zonas ni
 * marca de zona especial (son de cada empresa) y con el codigo. El `where` por pais es explicito:
 * en plataforma no hay RLS que acote.
 */
export async function listArbolDePais(cliente: ClienteProvincia, paisId: string): Promise<ProvinciaPlataformaDTO[]> {
  const nodo = { id: true, nombre: true, codigoDta: true, ...SELECT_FLAG_PROPIO } as const;
  const provincias = await cliente.provincia.findMany({
    where: { paisId },
    orderBy: { nombre: "asc" },
    select: {
      ...nodo,
      cantones: {
        orderBy: { nombre: "asc" },
        select: { ...nodo, distritos: { orderBy: { nombre: "asc" }, select: nodo } },
      },
    },
  });
  return provincias.map((p) => ({
    ...nodoPlataforma(p),
    cantones: p.cantones.map((c) => ({
      ...nodoPlataforma(c),
      distritos: c.distritos.map(nodoPlataforma),
    })),
  }));
}
