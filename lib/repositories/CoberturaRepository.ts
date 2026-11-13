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
import { usaModeloNuevo } from "@/lib/repositories/_shared/resolver-tarifas";
import { nivelesDelCatalogo } from "@/lib/repositories/_shared/ruta-del-lugar";

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
  "tarifa" | "tarifaActivacion" | "tarifaValor" | "nodoGeografico" | "tipoNivelGeografico" | "zonaDistrito" | "zonaNodo" | "organizacion"
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
    // TODOS los lugares del nivel mas hondo del pais, activos e inactivos (R4 de la 465): la
    // disponibilidad se PROYECTA, no se recorta.
    //
    // SLT-125 (design §4.2, P5; R6): una fila por nodo de profundidad P, la del ultimo nivel del pais
    // (`nivelesDelCatalogo`), no la 3 fija. En Costa Rica P = 3: los mismos distritos de hoy. En un pais
    // de 4 niveles son los del cuarto; su zona y su marca salen de la herencia del catalogo (SLT-44),
    // igual que hoy para un distrito.
    const { catalogo, asignaciones } = await this.catalogo().deLaEmpresa();
    const niveles = nivelesDelCatalogo(catalogo);
    const P = niveles.length === 0 ? 3 : niveles[niveles.length - 1].profundidad;
    return nodosDeProfundidad(catalogo, P).map((hoja): DistritoCoberturaRow => {
      // Del nivel 1 a la hoja, con el flag PROPIO de cada nivel (el motivo nombra el primero retirado).
      const ruta = [...ancestros(catalogo, hoja.id).reverse(), hoja].map((n) => ({
        id: n.id,
        nombre: n.nombre,
        activo: n.activo,
      }));
      // Los campos de hoy, del nivel k de la ruta (R37). Un pais sin ese nivel lo deja vacio y activo:
      // no hay nada retirado ahi, y el motivo se calcula sobre la ruta.
      const nivel = (k: number) => ({ nombre: ruta[k - 1]?.nombre ?? "", activo: ruta[k - 1]?.activo ?? true });
      return {
        provincia: nivel(1),
        canton: nivel(2),
        distrito: {
          ...nivel(3),
          // SL-38: la marca de la EMPRESA del actor (R15 de la 465), propia o de un ancestro (R7). Es
          // la de la hoja (el lugar de la fila), que en Costa Rica es el distrito.
          zonaEspecial: esZonaEspecial(catalogo, asignaciones, hoja.id),
        },
        ruta,
        disponible: estaActivo(catalogo, hoja.id) === true,
        // Las zonas del nodo mas cercano con asignacion (R6), SIN colapsar: la regla pura
        // distingue «sin zona» de «varias zonas».
        zonas: (zonasCandidatas(catalogo, asignaciones, hoja.id)?.zonas ?? []).map((z) => ({
          id: z.id,
          nombre: z.nombre,
          esCentral: z.esCentral,
        })),
      };
    });
  }

  async listZonaIdsConTarifaGeneral(): Promise<string[]> {
    // SLT-54 (R30): tras activar, `tarifas` ya no dice nada y todas las zonas saldrian sin tarifa. Marca
    // el flete por entregado propio de la zona, coherente con `fleteEntregadoSinTarifa` (SLT-52 R51).
    if (await usaModeloNuevo(this.prisma)) {
      const valores = await this.prisma.tarifaValor.findMany({
        where: {
          concepto: "tienda_flete_entregado",
          grupoId: null,
          tiendaId: null,
          mensajeroId: null,
          vehiculoId: null,
        },
        select: { zonaId: true },
        distinct: ["zonaId"],
      });
      // Sin tienda ni mensajero, el CHECK `tarifa_valor_niveles_*` obliga a que la fila tenga zona.
      return valores.map((v) => v.zonaId as string);
    }
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
