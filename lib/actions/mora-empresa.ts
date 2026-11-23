"use server";

import { construirMoraEmpresaService } from "@/lib/actions/_shared/mora-empresa";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { IMoraEmpresaService } from "@/lib/interfaces/services/IMoraEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EstadoMora } from "@/lib/planes/mora";
import type { DarPlazoResult, FijarGraciaResult, MoraDeEmpresaResult, QuitarPlazoResult } from "@/lib/types/mora";

// SLT-121 (design §5.4) — el borde de la mora. El actor sale de la sesión y la autorización la decide el servicio
// antes de tocar la base (R4, R24). La empresa del superadmin llega ligada en el servidor
// (`fijarGraciaEmpresaAction.bind(null, organizacionId)` en la página): un `organizacionId` en `input` no cuenta.
// Núcleo en `lib/modulos/reparto.ts`.

/** Inyección para los tests del borde. */
export interface MoraEmpresaDeps {
  readonly service?: IMoraEmpresaService;
  readonly getActor?: () => Promise<Actor | null>;
}

async function conServicio<T>(
  deps: MoraEmpresaDeps,
  fn: (s: IMoraEmpresaService, actor: Actor | null) => Promise<T>,
): Promise<T> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return fn(deps.service ?? construirMoraEmpresaService(), actor);
}

/** El `input` del cliente con la empresa ligada encima: manda la de la URL. */
function conEmpresaLigada(organizacionId: string, input: unknown): Record<string, unknown> {
  const pedido = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return { ...pedido, organizacionId };
}

/**
 * R24: el banner de `app/(app)/layout.tsx`. `null` para quien no es `maestro` ni `admin` (sin leer nada) y también
 * si la lectura falla: el banner es un aviso, y su fallo no debe tumbar la página (design §7.1).
 */
export async function avisoMoraDelLayout(deps: MoraEmpresaDeps = {}): Promise<EstadoMora | null> {
  try {
    return await conServicio(deps, (s, actor) => s.avisoDeMiEmpresa(actor));
  } catch (error) {
    console.error("[avisoMoraDelLayout] no se pudo leer la mora de la empresa", error);
    return null;
  }
}

/**
 * R31, R32: la sección «Plazo de pago y mora» de la empresa `organizacionId` (superadmin).
 */
export async function verMoraDeEmpresaAction(
  organizacionId: string,
  deps: MoraEmpresaDeps = {},
): Promise<MoraDeEmpresaResult> {
  return conServicio(deps, (s, actor) => s.moraDeEmpresa(actor, { organizacionId }));
}

/**
 * R3, R5: `{ dias }` de 1 a 60, o `{ dias: null }` para volver a la global, de la empresa ligada.
 */
export async function fijarGraciaEmpresaAction(
  organizacionId: string,
  input: unknown,
  deps: MoraEmpresaDeps = {},
): Promise<FijarGraciaResult> {
  return conServicio(deps, (s, actor) => s.fijarGracia(actor, conEmpresaLigada(organizacionId, input)));
}

/**
 * SLT-255 R2-R4, R7: `{ motivo, hasta }` (`AAAA-MM-DD`) para dar plazo a la empresa ligada: la descongela si está
 * congelada; si no, le da prórroga.
 */
export async function darPlazoEmpresaAction(
  organizacionId: string,
  input: unknown,
  deps: MoraEmpresaDeps = {},
): Promise<DarPlazoResult> {
  return conServicio(deps, (s, actor) => s.darPlazo(actor, conEmpresaLigada(organizacionId, input)));
}

/**
 * SLT-255 R5, R7: `{ motivo }` para quitar la prórroga vigente de la empresa ligada.
 */
export async function quitarPlazoEmpresaAction(
  organizacionId: string,
  input: unknown,
  deps: MoraEmpresaDeps = {},
): Promise<QuitarPlazoResult> {
  return conServicio(deps, (s, actor) => s.quitarPlazo(actor, conEmpresaLigada(organizacionId, input)));
}
