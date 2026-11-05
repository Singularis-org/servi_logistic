import type { PrismaClient } from "@prisma/client";

import type {
  DistritoDeZona,
  GrupoDeEmpresa,
  ITarifasPantallaRepository,
  TiendaDePantalla,
  VehiculoDePantalla,
  ZonaDePantalla,
} from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import { GrupoDistritosRepository } from "@/lib/repositories/GrupoDistritosRepository";
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

  async leerModeloViejo(pedido: PedidoModeloViejo): Promise<LecturaModeloViejo> {
    return leerModeloViejoCon(this.prisma, pedido);
  }
}
