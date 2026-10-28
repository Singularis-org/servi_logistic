"use server";

// Integracion WhatsApp — Server Action PERMANENTE para que el maestro dispare a mano la
// sincronizacion de plantillas (Meta -> local) desde la vista de plantillas, sin esperar al
// cron de 24 h. Gateada a rol `maestro` (mismo criterio que el CRUD de plantillas).
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { PlantillaMensajeRepository } from "@/lib/repositories/PlantillaMensajeRepository";
import { WhatsappPlantillasClient } from "@/lib/clients/whatsapp-cloud";
import {
  SincronizarPlantillasWhatsappService,
  type SincronizarPlantillasResult,
} from "@/lib/services/SincronizarPlantillasWhatsappService";
import {
  whatsappDeLaEmpresaOpcional,
  type WhatsappDeLaEmpresa,
} from "@/lib/services/whatsapp/whatsapp-de-la-empresa";
import { defaultLogger } from "@/lib/errors";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

const ALLOWED_ROLES = new Set<string>(["maestro"]);

export type SincronizarPlantillasActionResult =
  | ({ status: "ok" } & SincronizarPlantillasResult)
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "no_configurado" } // la empresa no tiene WhatsApp (SL-36, R24)
  | { status: "error"; detalle: string }; // Meta rechazo o no respondio

export interface SincronizarPlantillasDeps {
  getActor?: () => Promise<Actor | null>;
  /** La credencial de la empresa de la sesion; `null` si no tiene WhatsApp. Inyectable en tests. */
  whatsapp?: () => Promise<WhatsappDeLaEmpresa | null>;
}

export async function sincronizarPlantillasWhatsapp(
  deps: SincronizarPlantillasDeps = {},
): Promise<SincronizarPlantillasActionResult> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) return { status: "unauthenticated" };
  if (!ALLOWED_ROLES.has(actor.rol)) return { status: "forbidden" }; // solo maestro

  // SL-36 (R23, R24): la credencial de la empresa de la sesion; sin ella, sin red.
  const wa = await (deps.whatsapp ?? whatsappDeLaEmpresaOpcional)();
  if (wa === null) return { status: "no_configurado" };

  const service = new SincronizarPlantillasWhatsappService(
    new WhatsappPlantillasClient({ config: wa.config, fetchImpl: wa.fetchImpl }),
    new PlantillaMensajeRepository(getPrismaClient()),
  );

  try {
    const r = await service.sincronizar();
    return { status: "ok", ...r };
  } catch (error) {
    // Fallo de red/auth con Meta: se registra en el servidor (sin secretos) y se reporta.
    defaultLogger.logError(error);
    return {
      status: "error",
      detalle: error instanceof Error ? error.message : "error desconocido",
    };
  }
}
