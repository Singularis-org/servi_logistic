import type { PrismaClient } from "@prisma/client";

import type {
  DistritoCoberturaRow,
  ICoberturaRepository,
} from "@/lib/interfaces/repositories/ICoberturaRepository";
import type { ClienteDeMarcas } from "@/lib/repositories/_shared/zona-especial";
import { CatalogoGeograficoRepository } from "@/lib/repositories/CatalogoGeograficoRepository";
import {
  ancestros,
  esZonaEspecial,
  estaActivo,
  nodosDeProfundidad,
  zonasCandidatas,
} from "@/lib/services/geografia-dominio";

// Ficha 465 (design §3.2) — las dos lecturas del Excel de cobertura. Solo lectura; la regla
// (cobertura, motivo, colapso de zonas) vive en `lib/utils/cobertura-distrito.ts`.
//
// Repositorio DEDICADO y no un metodo mas de `GeoRepository`: mezclaria tarifas en el repositorio
// del catalogo y creceria una interfaz con un composition root ya sensible (design §6.2).
//
// SLT-44 (design §5, R20): los distritos salen del catalogo de la empresa. El cliente gana los
// modelos del nodo, de las asignaciones y de la empresa; las marcas, por el tipo del punto unico.

type CoberturaPrismaClient = Pick<
  PrismaClient,
  "tarifa" | "nodoGeografico" | "tipoNivelGeografico" | "zonaDistrito" | "organizacion"
> &
  ClienteDeMarcas;

export class CoberturaRepository implements ICoberturaRepository {
  constructor(private readonly prisma: CoberturaPrismaClient) {}

  // Uno por instancia, creado al primer uso: la vida de la carga es la de la peticion (design §4).
  private catalogoRepo: CatalogoGeograficoRepository | null = null;

  private catalogo(): CatalogoGeograficoRepository {
    this.catalogoRepo ??= new CatalogoGeograficoRepository(this.prisma);
    return this.catalogoRepo;
  }

  async listDistritos(): Promise<DistritoCoberturaRow[]> {
    // TODOS los distritos del pais, activos e inactivos (R4 de la 465): la disponibilidad se
    // PROYECTA, no se recorta. El distrito es la profundidad 3 (design §2.4).
    const { catalogo, asignaciones } = await this.catalogo().deLaEmpresa();
    return nodosDeProfundidad(catalogo, 3).map((d): DistritoCoberturaRow => {
      const [canton, provincia] = ancestros(catalogo, d.id);
      return {
        provincia: { nombre: provincia.nombre, activo: provincia.activo },
        canton: { nombre: canton.nombre, activo: canton.activo },
        distrito: {
          nombre: d.nombre,
          activo: d.activo,
          // SL-38: la marca de la EMPRESA del actor (R15 de la 465), propia o de un ancestro (R7).
          zonaEspecial: esZonaEspecial(catalogo, asignaciones, d.id),
        },
        disponible: estaActivo(catalogo, d.id) === true,
        // Las zonas del nodo mas cercano con asignacion (R6), SIN colapsar: la regla pura
        // distingue «sin zona» de «varias zonas».
        zonas: (zonasCandidatas(catalogo, asignaciones, d.id)?.zonas ?? []).map((z) => ({
          id: z.id,
          nombre: z.nombre,
          esCentral: z.esCentral,
        })),
      };
    });
  }

  async listZonaIdsConTarifaGeneral(): Promise<string[]> {
    // Nivel 3 de la cascada (`lib/utils/cascada-tarifa.ts`): tienda NULL y zona con valor. La
    // fila global (NULL, NULL) NO es una tarifa general de ninguna zona (R14).
    const rows = await this.prisma.tarifa.findMany({
      where: { tiendaId: null, zonaId: { not: null } },
      select: { zonaId: true },
      distinct: ["zonaId"],
    });
    // El `where` es el UNICO filtro, a proposito: un segundo filtro en JS dejaria el
    // `zonaId: { not: null }` sin ningun test capaz de verlo. La integracion
    // (`tests/integration/db/cobertura-repository.test.ts`) exige que no salga ningun `null`.
    return rows.map((r) => r.zonaId as string);
  }
}
