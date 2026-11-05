"use server";

import type {
  Actor,
  IVehiculoService,
  ListarVehiculosServiceResult,
} from "@/lib/interfaces/services/IVehiculoService";
import { VehiculoService } from "@/lib/services/VehiculoService";
import { VehiculoRepository } from "@/lib/repositories/VehiculoRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

// La lectura de empresa del catalogo de vehiculos: la usa el formulario de usuarios del `maestro`
// (R17). SL-42 (design §4.4): las escrituras salieron de aqui. El catalogo es de la plataforma y se
// gestiona en `lib/actions/vehiculos-plataforma.ts`; el `maestro` ya no tiene por donde escribir.

export type ListarVehiculosResult =
  | ListarVehiculosServiceResult
  | { status: "unauthenticated" };

function buildVehiculoService(): IVehiculoService {
  return new VehiculoService(new VehiculoRepository(getPrismaClient()));
}

export interface VehiculoActionDeps {
  vehiculoService?: IVehiculoService;
  getActor?: () => Promise<Actor | null>;
}

/** R17: el catalogo para el `maestro`, activos e inactivos (`activo` viaja en cada fila, R18). */
export async function listarVehiculos(
  deps: VehiculoActionDeps = {},
): Promise<ListarVehiculosResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  const service = deps.vehiculoService ?? buildVehiculoService();
  return service.listar(actor);
}
