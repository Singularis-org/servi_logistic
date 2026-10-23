"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { exigirSuperadmin } from "@/lib/auth/exigir-superadmin";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import type { AltaEmpresaResultado } from "@/lib/types/organizacion";

// SL-17 (design §7.7, R44–R48) — el borde del alta de empresa. La pantalla «Empresas» que la
// llama es de SL-32; aquí solo se decide QUIÉN puede y en qué contexto corre.

export type AltaEmpresaActionResultado = AltaEmpresaResultado | { estado: "no_autorizado" };

export interface OrganizacionesDeps {
  getActor?: () => Promise<Actor | null>;
  service?: IOrganizacionService;
}

/** El composition root: el servicio con su repositorio real sobre el cliente de la app. */
function construirServicio(): IOrganizacionService {
  return new OrganizacionService(new OrganizacionRepository(getPrismaClient()));
}

/**
 * R48: solo el superadmin. Cualquier otro actor, o ninguno, recibe «no autorizado» ANTES de
 * construir o llamar al servicio. Si pasa, el alta corre en plataforma porque la empresa todavía
 * no existe: no hay ninguna que fijar. La monta la pantalla «Empresas» de SL-32.
 */
export async function altaEmpresaAction(
  input: unknown,
  deps: OrganizacionesDeps = {},
): Promise<AltaEmpresaActionResultado> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!exigirSuperadmin(actor)) return { estado: "no_autorizado" };

  const servicio = deps.service ?? construirServicio();
  return comoPlataforma("SL-17", "alta de empresa por el superadmin", () => servicio.altaEmpresa(input));
}
