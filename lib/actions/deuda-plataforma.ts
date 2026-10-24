"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  IDeudaPlataformaService,
  VerDeudaPlataformaResult,
} from "@/lib/interfaces/services/IDeudaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroPlataformaMovimientoRepository } from "@/lib/repositories/CobroPlataformaMovimientoRepository";
import { DeudaPlataformaService } from "@/lib/services/DeudaPlataformaService";

// SL-40 (design §5, §9.2) — el borde de la deuda con la plataforma que pinta la wallet. Es una
// lectura propia, al lado de `verResumenCajaAction`, y no un campo más del resumen de la caja: la
// deuda no sale de `wallet_movimiento` y no cambia ninguna cifra de la caja (D10, design §10).

/** Inyección para los tests del borde. */
export interface DeudaPlataformaDeps {
  readonly service?: IDeudaPlataformaService;
  readonly getActor?: () => Promise<Actor | null>;
}

/** El composition root: el repositorio real sobre el cliente con el aislamiento por empresa. */
function construirServicio(): IDeudaPlataformaService {
  return new DeudaPlataformaService(new CobroPlataformaMovimientoRepository(getPrismaClient()));
}

/**
 * Sin parámetros a propósito: no recibe filtros del libro, porque la deuda es la de toda la historia
 * de la empresa (R23). El actor y su empresa salen de la sesión.
 */
export async function verDeudaPlataformaAction(deps: DeudaPlataformaDeps = {}): Promise<VerDeudaPlataformaResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  const service = deps.service ?? construirServicio();
  return service.verDeuda(actor);
}
