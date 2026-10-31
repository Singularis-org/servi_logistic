import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import { PlanesRepository, type PlanesPrismaClient } from "@/lib/repositories/PlanesRepository";
import { PlanesService } from "@/lib/services/PlanesService";
import type { CatalogoResult, DetallePlanResult, PlanDeEmpresaResult } from "@/lib/types/planes";

// SLT-58 (design §3.2) — el composition root de las lecturas de planes del superadmin. No es una
// Server Action (sin "use server"), como `modulos-empresa.ts`: las llaman las páginas de servidor, que
// ya resolvieron el actor, y no hace falta exponer un endpoint de lectura. Las escrituras siguen en
// `lib/actions/planes.ts`. Cualquier actor que no sea el superadmin recibe `forbidden` sin leer (R22).

/** El servicio con su repositorio real. */
export function construirPlanesPlataformaService(prisma: PlanesPrismaClient = getPrismaClient()): IPlanesService {
  return new PlanesService(new PlanesRepository(prisma));
}

/** R13: el catálogo entero, también los archivados. */
export async function verCatalogoDePlanes(
  actor: Actor | null,
  servicio: IPlanesService = construirPlanesPlataformaService(),
): Promise<CatalogoResult> {
  return servicio.catalogo(actor);
}

/** R16: `{ planId }` del segmento de la ruta; no uuid o inexistente no se distinguen en la página (R22). */
export async function verDetalleDePlan(
  actor: Actor | null,
  input: unknown,
  servicio: IPlanesService = construirPlanesPlataformaService(),
): Promise<DetallePlanResult> {
  return servicio.detallePlan(actor, input);
}

/** R19, R21: `{ organizacionId }` del detalle de la empresa. */
export async function verPlanDeEmpresa(
  actor: Actor | null,
  input: unknown,
  servicio: IPlanesService = construirPlanesPlataformaService(),
): Promise<PlanDeEmpresaResult> {
  return servicio.planDeEmpresa(actor, input);
}
