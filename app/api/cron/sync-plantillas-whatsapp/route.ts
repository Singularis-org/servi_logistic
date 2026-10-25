// Integracion WhatsApp — Route Handler del cron que sincroniza las plantillas de Meta hacia
// las locales (cada 24 h). Capa Controller: solo HTTP + autorizacion por `CRON_SECRET` (el
// MISMO que corte-diario / liberar-reprogramadas / procesar-jobs); delega TODA la logica en
// `SincronizarPlantillasWhatsappService`. NUNCA loguea el secreto ni el token (R19). Clon
// estructural de `liberar-reprogramadas/route.ts`.
import { NextResponse } from "next/server";
import { withErrorHandler, isAppErrorShape, appErrorToResponse } from "@/lib/errors";
import {
  SincronizarPlantillasWhatsappService,
  type SincronizarPlantillasResult,
} from "@/lib/services/SincronizarPlantillasWhatsappService";
import { PlantillaMensajeRepository } from "@/lib/repositories/PlantillaMensajeRepository";
import { WhatsappPlantillasClient } from "@/lib/clients/whatsapp-cloud";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { paraCadaEmpresa, type ClienteDeOrganizaciones } from "@/lib/db/para-cada-empresa";
import { loadCronConfig } from "@/lib/config/cron";
import { loadWhatsappConfig } from "@/lib/config/whatsapp";

export interface SyncPlantillasDeps {
  getSecret?: () => string | null;
  // `Pick` y no la clase: un doble de test solo necesita `sincronizar`.
  service?: Pick<SincronizarPlantillasWhatsappService, "sincronizar"> | null;
  // SL-17 (R16): fuente de las empresas que se recorren (un doble en tests). Con `service`
  // inyectado y sin `empresas`, una sola corrida sin recorrer empresas.
  empresas?: ClienteDeOrganizaciones;
}

function sumar(corridas: SincronizarPlantillasResult[]): SincronizarPlantillasResult {
  return corridas.reduce(
    (t, r) => ({
      leidas: t.leidas + r.leidas,
      actualizadas: t.actualizadas + r.actualizadas,
      sinCambios: t.sinCambios + r.sinCambios,
      ignoradas: t.ignoradas + r.ignoradas,
    }),
    { leidas: 0, actualizadas: 0, sinCambios: 0, ignoradas: 0 },
  );
}

/**
 * Construye el service real. Devuelve `null` si WhatsApp NO esta configurado (faltan envs): en
 * ese caso el cron responde 200 "skipped" en vez de fallar, para no alarmar antes de que se
 * llenen las credenciales.
 */
function buildService(): SincronizarPlantillasWhatsappService | null {
  let config;
  try {
    config = loadWhatsappConfig();
  } catch {
    return null;
  }
  const prisma = getPrismaClient();
  return new SincronizarPlantillasWhatsappService(
    new WhatsappPlantillasClient({ config }),
    new PlantillaMensajeRepository(prisma),
  );
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (header === null) return null;
  const match = header.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

export async function handleSyncPlantillas(
  req: Request,
  deps: SyncPlantillasDeps = {},
): Promise<NextResponse> {
  // Autorizacion ANTES de cualquier efecto. Secreto no configurado -> 401.
  const expected = (deps.getSecret ?? (() => loadCronConfig().CORTE_DIARIO_SECRET))();
  const provided = bearerToken(req);
  if (expected === null || provided === null || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = deps.service !== undefined ? deps.service : buildService();
  if (service === null) {
    // WhatsApp no configurado: nada que sincronizar todavia.
    return NextResponse.json({ skipped: "whatsapp no configurado" }, { status: 200 });
  }

  const result = await withErrorHandler(async () => {
    if (deps.service !== undefined && deps.empresas === undefined) return service.sincronizar();
    // SL-17 (R16, D14): `plantilla_mensaje` es de cada empresa, asi que se sincroniza empresa por
    // empresa, cada una en su contexto. Las credenciales de Meta siguen siendo las globales hasta
    // SL-36: cada empresa lee la misma lista de Meta y casa solo sus plantillas locales por nombre
    // (por eso `leidas` suma la lista una vez por empresa).
    const corridas: SincronizarPlantillasResult[] = [];
    const empresas = await paraCadaEmpresa(
      async () => {
        corridas.push(await service.sincronizar());
      },
      { cliente: deps.empresas },
    );
    return {
      ...sumar(corridas),
      empresas: {
        procesadas: empresas.ok.length,
        fallidas: empresas.fallidas.map((f) => f.organizacionId),
      },
    };
  });
  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleSyncPlantillas(req);
}
