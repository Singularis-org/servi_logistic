"use server";

import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";
import { GeografiaService } from "@/lib/services/GeografiaService";
import type {
  ActualizarDistritosEspecialesServiceResult,
  IDistritoZonaEspecialService,
} from "@/lib/interfaces/services/IDistritoZonaEspecialService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { distritosEspecialesSchema } from "@/lib/types/distrito-zona-especial";
import type {
  IGeografiaService,
  ListarArbolGeograficoServiceResult,
} from "@/lib/interfaces/services/IGeografiaService";

// Catalogo geografico global (provincia -> canton -> distrito).
//
// ⚠️ FICHA 374 — YA NO ES DE SOLO LECTURA. La cabecera anterior decia, con todas sus letras, que
// «el catalogo en si es de solo lectura» y que por eso se toleraba el Prisma directo. Esa premisa
// muere con la primera escritura: desde esta ficha el catalogo se administra desde la app, asi que
// la lectura del arbol tambien pasa por la cadena de siempre —Server Action -> `GeografiaService`
// -> `GeoRepository`— y este archivo deja de tocar Prisma para eso.
//
// SL-38 — ya no queda ninguna excepcion: `actualizarDistritosEspeciales`, al final del archivo, era
// la ultima escritura con Prisma directo, y pasa por `DistritoZonaEspecialService` ->
// `DistritoZonaEspecialRepository` desde que la marca es de la empresa.
//
// SL-20 (design §4) — LAS ESCRITURAS DE LA GEOGRAFIA YA NO VIVEN AQUI. El alta, el renombrado, el
// retiro y el conteo de la confirmacion son del superadmin, que no tiene empresa, y estan en
// `lib/actions/geografia-plataforma.ts`, dentro de `comoPlataforma`. Aqui quedan las lecturas y la
// marca de zona especial, que son de la empresa.

// Los DTO del arbol viven en `lib/types/geografia-nodo.ts` desde la ficha 374 —los produce
// `GeoRepository`, y un repositorio no puede importar un modulo `"use server"`—. Se RE-EXPORTAN
// aqui para que ningun consumidor tenga que cambiar su import.
export type {
  CantonArbolDTO,
  DistritoArbolDTO,
  ProvinciaArbolDTO,
} from "@/lib/types/geografia-nodo";

/**
 * Dependencias inyectables del borde (patron `VehiculoActionDeps`). Existen para poder probar la
 * lectura SIN base y sin sesion, no para cambiar el comportamiento en produccion.
 */
export interface GeografiaActionDeps {
  geografiaService?: IGeografiaService;
  getActor?: () => Promise<Actor | null>;
}

/**
 * El composition root de la lectura del arbol. El servicio pide sus dos repositorios aunque
 * `listarArbol` solo use el de geografia: el conteo, que necesita el de ordenes, se arma en
 * `geografia-plataforma.ts` y lo fija su test de composition root.
 */
function buildGeografiaService(): IGeografiaService {
  const prisma = getPrismaClient();
  return new GeografiaService(new GeoRepository(prisma), new OrdenRepository(prisma));
}

// ── Lectura del arbol ────────────────────────────────────────────────────────────────────────

export type ArbolGeograficoResult =
  | ListarArbolGeograficoServiceResult
  | { status: "unauthenticated" };

/**
 * Devuelve el arbol geografico COMPLETO —activos e inactivos— ordenado alfabeticamente en cada
 * nivel. Lo leen la plataforma y el `maestro`, que lo usa en Tarifas (R25 de SL-32).
 *
 * CONSERVA SU FIRMA: lo llaman `app/(app)/configuracion/tarifas/page.tsx` y
 * `ZonasTarifasModule.tsx` sin argumentos, y siguen compilando. `deps` es opcional y solo sirve
 * para probarlo sin base.
 */
export async function listarArbolGeografico(
  deps: GeografiaActionDeps = {},
): Promise<ArbolGeograficoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  const service = deps.geografiaService ?? buildGeografiaService();
  return service.listarArbol(actor);
}

// ── Marca de zona especial (SL-38) ───────────────────────────────────────────────────────────
//
// La marca es de la EMPRESA (`distrito_zona_especial`), no del distrito: escribirla no toca la
// geografia, que es de plataforma (SL-17 R40). Conserva nombre, entrada y resultado porque la llaman
// `CrearZonaForm` y la mockean seis tests de componentes.

/** Dependencias inyectables de `actualizarDistritosEspeciales`, con el patron de `GeografiaActionDeps`. */
export interface DistritosEspecialesActionDeps {
  distritoZonaEspecialService?: IDistritoZonaEspecialService;
  getActor?: () => Promise<Actor | null>;
}

/**
 * El composition root de la marca. El repositorio que recibe es el que escribe: un servicio
 * construido sin el compilaria igual si el parametro se volviera opcional, y lo mide
 * `tests/unit/actions/distritos-especiales-action.test.ts` llamando a la accion sin servicio.
 */
function buildDistritoZonaEspecialService(): IDistritoZonaEspecialService {
  return new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(getPrismaClient()));
}

export type ActualizarDistritosEspecialesResult =
  | ActualizarDistritosEspecialesServiceResult
  | { status: "unauthenticated" };

/**
 * Guarda la marca de zona especial de la empresa del actor para un lote de distritos. Recibe el
 * DELTA (lo que cambio en el formulario), no el estado completo: asi dos zonas abiertas a la vez no
 * se pisan la marca de los distritos que ninguna toco.
 *
 * La marca es del distrito PARA LA EMPRESA: queda visible desde cualquier zona de la empresa que lo
 * contenga, y el llamador refresca el arbol para verlo. Solo `maestro` (lo decide el servicio).
 */
export async function actualizarDistritosEspeciales(
  input: unknown,
  deps: DistritosEspecialesActionDeps = {},
): Promise<ActualizarDistritosEspecialesResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" }; // R11

  const parsed = distritosEspecialesSchema.safeParse(input);
  if (!parsed.success) return { status: "validation_error" }; // R12

  const service = deps.distritoZonaEspecialService ?? buildDistritoZonaEspecialService();
  return service.actualizar(parsed.data, actor);
}
