// Feature 91 (design §5) — repositorio de los datos de geocodificacion de una orden.
// SOLO queries Prisma (docs/architecture.md §Repository): ninguna decision de negocio.
import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  IOrdenGeocodeRepository,
  OrdenGeocodeRow,
  OrdenGeocodeUpdate,
} from "@/lib/interfaces/repositories/IOrdenGeocodeRepository";
import {
  CatalogoGeograficoRepository,
  type CatalogoPrismaClient,
} from "@/lib/repositories/CatalogoGeograficoRepository";
import { rutaDelLugar } from "@/lib/repositories/_shared/ruta-del-lugar";

// Cliente Prisma MINIMO consumido (patron `ApiKeyRepository`/`JobRepository`), mas los modelos del
// catalogo (SLT-125): la ruta se nombra con el catalogo de la empresa.
type OrdenGeocodePrismaClient = Pick<PrismaClient, "orden"> & CatalogoPrismaClient;

export class OrdenGeocodeRepository implements IOrdenGeocodeRepository {
  // SLT-125 (R20): el catalogo, uno por instancia y creado al primer uso; quien solo escribe el
  // resultado (`guardarResultado`) no lo carga.
  private catalogoRepo: CatalogoGeograficoRepository | null = null;

  constructor(private readonly prisma: OrdenGeocodePrismaClient) {}

  private catalogoGeografico(): CatalogoGeograficoRepository {
    return (this.catalogoRepo ??= new CatalogoGeograficoRepository(this.prisma));
  }

  async findParaGeocodificar(ordenId: string): Promise<OrdenGeocodeRow | null> {
    const row = await this.prisma.orden.findFirst({
      // R30: una orden borrada se comporta como inexistente.
      where: { id: ordenId, deletedAt: null },
      // SLT-125 (design §4.5; R19, R32): las FK del lugar (`lugarDeLaOrden`) para la ruta del
      // catalogo, no las relaciones viejas ni `nodo_geografico_id`; y el nombre del pais de la
      // empresa, que reemplaza la constante que la consulta llevaba fija.
      select: {
        id: true,
        direccion: true,
        cantonId: true,
        distritoId: true,
        organizacion: { select: { pais: { select: { nombre: true } } } },
      },
    });
    if (row === null) return null;
    // El catalogo de la empresa del contexto (R40): en plataforma lanza `EmpresaNoResuelta`, y un lugar
    // de otro pais no esta en el y deja la ruta vacia.
    const { catalogo } = await this.catalogoGeografico().deLaEmpresa();
    return {
      id: row.id,
      direccion: row.direccion,
      ruta: rutaDelLugar(catalogo, row).map((paso) => paso.nombre),
      paisNombre: row.organizacion.pais.nombre,
    };
  }

  async guardarResultado(ordenId: string, data: OrdenGeocodeUpdate): Promise<void> {
    // `updateMany` (no `update`) para NO lanzar si la orden desaparecio entre la lectura
    // y la escritura: 0 filas afectadas es un desenlace valido, no un error.
    await this.prisma.orden.updateMany({
      where: { id: ordenId, deletedAt: null },
      data: {
        latitud: data.latitud !== null ? new Prisma.Decimal(data.latitud) : null,
        longitud: data.longitud !== null ? new Prisma.Decimal(data.longitud) : null,
        geocodePrecision: data.precision,
        geocodeStatus: data.status,
        geocodedAt: data.geocodedAt,
      },
    });
  }
}
