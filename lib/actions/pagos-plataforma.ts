"use server";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPagoPlataformaConfirmacionService } from "@/lib/interfaces/services/IPagoPlataformaConfirmacionService";
import { PagoPlataformaConfirmacionRepository } from "@/lib/repositories/PagoPlataformaConfirmacionRepository";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import type { ConfirmarPagoResult, VerPagosDeEmpresaResult } from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.6) — el borde de la confirmación del pago a la plataforma en el detalle de una empresa.
// El actor sale de la sesión y la autorización la decide el servicio (R24), antes de tocar la base. Es de
// plataforma, así que no lleva puerta de módulo: va al núcleo en `lib/modulos/reparto.ts`. Molde:
// `lib/actions/planes.ts`.

/** Inyección para los tests del borde. */
export interface PagosPlataformaDeps {
  readonly service?: IPagoPlataformaConfirmacionService;
  readonly getActor?: () => Promise<Actor | null>;
}

/**
 * El composition root: el servicio con su repositorio real. No exportado: un "use server" solo exporta
 * actions. Lo vigila `tests/unit/actions/pagos-plataforma.test.ts`, que llama a las actions sin servicio.
 */
function construirPagoPlataformaConfirmacionService(prisma = getPrismaClient()): IPagoPlataformaConfirmacionService {
  return new PagoPlataformaConfirmacionService(new PagoPlataformaConfirmacionRepository(prisma));
}

async function conServicio<T>(
  deps: PagosPlataformaDeps,
  fn: (s: IPagoPlataformaConfirmacionService, actor: Actor | null) => Promise<T>,
): Promise<T> {
  // Sin sesión, el actor es `null` y el servicio responde `forbidden` sin leer nada.
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirPagoPlataformaConfirmacionService(), actor);
}

/**
 * Los pagos por confirmar y las facturas cerradas con saldo de una empresa (R12, R14, R24).
 * @sin-superficie SLT-60 en curso: la liga la sección «Pagos por confirmar» del detalle de la empresa (T5.2, `page.tsx`), de la misma rama; al ligarla, la guardia exige borrar esta anotación.
 */
export async function verPagosDeEmpresaAction(
  input: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<VerPagosDeEmpresaResult> {
  return conServicio(deps, (s, actor) => s.verDeEmpresa(actor, input));
}

/**
 * Confirma un pago por confirmar con su reparto entre facturas cerradas (R16, R17, R19, R20, R24).
 * @sin-superficie SLT-60 en curso: la liga la sección «Pagos por confirmar» del detalle de la empresa (T5.2, `page.tsx`), de la misma rama; al ligarla, la guardia exige borrar esta anotación.
 */
export async function confirmarPagoPlataformaAction(
  input: unknown,
  deps: PagosPlataformaDeps = {},
): Promise<ConfirmarPagoResult> {
  return conServicio(deps, (s, actor) => s.confirmar(actor, input));
}
