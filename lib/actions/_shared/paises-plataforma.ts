import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  IPaisService,
  ListarPaisesDisponiblesServiceResult,
} from "@/lib/interfaces/services/IPaisService";
import type { Actor } from "@/lib/interfaces/services/IVehiculoService";
import { PaisRepository, type PaisPrismaClient } from "@/lib/repositories/PaisRepository";
import { PaisService } from "@/lib/services/PaisService";

// SL-20 (enmienda 2026-10-26, decisión 6; design §8; R9, R45) — el composition root de los países que
// ofrece el alta de empresa. No es una Server Action (sin "use server"), igual que
// `empresas-plataforma.ts`: lo llama `app/(app)/plataforma/empresas/page.tsx`, que ya resolvió el
// actor, y no hace falta exponer un endpoint más.
//
// Sin `comoPlataforma`: `pais` es de plataforma y la política `pais_lectura` deja leerla a cualquiera
// (R3 solo prohíbe escribirla), como el catálogo de tipos de documento que lee la misma página.

export function construirPaisService(prisma: PaisPrismaClient = getPrismaClient()): IPaisService {
  return new PaisService(new PaisRepository(prisma));
}

/**
 * Las opciones del `Select` de país del alta: `forbidden` si el actor no es de la plataforma, sin
 * leer nada (R37); si lo es, `{ id, nombre }` de cada país con `disponible = true`, por nombre (R9,
 * R45). La puerta de verdad es el alta (`OrganizacionRepository.altaEmpresa`): esto es comodidad.
 */
export async function listarPaisesDisponibles(
  actor: Actor,
  servicio: IPaisService = construirPaisService(),
): Promise<ListarPaisesDisponiblesServiceResult> {
  return servicio.listarDisponibles(actor);
}
