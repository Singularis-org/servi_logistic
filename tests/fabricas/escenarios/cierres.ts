import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "../../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../../lib/db/prisma-client";
import { gestionConfig } from "../../../lib/config/gestion";
import type { Actor } from "../../../lib/interfaces/services/IOrdenService";
import {
  notificarCierreDiaPorAprobarReal,
  notificarCierreDiaRechazadoReal,
  notificarMensajeroBloqueadoReal,
} from "../../../lib/notificaciones/notificadores";
import { CierreDiaRepository } from "../../../lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "../../../lib/repositories/CierresAdminRepository";
import { LiquidacionPagoRepository } from "../../../lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "../../../lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "../../../lib/repositories/PagoMensajeroMovimientoRepository";
import { TarifaVigenteRepository } from "../../../lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "../../../lib/repositories/TarifaZonaMensajeroRepository";
import { WalletMovimientoRepository } from "../../../lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "../../../lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "../../../lib/repositories/ZonaRepository";
import { CierreDiaService } from "../../../lib/services/CierreDiaService";
import { CierresAdminService } from "../../../lib/services/CierresAdminService";
import { buildLiberarReprogramadasService } from "../../../lib/services/jobs/liberar-reprogramadas-handler";
import { liberarAlAprobarCierreCon } from "../../../lib/services/liberacion-al-aprobar-cierre";
import { buildReprogramadasRetenidasService } from "../../../lib/services/reprogramadas-retenidas-composicion";
import { WalletFeedService } from "../../../lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "../../../lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "../../../lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "../../../lib/services/WalletTiendaFeedService";
import { SupabaseSignedUrlProvider } from "../../../lib/storage/SupabaseSignedUrlProvider";
import { RESULTADOS_QUE_VUELVEN } from "../../../lib/types/gestion-retorno";

import type { EscenarioReparto, MensajeroEscenario } from "./reparto";

/**
 * SL-43 T5 (design D1.2; R11, R17) — EL NÚCLEO DEL CIERRE DEL DÍA, sacado de
 * `e2e/_escenarios/cierres.ts` (SL-44) para que lo compartan el E2E y la demo de QA. La gestión
 * deja la orden `en_reparto` y es la APROBACIÓN del cierre la que la mueve (ficha 454). Los
 * servicios, montados como en `lib/actions/cierre-dia.ts` y `lib/actions/cierres-admin.ts`, con sus
 * notificadores reales y la liberación al aprobar.
 *
 * No lee `process.env` ni importa Playwright. Lo único inyectado (`escenarioCierres(deps)`) es el
 * lector dueño, SOLO para leer lo que dejaron los servicios.
 *
 *   solicitarCierre(r, mensajero) → cierreId: `CierreDiaService.solicitarCierre` con el actor del
 *     mensajero. Exige un cierre NUEVO.
 *   aprobarCierre(r, cierreId, { quien? }): aprueba quien tiene el cierre en su alcance (el
 *     `adminSatelite` para un mensajero de la satélite, el maestro para uno de la central, o `quien`).
 *     Confirma físicamente las gestiones del cierre cuyo resultado retorna (`RESULTADOS_QUE_VUELVEN`),
 *     con su guía, como la bodega escaneando cada paquete.
 *   rechazarCierre(r, cierreId, motivo, { quien? }): con el mismo reparto de quién decide.
 */

export interface DepsEscenarioCierres {
  lector: () => PrismaClient;
}

export function cierreDia(): CierreDiaService {
  const prisma = getPrismaClient();
  return new CierreDiaService(
    new CierreDiaRepository(prisma, new TarifaVigenteRepository(prisma)),
    new ZonaRepository(prisma),
    new OrdenRepository(prisma),
    new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
    new TarifaZonaMensajeroRepository(prisma),
    notificarCierreDiaPorAprobarReal,
    notificarMensajeroBloqueadoReal,
  );
}

export function cierresAdmin(): CierresAdminService {
  const prisma = getPrismaClient();
  return new CierresAdminService(
    new CierresAdminRepository(
      prisma,
      new WalletMovimientoRepository(prisma),
      new WalletFeedService(),
      new WalletTiendaMovimientoRepository(prisma),
      new WalletTiendaFeedService(),
      new PagoMensajeroMovimientoRepository(prisma),
      new WalletMensajeroFeedService(),
      new WalletIndemnizacionFeedService(),
    ),
    new ZonaRepository(prisma),
    new OrdenRepository(prisma),
    new SupabaseSignedUrlProvider(undefined, gestionConfig.EVIDENCIA_BUCKET),
    new LiquidacionPagoRepository(prisma),
    new PagoMensajeroMovimientoRepository(prisma),
    buildReprogramadasRetenidasService(prisma),
    notificarMensajeroBloqueadoReal,
    liberarAlAprobarCierreCon(buildLiberarReprogramadasService()),
    notificarCierreDiaRechazadoReal,
  );
}

export async function solicitarCierre(r: EscenarioReparto, m: MensajeroEscenario): Promise<string> {
  const res = await conEmpresa(r.empresa.organizacionId, () => cierreDia().solicitarCierre(m.actor));
  if (res.status !== "ok" || res.via !== "creado" || !res.cierreId) {
    throw new Error(`escenario cierres: solicitarCierre no creó un cierre: ${JSON.stringify(res)}`);
  }
  return res.cierreId;
}

export function escenarioCierres(deps: DepsEscenarioCierres) {
  async function quienDecide(r: EscenarioReparto, cierreId: string, quien: Actor | undefined): Promise<Actor> {
    const cierre = await deps.lector().cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { destinoTipo: true } });
    return quien ?? (cierre.destinoTipo === "bodega_satelite" ? r.actores.adminSatelite : r.actores.maestro);
  }

  async function aprobarCierre(r: EscenarioReparto, cierreId: string, opts: { quien?: Actor } = {}): Promise<void> {
    const quien = await quienDecide(r, cierreId, opts.quien);
    const retornables = await deps.lector().gestionOrden.findMany({
      where: { cierreId, anuladaAt: null, resultado: { in: [...RESULTADOS_QUE_VUELVEN] } },
      select: { id: true, orden: { select: { numGuia: true } } },
    });
    const confirmacion = retornables.map((g) => {
      if (g.orden.numGuia === null) throw new Error("escenario cierres: una gestión retornable sin guía.");
      return { gestionId: g.id, numGuia: g.orden.numGuia };
    });
    const res = await conEmpresa(r.empresa.organizacionId, () => cierresAdmin().aprobarCierre(cierreId, quien, [], confirmacion));
    if (res.status !== "ok") throw new Error(`escenario cierres: aprobarCierre no fue ok: ${JSON.stringify(res)}`);
  }

  async function rechazarCierre(
    r: EscenarioReparto,
    cierreId: string,
    motivo: string,
    opts: { quien?: Actor } = {},
  ): Promise<void> {
    const quien = await quienDecide(r, cierreId, opts.quien);
    const res = await conEmpresa(r.empresa.organizacionId, () => cierresAdmin().rechazarCierre(cierreId, motivo, quien));
    if (res.status !== "ok") throw new Error(`escenario cierres: rechazarCierre no fue ok: ${JSON.stringify(res)}`);
  }

  return { solicitarCierre, aprobarCierre, rechazarCierre };
}

export type NucleoCierres = ReturnType<typeof escenarioCierres>;
