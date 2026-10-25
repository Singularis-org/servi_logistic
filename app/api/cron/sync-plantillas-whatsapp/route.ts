// Integracion WhatsApp — Route Handler del cron que sincroniza las plantillas de Meta hacia
// las locales (cada 24 h). Capa Controller: solo HTTP + autorizacion por `CRON_SECRET` (el
// MISMO que corte-diario / liberar-reprogramadas / procesar-jobs); delega TODA la logica en
// `SincronizarPlantillasWhatsappService`. NUNCA loguea el secreto ni el token (R19). Clon
// estructural de `liberar-reprogramadas/route.ts`.
//
// SL-36 (design §9.1; R23, R24): cada empresa sincroniza con SU cuenta de WhatsApp. El service se
// construye DENTRO de `paraCadaEmpresa`, con la credencial de la empresa en curso; una empresa sin
// WhatsApp se salta (sin red) y se cuenta en `sinWhatsapp`.
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
import {
  whatsappDeLaEmpresaOpcional,
  type WhatsappDeLaEmpresa,
} from "@/lib/services/whatsapp/whatsapp-de-la-empresa";

type ServicioSync = Pick<SincronizarPlantillasWhatsappService, "sincronizar">;

export interface SyncPlantillasDeps {
  getSecret?: () => string | null;
  // `Pick` y no la clase: un doble de test solo necesita `sincronizar`. Es el MISMO service para
  // todas las empresas: solo sirve a los tests de recorrido; en produccion cada una construye el suyo.
  service?: ServicioSync | null;
  // SL-17 (R16): fuente de las empresas que se recorren (un doble en tests). Con `service`
  // inyectado y sin `empresas`, una sola corrida sin recorrer empresas.
  empresas?: ClienteDeOrganizaciones;
  /** SL-36: la credencial de la empresa en curso; `null` si no tiene WhatsApp. Inyectable en tests. */
  whatsapp?: () => Promise<WhatsappDeLaEmpresa | null>;
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
 * El service real de la empresa EN CURSO (ya dentro de su `conEmpresa`). `null` si no tiene
 * WhatsApp (R24): esa empresa se salta sin llamar a Meta.
 */
async function buildServiceDeLaEmpresa(
  whatsapp: () => Promise<WhatsappDeLaEmpresa | null>,
): Promise<SincronizarPlantillasWhatsappService | null> {
  const wa = await whatsapp();
  if (wa === null) return null;
  return new SincronizarPlantillasWhatsappService(
    new WhatsappPlantillasClient({ config: wa.config, fetchImpl: wa.fetchImpl }),
    new PlantillaMensajeRepository(getPrismaClient()),
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

  const inyectado = deps.service;
  if (inyectado === null) {
    // Doble de test sin service: nada que sincronizar.
    return NextResponse.json({ skipped: "whatsapp no configurado" }, { status: 200 });
  }

  const result = await withErrorHandler(async () => {
    if (inyectado !== undefined && deps.empresas === undefined) return inyectado.sincronizar();
    const whatsapp = deps.whatsapp ?? (() => whatsappDeLaEmpresaOpcional());
    const construir = inyectado !== undefined ? async () => inyectado : () => buildServiceDeLaEmpresa(whatsapp);
    // SL-17 (R16, D14): `plantilla_mensaje` es de cada empresa, asi que se sincroniza empresa por
    // empresa, cada una en su contexto y, desde SL-36, con su propia cuenta de Meta.
    const corridas: SincronizarPlantillasResult[] = [];
    let sinWhatsapp = 0;
    const empresas = await paraCadaEmpresa(
      async () => {
        const service = await construir();
        if (service === null) {
          sinWhatsapp += 1;
          return;
        }
        corridas.push(await service.sincronizar());
      },
      { cliente: deps.empresas },
    );
    return {
      ...sumar(corridas),
      empresas: {
        procesadas: empresas.ok.length - sinWhatsapp,
        fallidas: empresas.fallidas.map((f) => f.organizacionId),
        sinWhatsapp,
      },
    };
  });
  if (isAppErrorShape(result)) return appErrorToResponse(result);
  return NextResponse.json(result, { status: 200 });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handleSyncPlantillas(req);
}
