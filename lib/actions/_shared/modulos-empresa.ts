import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IModulosEmpresaService } from "@/lib/interfaces/services/IModulosEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import {
  ModulosEmpresaRepository,
  type ModulosEmpresaPrismaClient,
} from "@/lib/repositories/ModulosEmpresaRepository";
import { ModulosEmpresaService } from "@/lib/services/ModulosEmpresaService";
import type { VerModulosEmpresaResult } from "@/lib/types/modulos-empresa";

// SL-23 (design §5.2) — el composition root de los módulos de una empresa. No es una Server Action
// (sin "use server"): la lectura la llama la página del detalle, que ya resolvió el actor, y no hace
// falta exponer un endpoint más. La action de escritura monta el servicio con esta misma función.

/** El servicio con su repositorio real. */
export function construirModulosEmpresaService(
  prisma: ModulosEmpresaPrismaClient = getPrismaClient(),
): IModulosEmpresaService {
  return new ModulosEmpresaService(new ModulosEmpresaRepository(prisma));
}

/** Los módulos de una empresa para la página: `forbidden` sin leer nada si no es el superadmin (R10, R14). */
export async function verModulosEmpresa(
  actor: Actor | null,
  input: unknown,
  servicio: IModulosEmpresaService = construirModulosEmpresaService(),
): Promise<VerModulosEmpresaResult> {
  return servicio.ver(actor, input);
}
