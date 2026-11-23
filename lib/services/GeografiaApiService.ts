// SLT-45 (design §6; R22, R23) — el catalogo geografico de la API v2.
//
// Sirve SOLO el pais de la empresa de la key. No lee como plataforma (design §11.5): dentro de una
// peticion por key la RLS de SLT-43 R12 ya deja ver un solo pais, y un pais ajeno o inexistente
// tienen que responder igual para no revelar cuales existen.
import type { ICatalogoGeograficoRepository } from "@/lib/interfaces/repositories/ICatalogoGeograficoRepository";
import type { IPaisRepository } from "@/lib/interfaces/repositories/IPaisRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type {
  CatalogoV2Result,
  IGeografiaApiService,
  UbicacionDeOrdenResult,
} from "@/lib/interfaces/services/IGeografiaApiService";
import { rutaPublica } from "@/lib/services/geo-ubicacion";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  CatalogoGeograficoInconsistente,
  estaActivo,
  type CatalogoGeografico,
  type NodoDelCatalogo,
} from "@/lib/services/geografia-dominio";
import type { GeografiaNodoDTO } from "@/lib/types/api-v2";

/** Lo unico que el servicio lee de `pais`: su nombre. */
export type GeografiaPaisRepository = Pick<IPaisRepository, "porId">;

/** Lo unico que el servicio lee de `orden`: su lugar, con el dueño forzado (§4.3). */
export type GeografiaOrdenRepository = Pick<IOrdenRepository, "findLugarDeOrdenForOwner">;

export class GeografiaApiService implements IGeografiaApiService {
  constructor(
    private readonly catalogoRepo: ICatalogoGeograficoRepository,
    private readonly paisRepo: GeografiaPaisRepository,
    // Opcional: el catalogo de `GET /api/v2/geografia` no lee ordenes.
    private readonly ordenRepo?: GeografiaOrdenRepository,
  ) {}

  async ubicacionDeOrden(actor: Actor, ordenId: string): Promise<UbicacionDeOrdenResult> {
    if (actor.rol !== "apiKey") return { status: "forbidden" };
    if (this.ordenRepo === undefined) throw new Error("GeografiaApiService: falta el repositorio de ordenes");

    const lugar = await this.ordenRepo.findLugarDeOrdenForOwner(ordenId, actor.usuarioId);
    if (lugar === null) return { status: "not_found" };

    const { catalogo } = await this.catalogoRepo.deLaEmpresa();
    return { status: "ok", ubicacion: rutaPublica(catalogo, lugar) };
  }

  async catalogo(actor: Actor, paisId: string): Promise<CatalogoV2Result> {
    if (actor.rol !== "apiKey") return { status: "forbidden" };

    const { catalogo } = await this.catalogoRepo.deLaEmpresa();
    if (catalogo.paisId !== paisId) return { status: "not_found" };

    const pais = await this.paisRepo.porId(paisId);
    if (pais === null) return { status: "not_found" };

    return {
      status: "ok",
      catalogo: {
        pais: { id: pais.id, nombre: pais.nombre },
        tipos: catalogo.tipos.map((t) => ({
          clave: t.clave,
          nombreSingular: t.nombreSingular,
          nombrePlural: t.nombrePlural,
        })),
        nodos: catalogo.nodos.map((n) => nodoPublico(catalogo, n)),
      },
    };
  }
}

function nodoPublico(cat: CatalogoGeografico, n: NodoDelCatalogo): GeografiaNodoDTO {
  const tipo = cat.tipos.find((t) => t.id === n.tipoId);
  if (tipo === undefined) throw new CatalogoGeograficoInconsistente(n.id, `su tipo ${n.tipoId} no esta en el catalogo`);
  return {
    id: n.id,
    padreId: n.padreId,
    profundidad: n.profundidad,
    tipo: tipo.clave,
    nombre: n.nombre,
    codigoOficial: n.codigoOficial,
    activo: estaActivo(cat, n.id) === true,
  };
}
