"use server";

import { construirModulosEmpresaService } from "@/lib/actions/_shared/modulos-empresa";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import type { IModulosEmpresaService } from "@/lib/interfaces/services/IModulosEmpresaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FijarModuloEmpresaResult } from "@/lib/types/modulos-empresa";

// SL-23 (design §5.2; R9–R13) — el borde del interruptor de módulos del detalle de una empresa. El
// actor sale de la sesión y la autorización la decide el servicio (R10), antes de tocar la base. Es de
// plataforma, así que no lleva puerta de módulo: va al núcleo en `lib/modulos/reparto.ts`.

/** Inyección para los tests del borde. */
export interface ModulosEmpresaDeps {
  readonly service?: IModulosEmpresaService;
  readonly getActor?: () => Promise<Actor | null>;
}

/**
 * Enciende o apaga un módulo de una empresa. Vale desde la siguiente petición de esa empresa (R9).
 *
 * @sin-superficie SL-23 T6 (temporal, por orden de tasks.md): su único llamador es el interruptor de `ModulosEmpresa.tsx` en `/plataforma/empresas/[organizacionId]`, que crea T7 de esta misma ficha; T7 borra esta anotación al montarlo (la guardia de superficie se pone roja si sobrevive).
 */
export async function fijarModuloEmpresaAction(
  input: unknown,
  deps: ModulosEmpresaDeps = {},
): Promise<FijarModuloEmpresaResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  return (deps.service ?? construirModulosEmpresaService()).fijar(actor, input);
}
