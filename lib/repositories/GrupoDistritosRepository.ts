import type { Prisma, PrismaClient } from "@prisma/client";

import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { esViolacionDeClaveForanea } from "@/lib/repositories/_shared/prisma-fk";
import { esViolacionDeUnico, textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";
import { etiquetaDeEntidad, valorDeCatalogo } from "@/lib/types/historial-accion-etiquetas";
import type { GrupoDistritosDTO } from "@/lib/types/tarifa-flexible";
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
 */
type GrupoDistritosPrismaClient = Pick<
  PrismaClient,
  | "grupoDistritos"
  | "grupoDistritosDistrito"
  | "zona"
  | "zonaDistrito"
  | "distrito"
  | "usuario"
  | "$transaction"
  | "historialAccion"
>;

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
      _count: { select: { distritos: true, valores: true } },
    },
  });
  if (fila === null) return null;
  return {
    nombre: fila.nombre,
    etiqueta: etiquetaDeEntidad("grupo_distritos", { nombre: fila.nombre, zonaNombre: fila.zona.nombre }),
    distritos: fila._count.distritos,
    valores: fila._count.valores,
  };
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

  async distritosDeLaZona(zonaId: string, distritoIds: readonly string[]): Promise<string[]> {
    const filas = await this.prisma.zonaDistrito.findMany({
      where: { zonaId, distritoId: { in: [...distritoIds] } },
      select: { distritoId: true },
    });
    return filas.map((f) => f.distritoId);
  }

  async nombresDeDistritos(distritoIds: readonly string[]): Promise<Map<string, string>> {
    const filas = await this.prisma.distrito.findMany({
      where: { id: { in: [...distritoIds] } },
      select: { id: true, nombre: true },
    });
    return new Map(filas.map((f) => [f.id, f.nombre]));
  }

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
    return filas.map((f) => ({
      distritoId: f.distritoId,
      distritoNombre: f.zonaDistrito.distrito.nombre,
      grupoNombre: f.grupo.nombre,
    }));
  }

  /** R10/R11 — el grupo y sus distritos, y `grupo_distritos_creado`, en UNA transaccion. */
  async crear(datos: CrearGrupoDatos, actorUsuarioId: string | null): Promise<CrearGrupoResultado> {
    // El `try` envuelve la transaccion entera: una sentencia fallida aborta la tx de Postgres y
    // capturarla por dentro dejaria la tx inservible (precedente `TarifaRepository.hardDelete`).
    try {
      return await this.prisma.$transaction(async (tx) => {
        const grupo = await tx.grupoDistritos.create({
          data: { zonaId: datos.zonaId, nombre: datos.nombre },
          select: { id: true },
        });
        await tx.grupoDistritosDistrito.createMany({
          data: datos.distritoIds.map((distritoId) => ({ grupoId: grupo.id, zonaId: datos.zonaId, distritoId })),
        });

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

  /** R10 — el nombre nuevo, y `grupo_distritos_cambiado` con el nombre de antes y el de ahora. */
  async renombrar(
    id: string,
    nombre: string,
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "nombre_repetido"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const antes = await grupoConZona(tx, id);
        if (antes === null) return "not_found" as const;

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
   */
  async fijarDistritos(
    id: string,
    distritoIds: readonly string[],
    actorUsuarioId: string | null,
  ): Promise<"ok" | "not_found" | "distrito_rechazado"> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const grupo = await tx.grupoDistritos.findFirst({
          where: { id },
          select: { zonaId: true, distritos: { select: { distritoId: true } } },
        });
        if (grupo === null) return "not_found" as const;

        const actuales = new Set(grupo.distritos.map((d) => d.distritoId));
        const pedidos = new Set(distritoIds);
        const salen = [...actuales].filter((d) => !pedidos.has(d));
        const entran = [...pedidos].filter((d) => !actuales.has(d));

        await tx.grupoDistritosDistrito.deleteMany({ where: { grupoId: id, distritoId: { in: salen } } });
        await tx.grupoDistritosDistrito.createMany({
          data: entran.map((distritoId) => ({ grupoId: id, zonaId: grupo.zonaId, distritoId })),
        });

        const congelado = await grupoConZona(tx, id);
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "grupo_distritos_cambiado",
            entidadTipo: "grupo_distritos",
            entidadId: id,
            entidadEtiqueta: congelado?.etiqueta ?? id,
            ...actor,
            valorAnterior: valorDeCatalogo(textoDistritos(actuales.size)),
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
   * R12 — borrado fisico: distritos y valores se van por CASCADE. La etiqueta y los conteos se leen
   * ANTES del `DELETE`; el historial dice cuantos valores se fueron con el grupo.
   */
  async borrar(id: string, actorUsuarioId: string | null): Promise<"ok" | "not_found"> {
    return this.prisma.$transaction(async (tx) => {
      const antes = await grupoConZona(tx, id);
      if (antes === null) return "not_found" as const;

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
      },
      orderBy: { nombre: "asc" },
    });
    return filas.map((f) => ({
      id: f.id,
      zonaId: f.zonaId,
      nombre: f.nombre,
      distritos: f.distritos
        .map((d) => ({ id: d.distritoId, nombre: d.zonaDistrito.distrito.nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    }));
  }
}
