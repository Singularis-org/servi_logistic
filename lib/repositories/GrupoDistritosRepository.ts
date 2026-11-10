import type { Prisma, PrismaClient } from "@prisma/client";

import {
  CatalogoGeograficoRepository,
  type CatalogoPrismaClient,
} from "@/lib/repositories/CatalogoGeograficoRepository";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { PROFUNDIDAD_DEL_NIVEL } from "@/lib/repositories/_shared/lugar-orden";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";
import { esViolacionDeUnico, textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import {
  borrarMiembrosNodoDeGrupo,
  crearMiembrosNodo,
  leerMiembrosNodo,
  leerMiembrosNodoEnOtroGrupo,
} from "@/lib/repositories/_shared/zona-nodo";
import { mismoConjunto, zonaQueCubre } from "@/lib/services/geografia-dominio";
import { etiquetaDeEntidad, valorDeCatalogo } from "@/lib/types/historial-accion-etiquetas";
import type { AntesDeBorrar, AntesDeMiembros, GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";
import type {
  CrearGrupoDatos,
  CrearGrupoResultado,
  DistritoEnOtroGrupo,
  GrupoDistritosFila,
  IGrupoDistritosRepository,
  RechazoDeLaBase,
} from "@/lib/interfaces/repositories/IGrupoDistritosRepository";

/**
 * SLT-52 (design §8, R10-R12) — `grupo_distritos` y `grupo_distritos_distrito`. Sin
 * `organizacion_id` en ningun `where`: lo pone la extension del cliente y la RLS lo respalda (R15).
 *
 * Cada escritura registra su accion DENTRO de su transaccion con `appendAccion` (R14).
 *
 * SLT-89 (design §2.2, §5.2, §5.4) — y `grupo_distritos_nodo`: un miembro que es un distrito asignado a
 * la zona (fila en `zona_distrito`) va en la tabla vieja, como hoy; cualquier otro (canton, provincia,
 * profundidad >= 4 o distrito heredado) en la nueva. Renombrar, fijar miembros y borrar comparan el
 * «antes» que mostro el modal bajo el candado de la fila del grupo (`FOR UPDATE`): el candado choca con
 * el `FOR KEY SHARE` que toma insertar un miembro o un valor que apunta al grupo, asi que lo comparado
 * sigue valiendo al escribir.
 */
type GrupoDistritosPrismaClient = Pick<
  PrismaClient,
  | "grupoDistritos"
  | "grupoDistritosDistrito"
  | "grupoDistritosNodo"
  | "zona"
  | "zonaDistrito"
  | "distrito"
  | "nodoGeografico"
  | "usuario"
  | "$transaction"
  | "$queryRaw"
  | "historialAccion"
> &
  // SLT-89 (R17): la cobertura de un miembro heredado sale del catalogo de SLT-44.
  CatalogoPrismaClient;

type TxGrupo = Pick<Prisma.TransactionClient, "grupoDistritos">;

/** El grupo con el nombre de su zona, para la etiqueta CONGELADA. `null` si ya no existe. */
async function grupoConZona(
  tx: TxGrupo,
  id: string,
): Promise<{ nombre: string; etiqueta: string; distritos: number; valores: number } | null> {
  const fila = await tx.grupoDistritos.findFirst({
    where: { id },
    select: {
      nombre: true,
      zona: { select: { nombre: true } },
      _count: { select: { distritos: true, nodos: true, valores: true } },
    },
  });
  if (fila === null) return null;
  return {
    nombre: fila.nombre,
    etiqueta: etiquetaDeEntidad("grupo_distritos", { nombre: fila.nombre, zonaNombre: fila.zona.nombre }),
    // SLT-89 (R31): todos los miembros, de las dos tablas. Sin miembros nuevos, el numero de hoy.
    distritos: fila._count.distritos + fila._count.nodos,
    valores: fila._count.valores,
  };
}

/** SLT-89 (R43, R45): los miembros que el grupo tiene hoy, de las dos tablas. */
async function miembrosDelGrupo(
  tx: Pick<Prisma.TransactionClient, "grupoDistritosDistrito" | "grupoDistritosNodo">,
  grupoId: string,
): Promise<{ distritos: string[]; nodos: string[] }> {
  const distritos = await tx.grupoDistritosDistrito.findMany({ where: { grupoId }, select: { distritoId: true } });
  const nodos = await leerMiembrosNodo(tx, { grupoId });
  return { distritos: distritos.map((d) => d.distritoId), nodos: nodos.map((n) => n.nodoId) };
}

/**
 * SLT-89 (design §5.4): el candado de la fila del grupo, antes de comparar el «antes». SQL a mano: la
 * extension no lo ve, asi que filtra por la empresa de la transaccion ademas de la RLS (SL-17 R25). Un
 * grupo de otra empresa no se bloquea y el `findFirst` que sigue lo da por inexistente.
 */
async function bloquearGrupo(tx: Pick<Prisma.TransactionClient, "$queryRaw">, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "grupo_distritos"
    WHERE "id" = ${id} AND "organizacion_id" = current_setting('app.organizacion_id', true)
    FOR UPDATE`;
}

/**
 * SLT-89 (design §5.2) — de `ids`, los distritos con fila en `zona_distrito` de la zona: van a la tabla
 * vieja. El resto, a `grupo_distritos_nodo`.
 */
async function asignadosALaZona(
  tx: Pick<Prisma.TransactionClient, "zonaDistrito">,
  zonaId: string,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const filas = await tx.zonaDistrito.findMany({
    where: { zonaId, distritoId: { in: [...ids] } },
    select: { distritoId: true },
  });
  return new Set(filas.map((f) => f.distritoId));
}

function textoDistritos(n: number): string {
  return n === 1 ? "1 distrito" : `${n} distritos`;
}

/**
 * Lo que la base rechaza aunque el service ya lo haya comprobado (una carrera): el unico del nombre
 * (R10) o el unico / la FK compuesta de los distritos (R11). Con el driver adapter el P2002 puede
 * llegar sin el texto del constraint; ahi no se puede saber cual fue y se toma como distrito, que es
 * el unico de los dos que la FK tambien produce.
 */
function rechazoDeLaBase(e: unknown): RechazoDeLaBase | null {
  if (textoConstraintP2002(e)?.includes("nombre")) return "nombre_repetido";
  if (esViolacionDeUnico(e) || esViolacionDeClaveForanea(e)) return "distrito_rechazado";
  return null;
}

export class GrupoDistritosRepository implements IGrupoDistritosRepository {
  constructor(private readonly prisma: GrupoDistritosPrismaClient) {}

  async existeZona(zonaId: string): Promise<boolean> {
    const fila = await this.prisma.zona.findFirst({ where: { id: zonaId }, select: { id: true } });
    return fila !== null;
  }

  async buscar(id: string): Promise<GrupoDistritosFila | null> {
    return this.prisma.grupoDistritos.findFirst({
      where: { id },
      select: { id: true, zonaId: true, nombre: true },
    });
  }

  async nombreOcupado(zonaId: string, nombre: string, exceptoId: string | null): Promise<boolean> {
    const fila = await this.prisma.grupoDistritos.findFirst({
      where: { zonaId, nombre, ...(exceptoId === null ? {} : { id: { not: exceptoId } }) },
      select: { id: true },
    });
    return fila !== null;
  }

  /**
   * SLT-89 (R17, design §4.4) — de `ids`, los que la zona CUBRE (asignados o heredados, a cualquier
   * profundidad). Primero `zona_distrito`, como hoy; solo si queda alguno sin asignacion propia se
   * carga el catalogo y se pregunta `zonaQueCubre`. Con asignaciones solo a distritos (Costa Rica, R38)
   * un id valido nunca llega a esa segunda parte.
   */
  async distritosDeLaZona(zonaId: string, distritoIds: readonly string[]): Promise<string[]> {
    const filas = await this.prisma.zonaDistrito.findMany({
      where: { zonaId, distritoId: { in: [...distritoIds] } },
      select: { distritoId: true },
    });
    const asignados = filas.map((f) => f.distritoId);
    const resto = distritoIds.filter((id) => !asignados.includes(id));
    if (resto.length === 0) return asignados;
    const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(this.prisma).deLaEmpresa();
    return [...asignados, ...resto.filter((id) => zonaQueCubre(catalogo, asignaciones, id)?.id === zonaId)];
  }

  /**
   * El nombre de cada distrito del catalogo, para nombrarlo en el error (R11). SLT-89 (R18): un id que
   * no es distrito (un canton, un nodo de profundidad 4) se nombra con el nombre de su nodo.
   */
  async nombresDeDistritos(distritoIds: readonly string[]): Promise<Map<string, string>> {
    const filas = await this.prisma.distrito.findMany({
      where: { id: { in: [...distritoIds] } },
      select: { id: true, nombre: true },
    });
    const nombres = new Map(filas.map((f) => [f.id, f.nombre]));
    const sinNombre = distritoIds.filter((id) => !nombres.has(id));
    if (sinNombre.length > 0) {
      const nodos = await this.prisma.nodoGeografico.findMany({
        where: { id: { in: sinNombre } },
        select: { id: true, nombre: true },
      });
      for (const n of nodos) nombres.set(n.id, n.nombre);
    }
    return nombres;
  }

  /** SLT-89 (R18): mira las dos tablas de miembros. Sin miembros nuevos, la lectura de hoy. */
  async distritosEnOtroGrupo(
    zonaId: string,
    distritoIds: readonly string[],
    exceptoGrupoId: string | null,
  ): Promise<DistritoEnOtroGrupo[]> {
    const filas = await this.prisma.grupoDistritosDistrito.findMany({
      where: {
        zonaId,
        distritoId: { in: [...distritoIds] },
        ...(exceptoGrupoId === null ? {} : { grupoId: { not: exceptoGrupoId } }),
      },
      select: {
        distritoId: true,
        grupo: { select: { nombre: true } },
        zonaDistrito: { select: { distrito: { select: { nombre: true } } } },
      },
    });
    const deLaVieja = filas.map((f) => ({
      distritoId: f.distritoId,
      distritoNombre: f.zonaDistrito.distrito.nombre,
      grupoNombre: f.grupo.nombre,
    }));
    return [...deLaVieja, ...(await leerMiembrosNodoEnOtroGrupo(this.prisma, zonaId, distritoIds, exceptoGrupoId))];
  }

  /**
   * R10/R11 — el grupo y sus miembros, y `grupo_distritos_creado`, en UNA transaccion. SLT-89 (R17):
   * `distritoIds` son todos los miembros pedidos; los asignados a la zona van a la tabla vieja y el
   * resto a `grupo_distritos_nodo`.
   */
  async crear(datos: CrearGrupoDatos, actorUsuarioId: string | null): Promise<CrearGrupoResultado> {
    // El `try` envuelve la transaccion entera: una sentencia fallida aborta la tx de Postgres y
    // capturarla por dentro dejaria la tx inservible (precedente `TarifaRepository.hardDelete`).
    try {
      return await this.prisma.$transaction(async (tx) => {
        const grupo = await tx.grupoDistritos.create({
          data: { zonaId: datos.zonaId, nombre: datos.nombre },
          select: { id: true },
        });
        const asignados = await asignadosALaZona(tx, datos.zonaId, datos.distritoIds);
        await tx.grupoDistritosDistrito.createMany({
          data: datos.distritoIds
            .filter((d) => asignados.has(d))
            .map((distritoId) => ({ grupoId: grupo.id, zonaId: datos.zonaId, distritoId })),
        });
        await crearMiembrosNodo(
          tx,
          datos.distritoIds
            .filter((d) => !asignados.has(d))
            .map((nodoId) => ({ grupoId: grupo.id, zonaId: datos.zonaId, nodoId })),
        );

        const congelado = await grupoConZona(tx, grupo.id);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "grupo_distritos_creado",
            entidadTipo: "grupo_distritos",
            entidadId: grupo.id,
            entidadEtiqueta: congelado?.etiqueta ?? datos.nombre,
            ...actor,
            valorAnterior: null,
            valorNuevo: valorDeCatalogo(textoDistritos(datos.distritoIds.length)),
          },
        ]);
        return { status: "ok" as const, id: grupo.id };
      });
    } catch (e) {
      const rechazo = rechazoDeLaBase(e);
      if (rechazo === null) throw e;
      return { status: rechazo };
    }
  }

  /**
   * R10 — el nombre nuevo, y `grupo_distritos_cambiado` con el nombre de antes y el de ahora.
   *
   * SLT-89 (R44, design §5.4): bajo el candado, si el nombre en la base no es ni el que el modal mostro
   * (`nombreAnterior`) ni el pedido, `cambio_concurrente` sin escribir nada. Si ya es el pedido, sigue
   * como hoy.
   */
  async renombrar(
    id: string,
    nombre: string,
    nombreAnterior: string,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "nombre_repetido" | "cambio_concurrente"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await bloquearGrupo(tx, id);
        const antes = await grupoConZona(tx, id);
        if (antes === null) return "not_found" as const;
        if (antes.nombre !== nombre && antes.nombre !== nombreAnterior) return "cambio_concurrente" as const;

        await tx.grupoDistritos.update({ where: { id }, data: { nombre }, select: { id: true } });

        const despues = await grupoConZona(tx, id);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "grupo_distritos_cambiado",
            entidadTipo: "grupo_distritos",
            entidadId: id,
            entidadEtiqueta: despues?.etiqueta ?? antes.etiqueta,
            ...actor,
            valorAnterior: valorDeCatalogo(antes.nombre),
            valorNuevo: valorDeCatalogo(nombre),
          },
        ]);
        return "ok" as const;
      });
    } catch (e) {
      if (textoConstraintP2002(e)?.includes("nombre") || esViolacionDeUnico(e)) return "nombre_repetido";
      throw e;
    }
  }

  /**
   * R11 — reemplaza el conjunto: borra solo los que salen y crea solo los que entran (los que se
   * quedan no se tocan). `grupo_distritos_cambiado` con cuantos habia y cuantos quedan.
   *
   * SLT-89 (R17, R31, R43; design §5.2, §5.4): bajo el candado, si los miembros en la base (las dos
   * tablas) no son el `antes`, `cambio_concurrente` sin escribir. Cada miembro va a su tabla por
   * diferencia, y el historial cuenta los de las dos.
   */
  async fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    antesDelModal: AntesDeMiembros,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "distrito_rechazado" | "cambio_concurrente"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await bloquearGrupo(tx, id);
        const grupo = await tx.grupoDistritos.findFirst({
          where: { id },
          select: { zonaId: true, distritos: { select: { distritoId: true } } },
        });
        if (grupo === null) return "not_found" as const;
        const nodosActuales = (await leerMiembrosNodo(tx, { grupoId: id })).map((m) => m.nodoId);
        const actualesDeLaVieja = grupo.distritos.map((d) => d.distritoId);
        if (
          !mismoConjunto(
            [...actualesDeLaVieja, ...nodosActuales],
            [...antesDelModal.distritoIds, ...antesDelModal.nodoIds],
          )
        ) {
          return "cambio_concurrente" as const;
        }

        const pedidos = new Set(distritoIds);
        const asignados = await asignadosALaZona(tx, grupo.zonaId, [...pedidos]);
        const actuales = new Set(actualesDeLaVieja);
        const salen = [...actuales].filter((d) => !pedidos.has(d) || !asignados.has(d));
        const entran = [...pedidos].filter((d) => asignados.has(d) && !actuales.has(d));
        const nodos = new Set(nodosActuales);
        const salenNodos = [...nodos].filter((n) => !pedidos.has(n) || asignados.has(n));
        const entranNodos = [...pedidos].filter((n) => !asignados.has(n) && !nodos.has(n));

        await tx.grupoDistritosDistrito.deleteMany({ where: { grupoId: id, distritoId: { in: salen } } });
        await borrarMiembrosNodoDeGrupo(tx, id, salenNodos);
        await tx.grupoDistritosDistrito.createMany({
          data: entran.map((distritoId) => ({ grupoId: id, zonaId: grupo.zonaId, distritoId })),
        });
        await crearMiembrosNodo(
          tx,
          entranNodos.map((nodoId) => ({ grupoId: id, zonaId: grupo.zonaId, nodoId })),
        );

        const congelado = await grupoConZona(tx, id);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "grupo_distritos_cambiado",
            entidadTipo: "grupo_distritos",
            entidadId: id,
            entidadEtiqueta: congelado?.etiqueta ?? id,
            ...actor,
            valorAnterior: valorDeCatalogo(textoDistritos(actuales.size + nodos.size)),
            valorNuevo: valorDeCatalogo(textoDistritos(pedidos.size)),
          },
        ]);
        return "ok" as const;
      });
    } catch (e) {
      if (rechazoDeLaBase(e) === null) throw e;
      return "distrito_rechazado";
    }
  }

  /**
   * R12 — borrado fisico: miembros y valores se van por CASCADE. La etiqueta y los conteos se leen
   * ANTES del `DELETE`; el historial dice cuantos valores se fueron con el grupo.
   *
   * SLT-89 (R45, design §5.4): bajo el candado, si el nombre, los miembros o el numero de valores no
   * son los que el modal mostro, `cambio_concurrente`: no se borra nada ni se escribe historial.
   */
  async borrar(
    id: string,
    antesDelModal: AntesDeBorrar,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "cambio_concurrente"> {
    return this.prisma.$transaction(async (tx) => {
      await bloquearGrupo(tx, id);
      const antes = await grupoConZona(tx, id);
      if (antes === null) return "not_found" as const;
      const miembros = await miembrosDelGrupo(tx, id);
      if (
        antes.nombre !== antesDelModal.nombre ||
        antes.valores !== antesDelModal.valores ||
        !mismoConjunto(
          [...miembros.distritos, ...miembros.nodos],
          [...antesDelModal.distritoIds, ...antesDelModal.nodoIds],
        )
      ) {
        return "cambio_concurrente" as const;
      }

      const borrados = await tx.grupoDistritos.deleteMany({ where: { id } });
      if (borrados.count === 0) return "not_found" as const;

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "grupo_distritos_borrado",
          entidadTipo: "grupo_distritos",
          entidadId: id,
          entidadEtiqueta: antes.etiqueta,
          ...actor,
          valorAnterior: valorDeCatalogo(
            `${textoDistritos(antes.distritos)}, ${antes.valores === 1 ? "1 valor" : `${antes.valores} valores`}`,
          ),
          valorNuevo: null,
        },
      ]);
      return "ok" as const;
    });
  }

  /**
   * SLT-89 (design §4.4): `distritos` junta los distritos de las dos tablas (asignados y heredados) y
   * `nodos` los demas miembros, con su profundidad. `nodos` solo viaja si hay alguno: con miembros
   * solo distritos asignados el DTO es el de hoy (R38).
   */
  async listar(zonaId: string): Promise<GrupoDistritosDTO[]> {
    const filas = await this.prisma.grupoDistritos.findMany({
      where: { zonaId },
      select: {
        id: true,
        zonaId: true,
        nombre: true,
        distritos: {
          select: { distritoId: true, zonaDistrito: { select: { distrito: { select: { nombre: true } } } } },
        },
        nodos: { select: { nodoGeografico: { select: { id: true, nombre: true, profundidad: true } } } },
      },
      orderBy: { nombre: "asc" },
    });
    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre);
    return filas.map((f) => {
      const heredados = f.nodos.map((n) => n.nodoGeografico);
      const nodos = heredados.filter((n) => n.profundidad !== PROFUNDIDAD_DEL_NIVEL.distrito).sort(porNombre);
      return {
        id: f.id,
        zonaId: f.zonaId,
        nombre: f.nombre,
        distritos: [
          ...f.distritos.map((d) => ({ id: d.distritoId, nombre: d.zonaDistrito.distrito.nombre })),
          ...heredados
            .filter((n) => n.profundidad === PROFUNDIDAD_DEL_NIVEL.distrito)
            .map((n) => ({ id: n.id, nombre: n.nombre })),
        ].sort(porNombre),
        ...(nodos.length > 0 ? { nodos } : {}),
      };
    });
  }
}
