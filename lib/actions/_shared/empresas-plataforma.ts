import type { PrismaClient, RolValue } from "@prisma/client";

import { esPlataforma } from "@/lib/auth/plataforma";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  ActorEmpresasPlataforma,
  IEmpresasPlataformaService,
} from "@/lib/interfaces/services/IEmpresasPlataformaService";
import { EmpresasPlataformaRepository } from "@/lib/repositories/EmpresasPlataformaRepository";
import { EmpresasPlataformaService } from "@/lib/services/EmpresasPlataformaService";
import type { ListarEmpresasResultado } from "@/lib/types/empresas-plataforma";

// SL-32 (T14b) — el composition root del listado de la pantalla «Empresas». No es una Server
// Action (sin "use server"): lo llama la pagina, que ya resolvio el actor, y no hace falta exponer
// un endpoint mas.

/** El servicio con su repositorio real y la fuente unica de plataforma (R4). */
export function construirEmpresasPlataformaService(
  prisma: Pick<PrismaClient, "organizacion"> = getPrismaClient(),
): IEmpresasPlataformaService {
  // El servicio tipa el rol como `string` (T14a nacio antes del enum con `superadmin`); el actor de
  // la app trae un `RolValue`, y para cualquier otro texto `esPlataforma` responde `false`.
  return new EmpresasPlataformaService(new EmpresasPlataformaRepository(prisma), (rol) =>
    esPlataforma(rol as RolValue),
  );
}

/**
 * El listado para la pagina: `forbidden` si el actor no es de la plataforma, sin leer nada (R35);
 * si lo es, todas las empresas, la mas reciente primero (R29).
 */
export async function listarEmpresasPlataforma(
  actor: ActorEmpresasPlataforma | null,
  servicio: IEmpresasPlataformaService = construirEmpresasPlataformaService(),
): Promise<ListarEmpresasResultado> {
  return servicio.listarEmpresas(actor);
}
