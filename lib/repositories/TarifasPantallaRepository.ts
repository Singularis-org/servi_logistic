import type { PrismaClient } from "@prisma/client";

import type {
  DistritoDeZona,
  GrupoDeEmpresa,
  ITarifasPantallaRepository,
  TiendaDePantalla,
  VehiculoDePantalla,
  ZonaDePantalla,
} from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
import { PROFUNDIDAD_DEL_NIVEL } from "@/lib/repositories/_shared/lugar-orden";
import { leerNodosDeZona } from "@/lib/repositories/_shared/zona-nodo";
import {
  esZonaEspecial,
  zonaQueCubre,
  type AsignacionesDeLaEmpresa,
  type CatalogoGeografico,
  type NodoDelCatalogo,
} from "@/lib/services/geografia-dominio";
import type { ArbolCubiertoDTO, NodoCubiertoDTO } from "@/lib/types/geografia-nodo";
import {
  leerModeloViejoCon,
  type LecturaModeloViejo,
  type PedidoModeloViejo,
} from "@/lib/repositories/_shared/resolver-tarifas";
import {
  SELECT_VALOR_DTO,
  valorADTO,
} from "@/lib/repositories/TarifaValorRepository";
import {
  esZonaEspecialDeLaEmpresa,
  SELECT_MARCA_ZONA_ESPECIAL,
} from "@/lib/repositories/_shared/zona-especial";
import type { ValorDeNivel } from "@/lib/tarifas/faltantes";
import { ROLES_TARIFABLES } from "@/lib/types/tarifa";
import type { GrupoDistritosDTO, TarifaValorDTO } from "@/lib/types/tarifa-flexible";
import { etiquetaDePersona } from "@/lib/types/historial-accion-etiquetas";

/**
 * SLT-54 (design §7) — las lecturas de `/configuracion/tarifas`. Sin `organizacion_id` en ningun `where`:
 * lo pone la extension del cliente y la RLS lo respalda (R12). No reutiliza `ZonaService.listar` porque
 * ese es solo del `maestro` (SLT-51 R2) y aqui lee tambien `admin`.
 */
type TarifasPantallaPrismaClient = ConstructorParameters<typeof GrupoDistritosRepository>[0] &
  Pick<
    PrismaClient,
    "tarifaActivacion" | "zona" | "zonaDistrito" | "grupoDistritos" | "tarifaValor" | "vehiculo" | "usuario" | "tarifa" | "tarifaZonaMensajero"
  >;

const SELECT_ZONA = { id: true, nombre: true, esCentral: true } as const;

/** `nivel_<k>` → k (P1 de SLT-46: el tipo de la profundidad k es el de clave `nivel_<k>`, como en `GeoRepository`). */
function profundidadDeClave(clave: string): number {
  const m = /^nivel_(\d+)$/.exec(clave);
  if (m === null) throw new Error(`tipo de nivel con clave inesperada: ${clave}`);
  return Number(m[1]);
}

/** SLT-89 (R23): un nodo cubierto por la zona y, debajo, lo que la zona tambien cubre. */
function nodoCubierto(
  catalogo: CatalogoGeografico,
  cubre: (n: NodoDelCatalogo) => boolean,
  n: NodoDelCatalogo,
): NodoCubiertoDTO {
  return {
    id: n.id,
    nombre: n.nombre,
    profundidad: n.profundidad,
    activo: n.activo,
    hijos: (catalogo.hijos.get(n.id) ?? []).filter(cubre).map((h) => nodoCubierto(catalogo, cubre, h)),
  };
}

/** Los nodos que la zona cubre cuyo padre no cubre: las raices del sub-arbol (design §4.4). */
function raicesCubiertas(
  catalogo: CatalogoGeografico,
  asignaciones: AsignacionesDeLaEmpresa,
  zonaId: string,
): { cubre: (n: NodoDelCatalogo) => boolean; raices: NodoDelCatalogo[] } {
  const cubre = (n: NodoDelCatalogo) => zonaQueCubre(catalogo, asignaciones, n.id)?.id === zonaId;
  const raices = catalogo.nodos.filter((n) => {
    if (!cubre(n)) return false;
    const padre = n.padreId === null ? undefined : catalogo.porId.get(n.padreId);
    return padre === undefined || !cubre(padre);
  });
  return { cubre, raices };
}

export class TarifasPantallaRepository implements ITarifasPantallaRepository {
  constructor(private readonly prisma: TarifasPantallaPrismaClient) {}

  async leerActivacion(): Promise<{ activadaAt: Date } | null> {
    return this.prisma.tarifaActivacion.findFirst({ select: { activadaAt: true } });
  }

  async listarZonas(): Promise<ZonaDePantalla[]> {
    return this.prisma.zona.findMany({ select: SELECT_ZONA, orderBy: { nombre: "asc" } });
  }

  async buscarZona(zonaId: string): Promise<ZonaDePantalla | null> {
    return this.prisma.zona.findFirst({ where: { id: zonaId }, select: SELECT_ZONA });
  }

  async listarGruposDeEmpresa(): Promise<GrupoDeEmpresa[]> {
    const filas = await this.prisma.grupoDistritos.findMany({
      select: { id: true, zonaId: true, nombre: true, _count: { select: { distritos: true } } },
      orderBy: { nombre: "asc" },
    });
    return filas.map(({ _count, ...g }) => ({ ...g, distritos: _count.distritos }));
  }

  async gruposConDistritos(zonaId: string): Promise<GrupoDistritosDTO[]> {
    // La misma lectura que usa el service de grupos: dos proyecciones de un grupo acabarian difiriendo.
    return new GrupoDistritosRepository(this.prisma).listar(zonaId);
  }

  async valoresDeZonaOGrupo(): Promise<ValorDeNivel[]> {
    return this.prisma.tarifaValor.findMany({
      where: { tiendaId: null, mensajeroId: null },
      select: { concepto: true, zonaId: true, grupoId: true, tiendaId: true, mensajeroId: true, vehiculoId: true },
    });
  }

  async valoresDeZona(zonaId: string): Promise<TarifaValorDTO[]> {
    const filas = await this.prisma.tarifaValor.findMany({
      where: { zonaId },
      select: SELECT_VALOR_DTO,
      orderBy: [{ concepto: "asc" }, { createdAt: "asc" }],
    });
    return filas.map(valorADTO);
  }

  async preciosDeTienda(): Promise<TarifaValorDTO[]> {
    const filas = await this.prisma.tarifaValor.findMany({
      where: { tiendaId: { not: null } },
      select: SELECT_VALOR_DTO,
      orderBy: [{ concepto: "asc" }, { createdAt: "asc" }],
    });
    return filas.map(valorADTO);
  }

  async listarVehiculos(): Promise<VehiculoDePantalla[]> {
    const filas = await this.prisma.vehiculo.findMany({ orderBy: { name: "asc" } });
    return filas.map((v) => ({ id: v.id, nombre: v.name, activo: v.activo }));
  }

  async listarTiendas(): Promise<TiendaDePantalla[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { rol: { value: { in: [...ROLES_TARIFABLES] } } },
      select: { id: true, nombre: true, primerApellido: true },
      orderBy: [{ nombre: "asc" }, { primerApellido: "asc" }],
    });
    return filas.map((u) => ({ id: u.id, nombre: etiquetaDePersona(u) }));
  }

  async distritosDeZona(zonaId: string, opciones: { conMarca: boolean }): Promise<DistritoDeZona[]> {
    const porNombre = (a: DistritoDeZona, b: DistritoDeZona) => a.nombre.localeCompare(b.nombre);
    // SLT-89 (R23, design §4.4): una zona con nodos que no son distritos cubre ademas los distritos que
    // cuelgan de ellos (salvo las excepciones de otra zona). Sin ninguno, ni el catalogo se carga: la
    // lectura de abajo es la de hoy (R38).
    if ((await leerNodosDeZona(this.prisma, zonaId)).length > 0) {
      const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(this.prisma).deLaEmpresa();
      return catalogo.nodos
        .filter(
          (n) =>
            n.profundidad === PROFUNDIDAD_DEL_NIVEL.distrito &&
            zonaQueCubre(catalogo, asignaciones, n.id)?.id === zonaId,
        )
        .map((n) => ({
          id: n.id,
          nombre: n.nombre,
          zonaEspecial: opciones.conMarca && esZonaEspecial(catalogo, asignaciones, n.id),
        }))
        .sort(porNombre);
    }
    if (!opciones.conMarca) {
      const filas = await this.prisma.zonaDistrito.findMany({
        where: { zonaId },
        select: { distrito: { select: { id: true, nombre: true } } },
      });
      return filas.map(({ distrito }) => ({ ...distrito, zonaEspecial: false })).sort(porNombre);
    }
    const filas = await this.prisma.zonaDistrito.findMany({
      where: { zonaId },
      select: { distrito: { select: { id: true, nombre: true, ...SELECT_MARCA_ZONA_ESPECIAL } } },
    });
    return filas
      .map(({ distrito: d }) => ({ id: d.id, nombre: d.nombre, zonaEspecial: esZonaEspecialDeLaEmpresa(d) }))
      .sort(porNombre);
  }

  /**
   * SLT-89 (R23, design §4.4) — el sub-arbol que la zona cubre (asignado y heredado, sin las
   * excepciones de otra zona), con los nombres de nivel del pais. Una carga del catalogo, en memoria.
   */
  async nodosDeZona(zonaId: string): Promise<ArbolCubiertoDTO | null> {
    // Una zona sin nodos que no son distritos, y sin nada debajo de sus distritos, no tiene mas
    // posibles miembros que sus distritos asignados: `null`, sin cargar el catalogo (R38).
    if ((await leerNodosDeZona(this.prisma, zonaId)).length === 0) {
      const distritos = await this.prisma.zonaDistrito.findMany({ where: { zonaId }, select: { distritoId: true } });
      const debajo =
        distritos.length === 0
          ? 0
          : await this.prisma.nodoGeografico.count({ where: { padreId: { in: distritos.map((d) => d.distritoId) } } });
      if (debajo === 0) return null;
    }
    const { catalogo, asignaciones } = await new CatalogoGeograficoRepository(this.prisma).deLaEmpresa();
    const { cubre, raices } = raicesCubiertas(catalogo, asignaciones, zonaId);
    return {
      tipos: [...catalogo.tipos]
        .map((t) => ({
          profundidad: profundidadDeClave(t.clave),
          nombreSingular: t.nombreSingular,
          nombrePlural: t.nombrePlural,
        }))
        .sort((a, b) => a.profundidad - b.profundidad),
      raices: raices.map((n) => nodoCubierto(catalogo, cubre, n)),
    };
  }

  async leerModeloViejo(pedido: PedidoModeloViejo): Promise<LecturaModeloViejo> {
    return leerModeloViejoCon(this.prisma, pedido);
  }
}
