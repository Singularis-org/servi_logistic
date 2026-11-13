"use server";

import { construirFacturaPlataformaService } from "@/lib/actions/_shared/facturas-plataforma";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { IFacturaPlataformaService } from "@/lib/interfaces/services/IFacturaPlataformaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { DetalleFacturaResult } from "@/lib/types/factura-plataforma";

// SLT-119 (design §5) — el borde del detalle de una factura (R6–R11), que el panel lateral pide al abrir y al
// paginar. El actor sale de la sesión y la autorización la decide el servicio antes de tocar la base (R13).
// La empresa del maestro es la del actor, nunca la del cliente; la del superadmin llega ligada en el servidor
// (`verDetalleFacturaEmpresaAction.bind(null, organizacionId)` en la página) y el servicio la valida igual (R15).
// Núcleo en `lib/modulos/reparto.ts`. Solo lectura (R16).

/** Inyección para los tests del borde. */
export interface FacturasPlataformaDeps {
  readonly service?: IFacturaPlataformaService;
  readonly getActor?: () => Promise<Actor | null>;
}

async function conServicio<T>(
  deps: FacturasPlataformaDeps,
  fn: (s: IFacturaPlataformaService, actor: Actor | null) => Promise<T>,
): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirFacturaPlataformaService(), actor);
}

/** R6–R11, R13–R15: el maestro pide `{ facturaId, pagina? }` de una factura de su empresa. */
export async function verDetalleFacturaMiPlanAction(
  input: unknown,
  deps: FacturasPlataformaDeps = {},
): Promise<DetalleFacturaResult> {
  return conServicio(deps, (s, actor) => s.detalleDeMiEmpresa(actor, input));
}

/**
 * R12–R15: el superadmin pide `{ facturaId, pagina? }` de una factura de la empresa `organizacionId`, que la
 * página liga en el servidor. Un `organizacionId` en `input` no cuenta: manda el ligado.
 */
export async function verDetalleFacturaEmpresaAction(
  organizacionId: string,
  input: unknown,
  deps: FacturasPlataformaDeps = {},
): Promise<DetalleFacturaResult> {
  const pedido = typeof input === "object" && input !== null ? input : {};
  return conServicio(deps, (s, actor) => s.detalleDeEmpresa(actor, { ...pedido, organizacionId }));
}
