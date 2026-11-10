import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import type {
  ArbolDePais,
  ContextoDeAltaDeNodo,
  DatosDeAltaDeNodo,
  DesenlaceDeActivacion,
  DesenlaceDeRenombre,
  DestinoDeAlta,
  DivisionPorProfundidadDePais,
  IGeoRepository,
} from "@/lib/interfaces/repositories/IGeoRepository";
import type {
  GeografiaFiltrosDTO,
  OpcionCatalogo,
  OpcionGeografica,
  OpcionGeograficaConPadre,
} from "@/lib/types/filtros-ordenes";
import {
  GEO_NOMBRE_MAX,
  type ArbolDeZonasDTO,
  type CantonArbolDTO,
  type DistritoArbolDTO,
  type NodoArbolPlataformaDTO,
  type NodoDeZonasDTO,
  type ProvinciaArbolDTO,
  type TipoNivelDTO,
} from "@/lib/types/geografia-nodo";
import type {
  NodoExistenteConProfundidad,
  PlanDivisionPorProfundidad,
  RefNodo,
  ResumenCargaPorProfundidad,
} from "@/lib/types/division-csv";
import { PAIS_NIVELES_MAX } from "@/lib/types/pais";
import { SELECT_FLAG_PROPIO } from "@/lib/repositories/_shared/geografia-activa";
import type { ClienteDeMarcas } from "@/lib/repositories/_shared/zona-especial";
import { zonaUnicaDeDistrito } from "@/lib/repositories/_shared/zona-colapso";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import {
  ancestros,
  esZonaEspecial,
  estaActivo,
  nodosBajo,
  nodosDeProfundidad,
  zonaQueCubre,
  zonasCandidatas,
  type AsignacionesDeLaEmpresa,
  type CatalogoGeografico,
  type NodoDelCatalogo,
  type TipoDeNivel,
} from "@/lib/services/geografia-dominio";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import {
  appendAccionPlataforma,
  type ActorPlataformaCongelado,
} from "@/lib/repositories/registrar-accion-plataforma";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

// FICHA 374: el `Pick` gana `$transaction` y `usuario` porque las escrituras registran su accion en
// la MISMA transaccion del cambio — igual que `VehiculoPrismaClient` en la ficha 362.
// SL-20: el registro pasa de `historialAccion` a `historialPlataforma` (R33, R35; D15), y entra
// `pais` por la regla de codigo y el nombre del pais.
// SLT-44 (design §5): las lecturas de los filtros y de los arboles pasan al catalogo
// (`CatalogoGeograficoRepository`), que gana los modelos del nodo, de las asignaciones y de la
// empresa. Las marcas, por el tipo del punto unico.
// SLT-46 (design §4.4; R1): `provincia`, `canton` y `distrito` salen del `Pick`. La app escribe el
// nodo y el trigger de T2.2 copia las profundidades 1–3 a esas tablas en la misma sentencia; sin el
// delegado en el tipo, una escritura directa a la geografia vieja no compila.
type GeoPrismaClient = Pick<
  PrismaClient,
  | "pais"
  | "$transaction"
  | "historialPlataforma"
  | "usuario"
  | "nodoGeografico"
  | "tipoNivelGeografico"
  | "zonaDistrito"
  | "zonaNodo" // SLT-89: el cargador del catalogo lee tambien `zona_nodo`
  | "organizacion"
> &
  ClienteDeMarcas;

type GeoTx = Pick<GeoPrismaClient, "nodoGeografico">;

const SELECT_TIPO = {
  id: true,
  clave: true,
  nombreSingular: true,
  nombrePlural: true,
  digitosCodigo: true,
  codigoHeredaPrefijo: true,
} as const;

const SELECT_HERMANO = { id: true, nombre: true } as const;

// Una carga de 10 000 filas son hasta P × 10 000 nodos en P `createMany` mas los codigos a
// completar: el limite por defecto de 5 s de una transaccion interactiva no da margen.
const TIMEOUT_IMPORTACION_MS = 120_000;

// --- Tipos de nivel ---

/** `nivel_<k>` → k (P1: el tipo de la profundidad k es el de clave `nivel_<k>`). */
function profundidadDeClave(clave: string): number {
  const m = /^nivel_(\d+)$/.exec(clave);
  if (m === null) throw new Error(`tipo de nivel con clave inesperada: ${clave}`);
  return Number(m[1]);
}

function claveDeProfundidad(k: number): string {
  return `nivel_${k}`;
}

function tipoDTO(t: TipoDeNivel): TipoNivelDTO {
  return { ...t, profundidad: profundidadDeClave(t.clave) };
}

function tiposOrdenados(tipos: readonly TipoDeNivel[]): TipoNivelDTO[] {
  return tipos.map(tipoDTO).sort((a, b) => a.profundidad - b.profundidad);
}

// --- La etiqueta congelada ---

/**
 * Los nombres de la cadena de un nodo, de la HOJA A LA RAIZ (el orden de `etiquetaDeEntidad`
 * `nodo_geografico`, que es el de las etiquetas de provincia/canton/distrito: «Cabagra · Buenos
 * Aires · Puntarenas»). Sube por `padre_id`: a lo sumo P lecturas; pasar de ahi es un ciclo.
 */
async function cadenaDeNombres(tx: GeoTx, nombre: string, padreId: string | null): Promise<string[]> {
  const nombres = [nombre];
  let siguiente = padreId;
  while (siguiente !== null) {
    if (nombres.length >= PAIS_NIVELES_MAX) {
      throw new Error(`la cadena de padres del nodo «${nombre}» supera ${PAIS_NIVELES_MAX} niveles`);
    }
    const padre = await tx.nodoGeografico.findUnique({
      where: { id: siguiente },
      select: { nombre: true, padreId: true },
    });
    if (padre === null) throw new Error(`el padre ${siguiente} del nodo «${nombre}» no existe`);
    nombres.push(padre.nombre);
    siguiente = padre.padreId;
  }
  return nombres;
}

function etiquetaDeNodo(nombres: readonly string[]): string {
  return etiquetaDeEntidad("nodo_geografico", { nombres });
}

/** El actor congelado, sin el rol: el historial de plataforma no lo guarda (design §2.6). */
async function actorDePlataforma(
  tx: Pick<GeoPrismaClient, "usuario">,
  actorUsuarioId: string | null,
): Promise<ActorPlataformaCongelado> {
  const { actorUsuarioId: id, actorNombre } = await resolverActorCongelado(tx, actorUsuarioId);
  return { actorUsuarioId: id, actorNombre };
}

/** El nodo que una escritura lee antes de decidir. */
async function leerNodoPrevio(tx: GeoTx, id: string) {
  return tx.nodoGeografico.findUnique({
    where: { id },
    select: { ...SELECT_FLAG_PROPIO, nombre: true, paisId: true, padreId: true, profundidad: true },
  });
}

// --- SLT-44: proyecciones del catalogo a los DTO de tres niveles (design §2.4, §5) ---

/** Un nodo del catalogo como opcion de filtro, con su disponibilidad efectiva (R5, R14). */
function opcion(cat: CatalogoGeografico, n: NodoDelCatalogo): OpcionGeografica {
  return { id: n.id, nombre: n.nombre, disponible: estaActivo(cat, n.id) === true };
}

/** Lo mismo con su padre. Un nodo de profundidad > 1 siempre lo tiene (FK de SLT-43). */
function opcionConPadre(cat: CatalogoGeografico, n: NodoDelCatalogo): OpcionGeograficaConPadre {
  if (n.padreId === null) throw new Error(`el nodo ${n.id} de profundidad ${n.profundidad} no tiene padre`);
  return { ...opcion(cat, n), padreId: n.padreId };
}

/**
 * Los hijos de un nodo (o las raices, con `null`) en el orden del catalogo, solo de esa
 * profundidad: un nodo de profundidad > 3 no se lista en los DTO de tres niveles (design §2.4).
 */
function hijosDe(cat: CatalogoGeografico, padreId: string | null, profundidad: number): NodoDelCatalogo[] {
  return (cat.hijos.get(padreId) ?? []).filter((n) => n.profundidad === profundidad);
}

/** SLT-46 (R21): el subarbol de un nodo, a cualquier profundidad, en el orden del catalogo. */
function nodoDelArbol(cat: CatalogoGeografico, n: NodoDelCatalogo): NodoArbolPlataformaDTO {
  return {
    id: n.id,
    nombre: n.nombre,
    codigo: n.codigoOficial,
    activo: n.activo,
    profundidad: n.profundidad,
    tipoId: n.tipoId,
    hijos: (cat.hijos.get(n.id) ?? []).map((h) => nodoDelArbol(cat, h)),
  };
}

/**
 * SLT-89 (design §4.2; R24–R27): el subarbol de un nodo para el selector de zonas, a cualquier
 * profundidad y en el orden del catalogo. `asignadaA` es la asignacion directa (colapso 1/0/>1: con
 * el unico por empresa de R2 es como mucho una); `heredaDe`, la zona que cubre al PADRE —el nodo mas
 * cercano con asignacion, `zonasCandidatas`, con el colapso de `zonaQueCubre`— y ese nodo.
 */
function nodoDeZonas(cat: CatalogoGeografico, asig: AsignacionesDeLaEmpresa, n: NodoDelCatalogo): NodoDeZonasDTO {
  const propia = zonaUnicaDeDistrito(asig.zonasPorNodo.get(n.id) ?? []);
  const delPadre = n.padreId === null ? null : zonasCandidatas(cat, asig, n.padreId);
  const heredada = delPadre === null ? null : zonaUnicaDeDistrito(delPadre.zonas);
  const nodoDelQueHereda = delPadre === null ? undefined : cat.porId.get(delPadre.nodoId);
  return {
    id: n.id,
    nombre: n.nombre,
    profundidad: n.profundidad,
    activo: n.activo,
    asignadaA: propia === null ? null : { id: propia.id, nombre: propia.nombre },
    heredaDe:
      heredada === null || nodoDelQueHereda === undefined
        ? null
        : { zonaId: heredada.id, zonaNombre: heredada.nombre, nodoId: nodoDelQueHereda.id, nodoNombre: nodoDelQueHereda.nombre },
    hijos: (cat.hijos.get(n.id) ?? []).map((h) => nodoDeZonas(cat, asig, h)),
  };
}

/** Las claves del plan traducidas a los ids que se generan al escribir. */
class IdsDelPlan {
  private readonly ids = new Map<string, string>();

  nuevo(clave: string): string {
    const id = randomUUID();
    this.ids.set(clave, id);
    return id;
  }

  de(ref: RefNodo | null): string {
    if (ref === null) throw new Error("importarDivision: un nodo de profundidad > 1 sin padre");
    if (ref.tipo === "existente") return ref.id;
    const id = this.ids.get(ref.clave);
    if (id === undefined) throw new Error(`importarDivision: el padre ${ref.clave} no se creo antes`);
    return id;
  }
}

// El catalogo geografico global. Solo queries Prisma; sin logica de negocio.
//
// SLT-46 (design §4.4; R1, R43) — ES EL UNICO ESCRITOR DE `nodo_geografico`, y ya no escribe
// `provincia`, `canton` ni `distrito`: el trigger `nodo_geografico_copia_a_geografia_vieja` (T2.2)
// deja la fila vieja igual al nodo de profundidad 1–3 en la misma sentencia. La guardia
// `nodo-geografico-escritor-unico` vigila lo primero y `geografia-vieja-sin-escritor`, lo segundo.
//
// ⚠️ NO EXPONE `delete` NI `deleteMany` (R42). Quitar un nodo es DESACTIVARLO: `orden` congela su
// geografia y un borrado la dejaria apuntando a la nada. `geografia-sin-borrado-fisico` recorre
// `lib/` para que nadie lo añada por otro camino.
//
// ⚠️ `renombrar` ES EL UNICO SITIO DE `lib/` QUE CAMBIA `nombre` DE UN NODO EXISTENTE
// (`geografia-renombrado-punto-unico`): otro `update` con `nombre` se saltaria la unicidad por
// clave NORMALIZADA del service y no dejaria fila en el historial.
//
// ⚠️ NINGUNA ESCRITURA TOCA A LOS DESCENDIENTES (R19). La disponibilidad efectiva se EVALUA al leer;
// materializarla romperia la reversibilidad del retiro.
//
// SLT-46 (T4): las formas por NIVEL de SL-20 se retiraron cuando `GeografiaService` y
// `CargaDivisionService` pasaron al nodo: todo va por id y profundidad.
export class GeoRepository implements IGeoRepository {
  constructor(private readonly prisma: GeoPrismaClient) {}

  // SLT-44 (design §4): uno por instancia, creado al primer uso. Las composiciones crean este
  // repositorio en cada llamada, asi que el catalogo se lee como mucho una vez por peticion (R11).
  private catalogoRepo: CatalogoGeograficoRepository | null = null;

  private catalogo(): CatalogoGeograficoRepository {
    this.catalogoRepo ??= new CatalogoGeograficoRepository(this.prisma);
    return this.catalogoRepo;
  }

  // --- Feature 144/B2 (R48/R49/R54): proyecciones planas del catalogo completo ---
  //
  // FICHA 374: las tres PROYECTAN la disponibilidad efectiva y NO recortan (R28/R31). En geografia
  // el desplegable es la UNICA via —nadie teclea un uuid—, asi que ocultar un nodo retirado
  // dejaria INFILTRABLES las ordenes historicas de ese nodo.
  //
  // SLT-44 (R14): salen del catalogo del pais de la empresa, en su orden (nombre, id). Provincia,
  // canton y distrito son las profundidades 1, 2 y 3 (design §2.4); `disponible` es el activo en
  // cascada del dominio.

  async listProvinciasLite(): Promise<OpcionGeografica[]> {
    const { catalogo } = await this.catalogo().deLaEmpresa();
    return nodosDeProfundidad(catalogo, 1).map((n) => opcion(catalogo, n));
  }

  async listCantonesLite(): Promise<OpcionGeograficaConPadre[]> {
    // `padreId` en vez de `provinciaId`: el consumidor generico no sabe de geografia,
    // solo de "padre" (R48).
    const { catalogo } = await this.catalogo().deLaEmpresa();
    return nodosDeProfundidad(catalogo, 2).map((n) => opcionConPadre(catalogo, n));
  }

  async listDistritosLite(): Promise<OpcionGeograficaConPadre[]> {
    // Sin zonas: la zona de la ORDEN esta congelada en `orden.zona_id` y no se deriva del
    // distrito (decision (b) del spec de la feature 144).
    const { catalogo } = await this.catalogo().deLaEmpresa();
    return nodosDeProfundidad(catalogo, 3).map((n) => opcionConPadre(catalogo, n));
  }

  /**
   * La cadena geografica de UNA zona (contrato en `IGeoRepository`), desde el catalogo (SLT-44,
   * R15): los nodos asignados a la zona por la empresa, lo que cuelga de ellos y esta zona cubre
   * (SLT-89 R6: sin las excepciones de otra zona) y los ancestros de unos y otros. Mientras las asignaciones sean solo a distritos, son los distritos de la zona,
   * sus cantones y sus provincias, como hoy.
   *
   * Un distrito en dos zonas cuenta en las dos, sin colapso: son filtros, no tarifa. Una zona de
   * otra empresa no tiene asignaciones en las de esta, y da las tres listas vacias.
   *
   * El orden final es el de siempre, `localeCompare` en español sin distinguir tildes.
   */
  async listGeografiaLitePorZona(zonaId: string): Promise<GeografiaFiltrosDTO> {
    const { catalogo, asignaciones } = await this.catalogo().deLaEmpresa();

    const deLaZona = new Set<string>();
    for (const [nodoId, zonas] of asignaciones.zonasPorNodo) {
      if (!catalogo.porId.has(nodoId) || !zonas.some((z) => z.id === zonaId)) continue;
      deLaZona.add(nodoId);
      // SLT-89 (R6): lo que cuelga del nodo entra solo si es ESTA zona la que lo cubre (la asignacion
      // mas cercana). Un distrito con fila propia de otra zona bajo un canton asignado es una
      // excepcion: es de la otra. Con asignaciones solo a distritos, lo que cuelga de un distrito no
      // tiene asignacion propia y entra como siempre (R38).
      for (const n of nodosBajo(catalogo, nodoId)) {
        if (zonasCandidatas(catalogo, asignaciones, n.id)?.zonas.some((z) => z.id === zonaId)) deLaZona.add(n.id);
      }
    }
    const conAncestros = new Set(deLaZona);
    for (const id of deLaZona) for (const a of ancestros(catalogo, id)) conAncestros.add(a.id);

    const porNombre = (a: OpcionCatalogo, b: OpcionCatalogo) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    const de = (ids: ReadonlySet<string>, profundidad: number) =>
      catalogo.nodos.filter((n) => n.profundidad === profundidad && ids.has(n.id));

    return {
      provincias: de(conAncestros, 1).map((n) => opcion(catalogo, n)).sort(porNombre),
      cantones: de(conAncestros, 2).map((n) => opcionConPadre(catalogo, n)).sort(porNombre),
      distritos: de(deLaZona, 3).map((n) => opcionConPadre(catalogo, n)).sort(porNombre),
    };
  }

  /**
   * El arbol COMPLETO de la empresa (R26 de la 374): la pantalla de tarifas.
   *
   * Proyecta `activo` en los tres niveles (el flag PROPIO, no la efectiva): la pantalla de
   * administracion necesita distinguir «inactivo» de «inactivo POR SU CANTON», y para eso el padre
   * tiene que estar literalmente encima en el mismo arbol.
   *
   * SLT-44 (R16): sale del catalogo. La zona del distrito es la que lo cubre (`zonaQueCubre`, R6):
   * el colapso 1/0/>1 de la 374 sobre la asignacion mas especifica, `null` con 0 zonas Y TAMBIEN con
   * mas de una. La marca, la de la empresa sobre el o sus ancestros (R7). Mientras las asignaciones
   * sean solo a distritos, es el arbol de hoy.
   */
  async listArbol(): Promise<ProvinciaArbolDTO[]> {
    const { catalogo, asignaciones } = await this.catalogo().deLaEmpresa();
    return hijosDe(catalogo, null, 1).map(
      (p): ProvinciaArbolDTO => ({
        id: p.id,
        nombre: p.nombre,
        activo: p.activo,
        cantones: hijosDe(catalogo, p.id, 2).map(
          (c): CantonArbolDTO => ({
            id: c.id,
            nombre: c.nombre,
            activo: c.activo,
            distritos: hijosDe(catalogo, c.id, 3).map((d): DistritoArbolDTO => {
              const zona = zonaQueCubre(catalogo, asignaciones, d.id);
              return {
                id: d.id,
                nombre: d.nombre,
                zonaId: zona?.id ?? null,
                zonaNombre: zona?.nombre ?? null,
                // SLT-75 R14: la lista completa, sin colapsar: las asignaciones DIRECTAS del
                // distrito. Las asignaciones ya son solo las de la empresa del contexto.
                zonas: (asignaciones.zonasPorNodo.get(d.id) ?? [])
                  .map((z) => ({ id: z.id, nombre: z.nombre }))
                  .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
                // SL-38: especial PARA LA EMPRESA del maestro que abre Tarifas (R14).
                zonaEspecial: esZonaEspecial(catalogo, asignaciones, d.id),
                activo: d.activo,
              };
            }),
          }),
        ),
      }),
    );
  }

  /**
   * SLT-89 (design §4.2): el arbol de zonas de la empresa a todas las profundidades de su pais, con
   * los tipos (los nombres de nivel del selector) ordenados por profundidad. Una sola carga del
   * catalogo, en memoria (guardia `geografia-sin-cte-recursiva`).
   */
  async arbolDeZonas(): Promise<ArbolDeZonasDTO> {
    const { catalogo, asignaciones } = await this.catalogo().deLaEmpresa();
    return {
      tipos: tiposOrdenados(catalogo.tipos).map((t) => ({
        profundidad: t.profundidad,
        nombreSingular: t.nombreSingular,
        nombrePlural: t.nombrePlural,
      })),
      raices: (catalogo.hijos.get(null) ?? []).map((n) => nodoDeZonas(catalogo, asignaciones, n)),
    };
  }

  // --- SLT-46 (design §4.4): la administracion sobre el nodo ---

  /**
   * El arbol de N niveles del pais (R21), desde el catalogo en memoria: sin CTE recursiva (guardia
   * `geografia-sin-cte-recursiva`). El pais se mira aparte porque el catalogo de uno inexistente es
   * un catalogo vacio, y «no existe» no es «sin nodos».
   */
  async arbolDePais(paisId: string): Promise<ArbolDePais | null> {
    const pais = await this.prisma.pais.findUnique({ where: { id: paisId }, select: { id: true } });
    if (pais === null) return null;
    const catalogo = await this.catalogo().dePais(paisId);
    return {
      tipos: tiposOrdenados(catalogo.tipos),
      raices: (catalogo.hijos.get(null) ?? []).map((n) => nodoDelArbol(catalogo, n)),
    };
  }

  /**
   * El contexto del alta, o `null` si el pais (raiz) o el padre (hijo) no existen. UNA consulta: el
   * padre o el pais, con sus hijos o sus raices y los tipos del pais (como mucho 10), de los que se
   * toma el de la profundidad siguiente (P1). Sin tipo, `tipo: null`: el service responde R15.
   *
   * Los hermanos van TODOS, activos e inactivos, con el nombre CRUDO: la comparacion por
   * `normalizeName` es del service, no del `WHERE`, y un nombre ocupado por un retirado sigue ocupado.
   */
  async contextoDeAlta(destino: DestinoDeAlta): Promise<ContextoDeAltaDeNodo | null> {
    if ("paisId" in destino) {
      const pais = await this.prisma.pais.findUnique({
        where: { id: destino.paisId },
        select: {
          id: true,
          tiposDeNivel: { select: SELECT_TIPO },
          nodosGeograficos: { where: { padreId: null }, select: SELECT_HERMANO, orderBy: { id: "asc" } },
        },
      });
      if (pais === null) return null;
      return {
        paisId: pais.id,
        profundidad: 1,
        tipo: tipoDeProfundidad(pais.tiposDeNivel, 1),
        tipoDelPadre: null,
        codigoPadre: null,
        hermanos: pais.nodosGeograficos,
      };
    }

    const padre = await this.prisma.nodoGeografico.findUnique({
      where: { id: destino.padreId },
      select: {
        paisId: true,
        profundidad: true,
        codigoOficial: true,
        hijos: { select: SELECT_HERMANO, orderBy: { id: "asc" } },
        pais: { select: { tiposDeNivel: { select: SELECT_TIPO } } },
      },
    });
    if (padre === null) return null;
    const profundidad = padre.profundidad + 1;
    return {
      paisId: padre.paisId,
      profundidad,
      tipo: tipoDeProfundidad(padre.pais.tiposDeNivel, profundidad),
      tipoDelPadre: tipoDeProfundidad(padre.pais.tiposDeNivel, padre.profundidad),
      codigoPadre: padre.codigoOficial,
      hermanos: padre.hijos,
    };
  }

  /**
   * Crea el nodo, devuelve su id y registra `nodo_geografico_creado` en la MISMA transaccion (R35).
   * Nace ACTIVO por el default de la columna, tambien bajo un padre retirado (R16).
   *
   * El padre se lee DENTRO de la tx: la etiqueta congelada es la cadena de nombres, y un padre de
   * otro pais o de otra profundidad que la que el llamador decidio es un defecto suyo, que se lanza
   * en vez de escribir un nodo con un tipo que no es el de su profundidad (P1).
   *
   * `nombreNormalizado` lo pisa el trigger de SLT-43; se manda porque la columna es obligatoria.
   * DEJA ESCAPAR la violacion de UNIQUE (la del nodo o la de la copia vieja, R5): el borde la traduce.
   */
  async crear(datos: DatosDeAltaDeNodo, actorUsuarioId: string | null): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const nombres = await this.cadenaDelAlta(tx, datos);
      const { id } = await tx.nodoGeografico.create({
        data: {
          paisId: datos.paisId,
          tipoId: datos.tipoId,
          padreId: datos.padreId,
          profundidad: datos.profundidad,
          nombre: datos.nombre,
          nombreNormalizado: datos.nombre,
          codigoOficial: datos.codigo,
        },
        select: { id: true },
      });
      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_creado",
          entidadTipo: "nodo_geografico",
          entidadId: id,
          entidadEtiqueta: etiquetaDeNodo(nombres),
          paisId: datos.paisId,
          ...actor,
        },
      ]);
      return id;
    });
  }

  /** La cadena del alta, comprobando que el padre es del pais y de la profundidad anterior. */
  private async cadenaDelAlta(tx: GeoTx, datos: DatosDeAltaDeNodo): Promise<string[]> {
    if (datos.padreId === null) {
      if (datos.profundidad !== 1) {
        throw new Error(`crear: una raiz no puede tener profundidad ${datos.profundidad}`);
      }
      return [datos.nombre];
    }
    const padre = await tx.nodoGeografico.findUnique({
      where: { id: datos.padreId },
      select: { nombre: true, paisId: true, padreId: true, profundidad: true },
    });
    if (padre === null) throw new Error(`crear: el padre ${datos.padreId} no existe`);
    if (padre.paisId !== datos.paisId) {
      throw new Error(`crear: el padre es de ${padre.paisId}, no de ${datos.paisId}`);
    }
    if (padre.profundidad + 1 !== datos.profundidad) {
      throw new Error(
        `crear: el padre es de profundidad ${padre.profundidad}, el hijo no puede ser de ${datos.profundidad}`,
      );
    }
    return [datos.nombre, ...(await cadenaDeNombres(tx, padre.nombre, padre.padreId))];
  }

  /**
   * Los hermanos del nodo `id` —INCLUIDO EL— o `null` si el nodo no existe (R18). Una consulta para
   * el nodo y los hijos de su padre; una raiz necesita una segunda para las demas raices de su pais,
   * que no cuelgan de ninguna fila.
   */
  async hermanosDeNodo(id: string): Promise<{ id: string; nombre: string }[] | null> {
    const fila = await this.prisma.nodoGeografico.findUnique({
      where: { id },
      select: {
        paisId: true,
        padre: { select: { hijos: { select: SELECT_HERMANO, orderBy: { id: "asc" } } } },
      },
    });
    if (fila === null) return null;
    if (fila.padre !== null) return fila.padre.hijos;
    return this.prisma.nodoGeografico.findMany({
      where: { paisId: fila.paisId, padreId: null },
      select: SELECT_HERMANO,
      orderBy: { id: "asc" },
    });
  }

  /**
   * Cambia el NOMBRE de UN nodo y lo registra en la MISMA transaccion (R18, R35, R61):
   *   1. leer el nodo → `null` es «no existe»;
   *   2. si ya se llamaba EXACTAMENTE asi, `sin_cambio` SIN ESCRIBIR NADA (aunque el «antes» que
   *      trae la pantalla sea viejo: pedir lo que ya hay es exito, R18);
   *   3. el `updateMany` con `nombre = nombreAnterior` en el `where` — la UNICA escritura, y SOLO de
   *      `nombre` (el codigo es la identidad). Comparar y escribir en UNA sentencia (design §4.7): si
   *      otra persona lo renombro entre la lectura y aqui, toca 0 filas → `cambio_concurrente`, sin
   *      escribir ni historial. Leer y luego `update` dejaria esa ventana abierta;
   *   4. la cadena con el nombre nuevo, el actor y el historial, DENTRO del callback.
   * Deja escapar la violacion de UNIQUE: el borde la traduce a `conflict`.
   */
  // Firma en una línea: `geografia-renombrado-punto-unico` localiza el cuerpo por su comienzo literal.
  async renombrar(id: string, nombre: string, nombreAnterior: string, actorUsuarioId: string | null): Promise<DesenlaceDeRenombre> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await leerNodoPrevio(tx, id);
      if (previo === null) return "no_existe";
      if (previo.nombre === nombre) return "sin_cambio";

      const { count } = await tx.nodoGeografico.updateMany({ where: { id, nombre: nombreAnterior }, data: { nombre } });
      if (count === 0) return "cambio_concurrente";

      const nombres = await cadenaDeNombres(tx, nombre, previo.padreId);
      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_renombrado",
          entidadTipo: "nodo_geografico",
          entidadId: id,
          entidadEtiqueta: etiquetaDeNodo(nombres),
          paisId: previo.paisId,
          ...actor,
          // Las columnas miden GEO_NOMBRE_MAX; el recorte solo alcanza a un nombre heredado de antes
          // de esa cota, y Postgres no trunca: aborta. El `updateMany` solo entro si el nombre era
          // `nombreAnterior`, que es por tanto el reemplazado (igual al `previo.nombre` leido).
          valorAnterior: nombreAnterior.slice(0, GEO_NOMBRE_MAX),
          valorNuevo: nombre.slice(0, GEO_NOMBRE_MAX),
        },
      ]);
      return "renombrado";
    });
  }

  /**
   * Cambia el `activo` de UN nodo y lo registra en la MISMA transaccion (R19, R35). Mismos pasos que
   * `renombrar`: «no existe» ≠ «ya estaba asi» ≠ «cambio», y solo el tercero escribe y audita. No
   * toca a los descendientes. `valorAnterior`/`valorNuevo` van en NULL: la accion ya dice la
   * transicion.
   */
  async cambiarActivacion(
    id: string,
    activo: boolean,
    actorUsuarioId: string | null,
  ): Promise<DesenlaceDeActivacion> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await leerNodoPrevio(tx, id);
      if (previo === null) return "no_existe";
      if (previo.activo === activo) return "sin_cambio";

      await tx.nodoGeografico.update({ where: { id }, data: { activo } });

      // Al historial de PLATAFORMA (SL-20): el superadmin no tiene empresa, y una fila en
      // `historial_accion` con un actor de otra empresa la rechaza la base (SL017). R38.
      const nombres = await cadenaDeNombres(tx, previo.nombre, previo.padreId);
      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: activo ? "nodo_geografico_activado" : "nodo_geografico_desactivado",
          entidadTipo: "nodo_geografico",
          entidadId: id,
          entidadEtiqueta: etiquetaDeNodo(nombres),
          paisId: previo.paisId,
          ...actor,
        },
      ]);
      return "cambiado";
    });
  }

  async profundidadDeNodo(id: string): Promise<number | null> {
    const fila = await this.prisma.nodoGeografico.findUnique({
      where: { id },
      select: { profundidad: true },
    });
    return fila?.profundidad ?? null;
  }

  /**
   * La geografia del pais para `planificarDivision` (§5): sus tipos y sus nodos con la profundidad,
   * por `id` (orden estable de SL-20: `planificarDivision` se queda con el primero de dos iguales).
   */
  async leerDivisionDePais(paisId: string): Promise<DivisionPorProfundidadDePais | null> {
    const pais = await this.prisma.pais.findUnique({
      where: { id: paisId },
      select: { tiposDeNivel: { select: SELECT_TIPO } },
    });
    if (pais === null) return null;

    const filas = await this.prisma.nodoGeografico.findMany({
      where: { paisId },
      select: {
        id: true,
        nombre: true,
        codigoOficial: true,
        padreId: true,
        profundidad: true,
        ...SELECT_FLAG_PROPIO,
      },
      orderBy: { id: "asc" },
    });
    const nodos: NodoExistenteConProfundidad[] = filas.map((n) => ({
      id: n.id,
      nombre: n.nombre,
      codigo: n.codigoOficial,
      activo: n.activo,
      padreId: n.padreId,
      profundidad: n.profundidad,
    }));

    return { tipos: tiposOrdenados(pais.tiposDeNivel), nodos };
  }

  /**
   * Escribe el plan de una carga CSV en UNA transaccion (R33, R36):
   *
   *   1. las altas por profundidad, de arriba abajo, con un `createMany` por profundidad y el tipo de
   *      esa profundidad (P1). Los ids se generan AQUI porque el plan es puro y nombra a sus altas por
   *      una clave: un hijo cuyo padre es un alta del mismo archivo necesita el id antes;
   *   2. el codigo de los existentes, SOLO `WHERE codigo_oficial IS NULL`: si entre el plan y la
   *      escritura alguien le puso uno, gana el suyo y no se cuenta como completado;
   *   3. una fila `division_cargada` con `creados` por profundidad si se escribio algo; si no, ninguna.
   *
   * No escribe `nombre` sobre nodos existentes ni toca `activo`: la carga solo crea. Cualquier error
   * de la base deshace todo y se propaga.
   */
  async importarDivision(
    paisId: string,
    plan: PlanDivisionPorProfundidad,
    actorUsuarioId: string | null,
  ): Promise<ResumenCargaPorProfundidad> {
    return this.prisma.$transaction(
      async (tx) => {
        const pais = await tx.pais.findUnique({
          where: { id: paisId },
          select: { nombre: true, tiposDeNivel: { select: { id: true, clave: true } } },
        });
        if (pais === null) throw new Error(`importarDivision: el pais ${paisId} no existe`);
        const tipoDe = new Map(pais.tiposDeNivel.map((t) => [profundidadDeClave(t.clave), t.id]));

        const ids = new IdsDelPlan();
        const profundidades = Object.keys(plan.altas)
          .map(Number)
          .sort((a, b) => a - b);
        for (const k of profundidades) {
          const altas = plan.altas[k];
          if (altas.length === 0) continue;
          const tipoId = tipoDe.get(k);
          if (tipoId === undefined) {
            throw new Error(`importarDivision: el pais ${paisId} no tiene tipo ${claveDeProfundidad(k)}`);
          }
          await tx.nodoGeografico.createMany({
            data: altas.map((a) => ({
              id: ids.nuevo(a.clave),
              paisId,
              tipoId,
              padreId: k === 1 ? null : ids.de(a.padre),
              profundidad: k,
              nombre: a.nombre,
              nombreNormalizado: a.nombre,
              codigoOficial: a.codigo,
            })),
          });
        }

        let codigosCompletados = 0;
        for (const { id, codigo } of plan.codigosACompletar) {
          const { count } = await tx.nodoGeografico.updateMany({
            where: { id, codigoOficial: null },
            data: { codigoOficial: codigo },
          });
          codigosCompletados += count;
        }

        const resumen: ResumenCargaPorProfundidad = { ...plan.resumen, codigosCompletados };
        const creadosTotal = Object.values(resumen.creados).reduce((s, n) => s + n, 0);
        if (creadosTotal + codigosCompletados > 0) {
          const actor = await actorDePlataforma(tx, actorUsuarioId);
          await appendAccionPlataforma(tx, [
            {
              accion: "division_cargada",
              entidadTipo: "pais",
              entidadId: paisId,
              entidadEtiqueta: pais.nombre,
              paisId,
              ...actor,
              detalle: {
                creados: resumen.creados,
                existentes: resumen.existentes,
                codigosCompletados,
              },
            },
          ]);
        }
        return resumen;
      },
      { timeout: TIMEOUT_IMPORTACION_MS },
    );
  }
}

/** El tipo de la profundidad `k` entre los del pais, o `null` si no lo tiene (R15). */
function tipoDeProfundidad(tipos: readonly TipoDeNivel[], k: number): TipoNivelDTO | null {
  const clave = claveDeProfundidad(k);
  const tipo = tipos.find((t) => t.clave === clave);
  return tipo === undefined ? null : tipoDTO(tipo);
}
