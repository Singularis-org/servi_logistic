"use server";

import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { GeografiaService } from "@/lib/services/GeografiaService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import type {
  IGeografiaService,
  ListarArbolDeZonasServiceResult,
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
// SLT-54 (R28): la marca de zona especial ya no se escribe desde ninguna pantalla. Decide el flete hasta
// activar, asi que cambiarla mientras se digita moveria importes; se configura como un grupo mas.
// `DistritoZonaEspecialService` se queda para `scripts/demo-qa/receta.ts`.
//
// SL-20 (design §4) — LAS ESCRITURAS DE LA GEOGRAFIA YA NO VIVEN AQUI. El alta, el renombrado, el
// retiro y el conteo de la confirmacion son del superadmin, que no tiene empresa, y estan en
// `lib/actions/geografia-plataforma.ts`, dentro de `comoPlataforma`. Aqui queda la lectura.

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
 * nivel. Lo leen la plataforma y el `maestro`, que lo usa en Zonas (R25 de SL-32; SLT-51 la sacó de Tarifas).
 *
 * `deps` es opcional y solo sirve para probarlo sin base.
 *
 * @sin-superficie SLT-89 (deuda, no decision): Zonas la cambio por `listarArbolDeZonas` (el arbol de N niveles con la zona asignada y la heredada, T7.2) y era su unica superficie. No se retira en SLT-89 porque la cubren `tests/unit/actions/geografia-action.test.ts` y `tests/unit/actions/geografia.composition-root.test.ts`, y quitar esos casos cambia aserciones fuera de las excepciones de R38; retirarla (con `GeografiaService.listarArbol` si nadie mas lo usa) queda para SLT-48 «Geografia jerarquica: retirar modelo viejo», o antes si el humano lo decide.
 */
export async function listarArbolGeografico(
  deps: GeografiaActionDeps = {},
): Promise<ArbolGeograficoResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  const service = deps.geografiaService ?? buildGeografiaService();
  return service.listarArbol(actor);
}

// ── SLT-89 (design §4.2, §6): el arbol de zonas de N niveles ─────────────────────────────────

export type ArbolDeZonasResult = ListarArbolDeZonasServiceResult | { status: "unauthenticated" };

/**
 * El arbol del pais de la empresa a todas sus profundidades, con la zona asignada y la heredada de
 * cada nodo: lo que pinta el selector de nodos de una zona (R24–R27). Solo `maestro` (R36); la
 * empresa es la de la sesion (R35), nunca llega del cliente.
 *
 */
export async function listarArbolDeZonas(deps: GeografiaActionDeps = {}): Promise<ArbolDeZonasResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  const service = deps.geografiaService ?? buildGeografiaService();
  return service.listarArbolDeZonas(actor);
}
