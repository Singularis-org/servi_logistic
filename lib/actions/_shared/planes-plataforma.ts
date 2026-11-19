import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPlanBorradorService } from "@/lib/interfaces/services/IPlanBorradorService";
import type { IPlanesService } from "@/lib/interfaces/services/IPlanesService";
import { PlanesRepository, type PlanesPrismaClient } from "@/lib/repositories/PlanesRepository";
import { PlanBorradorService } from "@/lib/services/PlanBorradorService";
import { PlanesService } from "@/lib/services/PlanesService";
import type { BorradoresResult } from "@/lib/types/plan-borrador";
import type { CatalogoResult, DetallePlanResult, PlanDeEmpresaResult, PreciosQueRigenResult } from "@/lib/types/planes";

// SLT-58 (design §3.2) — el composition root de las lecturas de planes del superadmin. No es una
// Server Action (sin "use server"), como `modulos-empresa.ts`: las llaman las páginas de servidor, que
// ya resolvieron el actor, y no hace falta exponer un endpoint de lectura. Las escrituras siguen en
// `lib/actions/planes.ts`. Cualquier actor que no sea el superadmin recibe `forbidden` sin leer (R22).

/** El servicio con su repositorio real. */
export function construirPlanesPlataformaService(prisma: PlanesPrismaClient = getPrismaClient()): IPlanesService {
  return new PlanesService(new PlanesRepository(prisma));
}

/** SLT-144 (design §3.3): el servicio del borrador con su repositorio real, el mismo que el de sus actions. */
function construirPlanBorradorPlataformaService(
  prisma: PlanesPrismaClient = getPrismaClient(),
): IPlanBorradorService {
  const repo = new PlanesRepository(prisma);
  return new PlanBorradorService(repo, new PlanesService(repo));
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

/**
 * SLT-86 (R15, R25; review m4): `{ planIds }` de los asignables y del plan actual de la empresa. Por plan,
 * los precios que pueden regir de hoy en adelante; el modal elige el de la fecha con `precioQueRigeEn`.
 */
export async function verPreciosQueRigen(
  actor: Actor | null,
  input: unknown,
  servicio: IPlanesService = construirPlanesPlataformaService(),
): Promise<PreciosQueRigenResult> {
  return servicio.preciosQueRigen(actor, input);
}

/**
 * SLT-144 (design §3.3; R24, R25, R28): los borradores de planes para la sección «Borradores» y la marca «Cambio en
 * borrador». Lectura sin action, como el catálogo; la página la llama después de su `notFound()`.
 */
export async function verBorradoresDePlanes(
  actor: Actor | null,
  servicio: IPlanBorradorService = construirPlanBorradorPlataformaService(),
): Promise<BorradoresResult> {
  return servicio.borradores(actor);
}
