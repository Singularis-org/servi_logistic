import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import type {
  ContextoDeAlta,
  DivisionDePais,
  IGeoRepository,
  OpcionesDeAlta,
} from "@/lib/interfaces/repositories/IGeoRepository";
import type {
  GeografiaFiltrosDTO,
  OpcionCatalogo,
  OpcionGeografica,
  OpcionGeograficaConPadre,
} from "@/lib/types/filtros-ordenes";
import {
  GEO_NOMBRE_MAX,
  type CantonArbolDTO,
  type DistritoArbolDTO,
  type NivelGeografico,
  type ProvinciaArbolDTO,
  type ProvinciaPlataformaDTO,
} from "@/lib/types/geografia-nodo";
import type { PlanDivision, RefNodo, ResumenCarga } from "@/lib/types/division-csv";
import type { ReglaDeCodigoDePais } from "@/lib/utils/codigo-geografico";
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
type GeoPrismaClient = Pick<
  PrismaClient,
  "provincia" | "canton" | "distrito" | "pais" | "$transaction" | "historialPlataforma" | "usuario"
>;

/** La regla de codigo, tal como se selecciona de la fila del pais. */
const SELECT_REGLA = {
  digitosCodigoNivel1: true,
  digitosCodigoNivel2: true,
  digitosCodigoNivel3: true,
} as const;

// Una carga de 10 000 filas son hasta 30 000 nodos en tres `createMany` mas los codigos a completar:
// el limite por defecto de 5 s de una transaccion interactiva no da margen.
const TIMEOUT_IMPORTACION_MS = 120_000;

// SL-20 — ayudantes de las escrituras nuevas. Van ENCIMA de la clase a proposito: la guardia
// `geografia-renombrado-punto-unico` lee desde `async renombrar(` hasta el final del archivo y
// exige que ahi no aparezca `codigoDta`; el alta y la carga si lo escriben.

/**
 * SL-20 — inserta la fila del alta y devuelve su id y su etiqueta congelada. La provincia cuelga de
 * `opciones.paisId`; cantón y distrito, de su padre, que se lee aqui para la etiqueta y para
 * comprobar que el pais que el llamador va a registrar es el suyo.
 */
async function crearFila(
  tx: GeoTx,
  nivel: NivelGeografico,
  nombre: string,
  padreId: string | null,
  opciones: OpcionesDeAlta,
): Promise<{ id: string; etiqueta: string }> {
  const codigoDta = opciones.codigo;

  if (nivel === "provincia") {
    const fila = await tx.provincia.create({
      data: { nombre, codigoDta, paisId: opciones.paisId },
      select: { id: true },
    });
    return { id: fila.id, etiqueta: etiquetaDelNodo(nivel, { nombre, ...SIN_CADENA }) };
  }
  if (padreId === null) throw new Error(`falta el padre para crear un ${nivel}`);

  if (nivel === "canton") {
    const padre = await tx.provincia.findUnique({
      where: { id: padreId },
      select: { nombre: true, paisId: true },
    });
    exigirPadre(padre, nivel, padreId, opciones.paisId);
    const fila = await tx.canton.create({
      data: { nombre, codigoDta, provinciaId: padreId },
      select: { id: true },
    });
    return {
      id: fila.id,
      etiqueta: etiquetaDelNodo(nivel, { nombre, cantonNombre: null, provinciaNombre: padre.nombre }),
    };
  }

  const padre = await tx.canton.findUnique({
    where: { id: padreId },
    select: { nombre: true, paisId: true, provincia: { select: { nombre: true } } },
  });
  exigirPadre(padre, nivel, padreId, opciones.paisId);
  const fila = await tx.distrito.create({
    data: { nombre, codigoDta, cantonId: padreId },
    select: { id: true },
  });
  return {
    id: fila.id,
    etiqueta: etiquetaDelNodo(nivel, {
      nombre,
      cantonNombre: padre.nombre,
      provinciaNombre: padre.provincia.nombre,
    }),
  };
}

const SIN_CADENA = { cantonNombre: null, provinciaNombre: null } as const;

/**
 * El padre que el alta acaba de leer. `null` no es alcanzable desde el service, que comprueba el
 * padre antes: es una carrera o un defecto del llamador, y se lanza en vez de crear un huerfano. Un
 * pais distinto del que el llamador registraria es un defecto: el hijo quedaria en el del padre.
 */
function exigirPadre<T extends { paisId: string }>(
  padre: T | null,
  nivel: NivelGeografico,
  padreId: string,
  paisId: string,
): asserts padre is T {
  if (padre === null) throw new Error(`crear ${nivel}: el padre ${padreId} no existe`);
  if (padre.paisId !== paisId) {
    throw new Error(`crear ${nivel}: el padre es de ${padre.paisId}, no de ${paisId}`);
  }
}

/** El actor congelado, sin el rol: el historial de plataforma no lo guarda (design §2.6). */
async function actorDePlataforma(
  tx: Pick<GeoPrismaClient, "usuario">,
  actorUsuarioId: string | null,
): Promise<ActorPlataformaCongelado> {
  const { actorUsuarioId: id, actorNombre } = await resolverActorCongelado(tx, actorUsuarioId);
  return { actorUsuarioId: id, actorNombre };
}

function reglaDe(pais: ReglaDeCodigoDePais): ReglaDeCodigoDePais {
  return {
    digitosCodigoNivel1: pais.digitosCodigoNivel1,
    digitosCodigoNivel2: pais.digitosCodigoNivel2,
    digitosCodigoNivel3: pais.digitosCodigoNivel3,
  };
}

interface FilaDeNodo {
  id: string;
  nombre: string;
  codigoDta: string | null;
  activo: boolean;
}

function nodoPlataforma(n: FilaDeNodo) {
  return { id: n.id, nombre: n.nombre, codigo: n.codigoDta, activo: n.activo };
}

function nodoExistente(n: FilaDeNodo, padreId: string | null) {
  return { id: n.id, nombre: n.nombre, codigo: n.codigoDta, activo: n.activo, padreId };
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
    if (ref === null) throw new Error("importarDivision: un canton o distrito sin padre");
    if (ref.tipo === "existente") return ref.id;
    const id = this.ids.get(ref.clave);
    if (id === undefined) throw new Error(`importarDivision: el padre ${ref.clave} no se creo antes`);
    return id;
  }
}


// El catalogo geografico global. Solo queries Prisma; sin logica de negocio.
//
// ⚠️ FICHA 374 — YA NO ES «SOLO LECTURA», y por eso esta cabecera se reescribe en vez de dejarla
// mintiendo. Desde esta ficha el catalogo se administra desde la app y esta clase gana el arbol
// completo, el alta y el cambio de activacion. Se EXTIENDE la que habia en vez de crear un
// `GeoAdminRepository`: dos repositorios sobre las mismas tres tablas serian dos reglas que un dia
// divergen —el argumento textual de `_shared/zona-colapso.ts`—.
//
// ⚠️ NO EXPONE `delete` NI `deleteMany` PARA NINGUNA DE LAS TRES TABLAS (R5). Quitar un nodo es
// DESACTIVARLO. La interfaz no lo declara, esta clase no lo implementa, y
// `tests/unit/guards/geografia-sin-borrado-fisico.guardia.test.ts` recorre `lib/` para que nadie
// lo añada por otro camino.
//
// ⚠️ FICHA 375 — `renombrar` ES EL UNICO SITIO DE `lib/` QUE ESCRIBE `nombre` SOBRE ESTAS TRES
// TABLAS, y eso lo vigila `tests/unit/guards/geografia-renombrado-punto-unico.guardia.test.ts`. No
// es celo: un `update` con `nombre` en cualquier otro sitio se saltaria la comprobacion de
// unicidad por clave NORMALIZADA del service (la del UNIQUE literal de la base no basta) y ademas
// no dejaria rastro en el registro de acciones.
//
// ⚠️ NINGUNA ESCRITURA TOCA A LOS DESCENDIENTES (R8). La disponibilidad efectiva se EVALUA al leer
// (`_shared/geografia-activa.ts`); materializarla romperia la reversibilidad de R9.
//
// Tenia ademas `listProvincias`/`listCantones`/`listDistritos` (feature 24/R14), la navegacion por
// niveles; se borro el 2026-08-07 con `GeoService` y `lib/actions/geo.ts`.
export class GeoRepository implements IGeoRepository {
  constructor(private readonly prisma: GeoPrismaClient) {}

  // --- Feature 144/B2 (R48/R49/R54): proyecciones planas del catalogo completo ---
  //
  // FICHA 374: las tres PROYECTAN la disponibilidad efectiva y NO recortan (R28/R31). En geografia
  // el desplegable es la UNICA via —nadie teclea un uuid—, asi que ocultar un nodo retirado
  // dejaria INFILTRABLES las ordenes historicas de ese nodo. Es al reves que en la ficha 351, y
  // por eso se razona en vez de copiarse.

  async listProvinciasLite(): Promise<OpcionGeografica[]> {
    const rows = await this.prisma.provincia.findMany({
      select: { id: true, nombre: true, ...SELECT_FLAG_PROPIO },
      orderBy: { nombre: "asc" }, // R49: orden determinista
    });
    // Una provincia no tiene ascendiente: su flag propio ES su disponibilidad efectiva.
    return rows.map((r) => ({ id: r.id, nombre: r.nombre, disponible: r.activo }));
  }

  async listCantonesLite(): Promise<OpcionGeograficaConPadre[]> {
    const rows = await this.prisma.canton.findMany({
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

  async listDistritosLite(): Promise<OpcionGeograficaConPadre[]> {
    // Sin `zonas`: la zona de la ORDEN esta congelada en `orden.zona_id` y no se
    // deriva del distrito (decision (b) del spec). Traerla aqui seria peso muerto en
    // el payload de las 494 filas.
    const rows = await this.prisma.distrito.findMany({
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
  async listGeografiaLitePorZona(zonaId: string): Promise<GeografiaFiltrosDTO> {
    const rows = await this.prisma.distrito.findMany({
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
  async listArbol(): Promise<ProvinciaArbolDTO[]> {
    const provincias = await this.prisma.provincia.findMany({
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
  async listArbolDePais(paisId: string): Promise<ProvinciaPlataformaDTO[]> {
    const nodo = { id: true, nombre: true, codigoDta: true, ...SELECT_FLAG_PROPIO } as const;
    const provincias = await this.prisma.provincia.findMany({
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

  /**
   * El contexto del alta, o `null` si el contenedor no existe. UNA consulta por nivel resuelve las
   * preguntas del alta: el contenedor (R14), los hermanos (R15) y la regla de codigo (R17).
   *
   * Trae hermanos ACTIVOS E INACTIVOS: un nombre ocupado por un hermano retirado sigue ocupado,
   * porque el UNIQUE de la base no distingue estados y porque reactivarlo despues chocaria con el
   * nuevo.
   *
   * SL-20: el contenedor de una provincia es su PAIS. Antes eran todas las provincias de la tabla;
   * con dos paises, «Central» en uno no ocupa el nombre en el otro.
   */
  async findHermanos(
    nivel: NivelGeografico,
    contenedorId: string,
  ): Promise<ContextoDeAlta | null> {
    const hermanos = { select: { id: true, nombre: true } } as const;

    if (nivel === "provincia") {
      const pais = await this.prisma.pais.findUnique({
        where: { id: contenedorId },
        select: { id: true, ...SELECT_REGLA, provincias: hermanos },
      });
      if (pais === null) return null;
      return { paisId: pais.id, regla: reglaDe(pais), codigoPadre: null, hermanos: pais.provincias };
    }

    if (nivel === "canton") {
      const padre = await this.prisma.provincia.findUnique({
        where: { id: contenedorId },
        select: { paisId: true, codigoDta: true, pais: { select: SELECT_REGLA }, cantones: hermanos },
      });
      if (padre === null) return null;
      return {
        paisId: padre.paisId,
        regla: reglaDe(padre.pais),
        codigoPadre: padre.codigoDta,
        hermanos: padre.cantones,
      };
    }

    const padre = await this.prisma.canton.findUnique({
      where: { id: contenedorId },
      select: {
        paisId: true,
        codigoDta: true,
        provincia: { select: { pais: { select: SELECT_REGLA } } },
        distritos: hermanos,
      },
    });
    if (padre === null) return null;
    return {
      paisId: padre.paisId,
      regla: reglaDe(padre.provincia.pais),
      codigoPadre: padre.codigoDta,
      hermanos: padre.distritos,
    };
  }

  /**
   * Crea el nodo, devuelve su id y registra `nodo_geografico_creado` en el historial de plataforma
   * en la MISMA transaccion (SL-20, R33). Nace ACTIVO por el default de la columna (R13), tambien si
   * su padre esta retirado: el flag es suyo y la cascada se evalua aparte (R15).
   *
   * El padre se lee DENTRO de la tx por dos motivos: la etiqueta congelada es la cadena de nombres
   * hasta la raiz, y el pais del registro tiene que ser el del padre, que es el que el trigger
   * `geografia_pais_del_padre` le pone al hijo. Si no coincide con `opciones.paisId`, el llamador
   * se equivoco de pais y se lanza en vez de registrar un pais que no es.
   *
   * DEJA ESCAPAR la violacion de UNIQUE: el borde la traduce a `conflict`. La base es la ultima
   * palabra ante una carrera.
   */
  async crear(
    nivel: NivelGeografico,
    nombre: string,
    padreId: string | null,
    opciones: OpcionesDeAlta,
    actorUsuarioId: string | null,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const { id, etiqueta } = await crearFila(tx, nivel, nombre, padreId, opciones);
      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_creado",
          entidadTipo: nivel,
          entidadId: id,
          entidadEtiqueta: etiqueta,
          paisId: opciones.paisId,
          ...actor,
        },
      ]);
      return id;
    });
  }

  /** SL-20 — la geografia del pais en listas planas, para `planificarDivision`. */
  async leerDivisionDePais(paisId: string): Promise<DivisionDePais | null> {
    const pais = await this.prisma.pais.findUnique({ where: { id: paisId }, select: SELECT_REGLA });
    if (pais === null) return null;

    // Orden estable: `planificarDivision` se queda con el PRIMERO de dos homonimos normalizados
    // bajo el mismo padre (decision 4 de SL-20), y «el primero» tiene que ser siempre el mismo.
    const nodo = { id: true, nombre: true, codigoDta: true, ...SELECT_FLAG_PROPIO } as const;
    const [provincias, cantones, distritos] = await Promise.all([
      this.prisma.provincia.findMany({ where: { paisId }, select: nodo, orderBy: { id: "asc" } }),
      this.prisma.canton.findMany({
        where: { paisId },
        select: { ...nodo, provinciaId: true },
        orderBy: { id: "asc" },
      }),
      this.prisma.distrito.findMany({
        where: { paisId },
        select: { ...nodo, cantonId: true },
        orderBy: { id: "asc" },
      }),
    ]);

    return {
      regla: reglaDe(pais),
      arbol: {
        provincia: provincias.map((p) => nodoExistente(p, null)),
        canton: cantones.map((c) => nodoExistente(c, c.provinciaId)),
        distrito: distritos.map((d) => nodoExistente(d, d.cantonId)),
      },
    };
  }

  /**
   * SL-20 (R24, R26, R33) — escribe el plan de una carga CSV en UNA transaccion.
   *
   *   1. las altas por nivel, de arriba abajo, con un `createMany` por nivel. Los ids se generan
   *      AQUI porque el plan es puro y nombra a sus altas por una clave: un hijo cuyo padre es un
   *      alta del mismo archivo necesita el id del padre antes de que el padre exista;
   *   2. el codigo de los existentes, SOLO `WHERE codigo_dta IS NULL` (R26): si entre el plan y la
   *      escritura alguien le puso uno a mano, gana el suyo y no se cuenta como completado;
   *   3. una fila `division_cargada` si se escribio algo; si no, ninguna.
   *
   * No escribe `nombre` sobre nodos existentes ni toca `activo`: la carga solo crea (alternativa 6
   * del design). Cualquier error de la base deshace todo y se propaga.
   */
  async importarDivision(
    paisId: string,
    plan: PlanDivision,
    actorUsuarioId: string | null,
  ): Promise<ResumenCarga> {
    return this.prisma.$transaction(
      async (tx) => {
        const pais = await tx.pais.findUnique({ where: { id: paisId }, select: { nombre: true } });
        if (pais === null) throw new Error(`importarDivision: el pais ${paisId} no existe`);

        const ids = new IdsDelPlan();
        await tx.provincia.createMany({
          data: plan.altas.provincia.map((a) => ({
            id: ids.nuevo(a.clave),
            nombre: a.nombre,
            codigoDta: a.codigo,
            paisId,
          })),
        });
        await tx.canton.createMany({
          data: plan.altas.canton.map((a) => ({
            id: ids.nuevo(a.clave),
            nombre: a.nombre,
            codigoDta: a.codigo,
            provinciaId: ids.de(a.padre),
          })),
        });
        await tx.distrito.createMany({
          data: plan.altas.distrito.map((a) => ({
            id: ids.nuevo(a.clave),
            nombre: a.nombre,
            codigoDta: a.codigo,
            cantonId: ids.de(a.padre),
          })),
        });

        let codigosCompletados = 0;
        for (const { nivel, id, codigo } of plan.codigosACompletar) {
          const donde = { where: { id, codigoDta: null }, data: { codigoDta: codigo } };
          const { count } =
            nivel === "provincia"
              ? await tx.provincia.updateMany(donde)
              : nivel === "canton"
                ? await tx.canton.updateMany(donde)
                : await tx.distrito.updateMany(donde);
          codigosCompletados += count;
        }

        const resumen: ResumenCarga = { ...plan.resumen, codigosCompletados };
        const { provincia, canton, distrito } = resumen.creados;
        if (provincia + canton + distrito + codigosCompletados > 0) {
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
                creados: { provincia, canton, distrito },
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

  /**
   * FICHA 374 (R8/R21/R22/R51/R52/R53/R55) — cambia el flag `activo` de UNA fila y registra la
   * accion en la MISMA transaccion.
   *
   * LOS CINCO PASOS, EN ESTE ORDEN Y POR ESTE MOTIVO:
   *   1. leer el nodo -> `null` es «no existe» (R22), y de paso captura el estado previo Y las
   *      piezas de la etiqueta en una sola consulta;
   *   2. si el flag YA estaba asi, `sin_cambio` SIN ESCRIBIR NADA (R21/R53). «Se pidio» y «se
   *      hizo» son cosas distintas: es el precedente literal de `VehiculoRepository.delete`;
   *   3. el `update` — la UNICA escritura, y solo de ESTA fila (R8);
   *   4. congelar el actor dentro de la tx;
   *   5. `appendAccion` DENTRO del callback. Escrito fuera, el test no lo ve fallar (leccion de la
   *      ficha 373).
   *
   * R55 SALE GRATIS Y SIN NINGUN `try` DE RESCATE: dentro de una transaccion de Postgres un error
   * de sentencia aborta la transaccion entera, asi que no hay orden posible que deje el flag
   * cambiado y el registro sin escribir.
   *
   * `valorAnterior`/`valorNuevo` van en NULL a proposito: el PAR de tipos ya dice la transicion.
   */
  async cambiarActivacion(
    nivel: NivelGeografico,
    id: string,
    activo: boolean,
    actorUsuarioId: string | null,
  ): Promise<"no_existe" | "sin_cambio" | "cambiado"> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await leerNodoParaActivacion(tx, nivel, id);
      if (previo === null) return "no_existe";
      if (previo.activo === activo) return "sin_cambio";

      if (nivel === "provincia") {
        await tx.provincia.update({ where: { id }, data: { activo } });
      } else if (nivel === "canton") {
        await tx.canton.update({ where: { id }, data: { activo } });
      } else {
        await tx.distrito.update({ where: { id }, data: { activo } });
      }

      // SL-20 (R33, R35): al historial de PLATAFORMA. El superadmin no tiene empresa, y una fila en
      // `historial_accion` con un actor de otra empresa la rechaza la base (SL017).
      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: activo ? "nodo_geografico_activado" : "nodo_geografico_desactivado",
          entidadTipo: nivel,
          entidadId: id,
          entidadEtiqueta: etiquetaDelNodo(nivel, previo),
          paisId: previo.paisId,
          ...actor,
        },
      ]);
      return "cambiado";
    });
  }

  /**
   * Los hermanos del nodo `id` —INCLUIDO EL— o `null` si el nodo no existe. UNA consulta resuelve
   * las dos preguntas del renombrado: si el nodo existe y si el nombre nuevo esta cogido.
   *
   * PARTE DEL NODO Y NO DEL PADRE, que es lo que lo distingue de `findHermanos`: un renombrado
   * recibe `{nivel, id}` y no sabe quien es el padre. Sube al padre por la relacion y baja a sus
   * hijos en la misma consulta.
   */
  async findHermanosDeNodo(
    nivel: NivelGeografico,
    id: string,
  ): Promise<{ id: string; nombre: string }[] | null> {
    if (nivel === "provincia") {
      // SL-20 (R15): las hermanas de una provincia son las de SU pais, que hace de padre.
      const fila = await this.prisma.provincia.findUnique({
        where: { id },
        select: { pais: { select: { provincias: { select: { id: true, nombre: true } } } } },
      });
      return fila === null ? null : fila.pais.provincias;
    }

    if (nivel === "canton") {
      const fila = await this.prisma.canton.findUnique({
        where: { id },
        select: { provincia: { select: { cantones: { select: { id: true, nombre: true } } } } },
      });
      return fila === null ? null : fila.provincia.cantones;
    }

    const fila = await this.prisma.distrito.findUnique({
      where: { id },
      select: { canton: { select: { distritos: { select: { id: true, nombre: true } } } } },
    });
    return fila === null ? null : fila.canton.distritos;
  }

  /**
   * FICHA 375 — cambia el NOMBRE de UNA fila y registra la accion en la MISMA transaccion.
   *
   * Calcado de `cambiarActivacion`, y a proposito: son la misma forma (`abre_tx`) y el censo de
   * `historial-accion-escrituras-cubiertas` las mide igual.
   *
   *   1. leer el nodo -> `null` es «no existe», y de paso captura el nombre previo Y las piezas de
   *      la etiqueta en una sola consulta;
   *   2. si ya se llamaba EXACTAMENTE asi, `sin_cambio` SIN ESCRIBIR NADA. Guardar sin cambios
   *      tiene que funcionar, y «se pidio» no es «se hizo»;
   *   3. el `update` — la UNICA escritura, y SOLO de `nombre`;
   *   4. congelar el actor dentro de la tx;
   *   5. `appendAccion` DENTRO del callback.
   *
   * ⚠️ EL `data` DEL `update` LLEVA `nombre` Y NADA MAS. En particular NO lleva `codigoDta`: el
   * codigo es la identidad y el nombre la etiqueta. Tocarlo aqui reabriria el defecto que esta
   * ficha cierra —el seed volveria a no reconocer el nodo y lo duplicaria—.
   *
   * LA ETIQUETA DE LA FILA ES LA CADENA CON EL NOMBRE NUEVO (asi el registro identifica al nodo tal
   * y como se llama despues del acto, que es como el maestro lo ve en la pantalla) y el par
   * anterior/nuevo viaja en `valorAnterior`/`valorNuevo`, recortado a la anchura de esas columnas:
   * Postgres NO trunca, ABORTA.
   *
   * Deja escapar la violacion de UNIQUE: el borde la traduce a `conflict`.
   */
  async renombrar(
    nivel: NivelGeografico,
    id: string,
    nombre: string,
    actorUsuarioId: string | null,
  ): Promise<"no_existe" | "sin_cambio" | "renombrado"> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await leerNodoParaActivacion(tx, nivel, id);
      if (previo === null) return "no_existe";
      if (previo.nombre === nombre) return "sin_cambio";

      if (nivel === "provincia") {
        await tx.provincia.update({ where: { id }, data: { nombre } });
      } else if (nivel === "canton") {
        await tx.canton.update({ where: { id }, data: { nombre } });
      } else {
        await tx.distrito.update({ where: { id }, data: { nombre } });
      }

      const actor = await actorDePlataforma(tx, actorUsuarioId);
      await appendAccionPlataforma(tx, [
        {
          accion: "nodo_geografico_renombrado",
          entidadTipo: nivel,
          entidadId: id,
          entidadEtiqueta: etiquetaDelNodo(nivel, { ...previo, nombre }),
          paisId: previo.paisId,
          ...actor,
          // Las columnas miden GEO_NOMBRE_MAX; el recorte solo alcanza a un nombre heredado de antes
          // de esa cota, y Postgres no trunca: aborta.
          valorAnterior: previo.nombre.slice(0, GEO_NOMBRE_MAX),
          valorNuevo: nombre.slice(0, GEO_NOMBRE_MAX),
        },
      ]);
      return "renombrado";
    });
  }
}

/** El estado previo del nodo mas las piezas de su etiqueta, leidas de una vez. */
interface NodoPrevio {
  activo: boolean;
  nombre: string;
  /** SL-20: el pais del nodo, que va en la fila del historial de plataforma. */
  paisId: string;
  cantonNombre: string | null;
  provinciaNombre: string | null;
}

type GeoTx = Pick<GeoPrismaClient, "provincia" | "canton" | "distrito">;

async function leerNodoParaActivacion(
  tx: GeoTx,
  nivel: NivelGeografico,
  id: string,
): Promise<NodoPrevio | null> {
  if (nivel === "provincia") {
    const fila = await tx.provincia.findUnique({
      where: { id },
      select: { ...SELECT_FLAG_PROPIO, nombre: true, paisId: true },
    });
    return fila === null
      ? null
      : { ...fila, cantonNombre: null, provinciaNombre: null };
  }
  if (nivel === "canton") {
    const fila = await tx.canton.findUnique({
      where: { id },
      select: {
        ...SELECT_FLAG_PROPIO,
        nombre: true,
        paisId: true,
        provincia: { select: { nombre: true } },
      },
    });
    return fila === null
      ? null
      : {
          activo: fila.activo,
          nombre: fila.nombre,
          paisId: fila.paisId,
          cantonNombre: null,
          provinciaNombre: fila.provincia.nombre,
        };
  }
  const fila = await tx.distrito.findUnique({
    where: { id },
    select: {
      ...SELECT_FLAG_PROPIO,
      nombre: true,
      paisId: true,
      canton: { select: { nombre: true, provincia: { select: { nombre: true } } } },
    },
  });
  return fila === null
    ? null
    : {
        activo: fila.activo,
        nombre: fila.nombre,
        paisId: fila.paisId,
        cantonNombre: fila.canton.nombre,
        provinciaNombre: fila.canton.provincia.nombre,
      };
}

/**
 * La etiqueta CONGELADA del nodo: la cadena de nombres hasta la raiz.
 *
 * Se llama a `etiquetaDeEntidad` con el literal del nivel y no con la variable para que el tipo
 * de la fuente sea el de ESE nivel; un `etiquetaDeEntidad(nivel, …)` generico aceptaria una fuente
 * que no le corresponde.
 */
function etiquetaDelNodo(
  nivel: NivelGeografico,
  fila: Pick<NodoPrevio, "nombre" | "cantonNombre" | "provinciaNombre">,
): string {
  if (nivel === "provincia") return etiquetaDeEntidad("provincia", { nombre: fila.nombre });
  if (nivel === "canton") {
    return etiquetaDeEntidad("canton", {
      nombre: fila.nombre,
      provinciaNombre: fila.provinciaNombre,
    });
  }
  return etiquetaDeEntidad("distrito", {
    nombre: fila.nombre,
    cantonNombre: fila.cantonNombre,
    provinciaNombre: fila.provinciaNombre,
  });
}
