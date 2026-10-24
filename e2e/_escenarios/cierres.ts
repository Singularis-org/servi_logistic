import { conEmpresa } from "../../lib/db/contexto-empresa";
import { getPrismaClient } from "../../lib/db/prisma-client";
import { gestionConfig } from "../../lib/config/gestion";
import type { Actor } from "../../lib/interfaces/services/IOrdenService";
import {
  notificarCierreDiaPorAprobarReal,
  notificarCierreDiaRechazadoReal,
  notificarMensajeroBloqueadoReal,
} from "../../lib/notificaciones/notificadores";
import { CierreDiaRepository } from "../../lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "../../lib/repositories/CierresAdminRepository";
import { LiquidacionPagoRepository } from "../../lib/repositories/LiquidacionPagoRepository";
import { OrdenRepository } from "../../lib/repositories/OrdenRepository";
import { PagoMensajeroMovimientoRepository } from "../../lib/repositories/PagoMensajeroMovimientoRepository";
import { TarifaVigenteRepository } from "../../lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "../../lib/repositories/TarifaZonaMensajeroRepository";
import { WalletMovimientoRepository } from "../../lib/repositories/WalletMovimientoRepository";
import { WalletTiendaMovimientoRepository } from "../../lib/repositories/WalletTiendaMovimientoRepository";
import { ZonaRepository } from "../../lib/repositories/ZonaRepository";
import { CierreDiaService } from "../../lib/services/CierreDiaService";
import { CierresAdminService } from "../../lib/services/CierresAdminService";
import { buildLiberarReprogramadasService } from "../../lib/services/jobs/liberar-reprogramadas-handler";
import { liberarAlAprobarCierreCon } from "../../lib/services/liberacion-al-aprobar-cierre";
import { buildReprogramadasRetenidasService } from "../../lib/services/reprogramadas-retenidas-composicion";
import { WalletFeedService } from "../../lib/services/WalletFeedService";
import { WalletIndemnizacionFeedService } from "../../lib/services/WalletIndemnizacionFeedService";
import { WalletMensajeroFeedService } from "../../lib/services/WalletMensajeroFeedService";
import { WalletTiendaFeedService } from "../../lib/services/WalletTiendaFeedService";
import { SupabaseSignedUrlProvider } from "../../lib/storage/SupabaseSignedUrlProvider";
import { RESULTADOS_QUE_VUELVEN } from "../../lib/types/gestion-retorno";
import { fijarEmpresa } from "../../tests/fabricas/organizaciones";

import { baseReparto, type MensajeroE2E, type RepartoE2E } from "./reparto";

/**
 * SL-44 T3.2 (design D4; R8) — EL CIERRE DEL DÍA, lo mínimo que el grupo `reparto` necesita para
 * que una gestión llegue a su estado: la gestión deja la orden `en_reparto` y es la APROBACIÓN del
 * cierre la que la mueve (ficha 454). Los servicios, montados como en `lib/actions/cierre-dia.ts` y
 * `lib/actions/cierres-admin.ts`, con sus notificadores reales y la liberación al aprobar.
 *
 * ── API ──────────────────────────────────────────────────────────────────────────────────────────
 *
 *   solicitarCierre(r, mensajero) → cierreId
 *     `CierreDiaService.solicitarCierre` con el actor del mensajero. Exige un cierre NUEVO.
 *
 *   aprobarCierre(r, cierreId, { quien? }) → void
 *     `CierresAdminService.aprobarCierre`. Aprueba quien tiene el cierre en su alcance: el
 *     `adminSatelite` para un mensajero de la satélite, el maestro para uno de la central (o
 *     `quien` explícito). La confirmación física es la que haría la bodega escaneando cada paquete
 *     que vuelve: las gestiones del cierre cuyo resultado retorna (`RESULTADOS_QUE_VUELVEN`), con su
 *     guía.
 *
 * El grupo `dinero` amplía este archivo: ver «Ampliación del grupo `dinero`» al final.
 */

function cierreDia(): CierreDiaService {
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

function cierresAdmin(): CierresAdminService {
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

export async function solicitarCierre(r: RepartoE2E, m: MensajeroE2E): Promise<string> {
  const res = await conEmpresa(r.empresa.organizacionId, () => cierreDia().solicitarCierre(m.actor));
  if (res.status !== "ok" || res.via !== "creado" || !res.cierreId) {
    throw new Error(`SL-44 E2E cierres: solicitarCierre no creó un cierre: ${JSON.stringify(res)}`);
  }
  return res.cierreId;
}

export async function aprobarCierre(r: RepartoE2E, cierreId: string, opts: { quien?: Actor } = {}): Promise<void> {
  const cierre = await baseReparto().cierreDia.findUniqueOrThrow({
    where: { id: cierreId },
    select: { destinoTipo: true },
  });
  const quien = opts.quien ?? (cierre.destinoTipo === "bodega_satelite" ? r.actores.adminSatelite : r.actores.maestro);
  const retornables = await baseReparto().gestionOrden.findMany({
    where: { cierreId, anuladaAt: null, resultado: { in: [...RESULTADOS_QUE_VUELVEN] } },
    select: { id: true, orden: { select: { numGuia: true } } },
  });
  const confirmacion = retornables.map((g) => {
    if (g.orden.numGuia === null) throw new Error("SL-44 E2E cierres: una gestión retornable sin guía.");
    return { gestionId: g.id, numGuia: g.orden.numGuia };
  });
  const res = await conEmpresa(r.empresa.organizacionId, () => cierresAdmin().aprobarCierre(cierreId, quien, [], confirmacion));
  if (res.status !== "ok") throw new Error(`SL-44 E2E cierres: aprobarCierre no fue ok: ${JSON.stringify(res)}`);
}

// ── Ampliación del grupo `dinero` (SL-44 T6.1/T6.2) ─────────────────────────────────────────────
//
//   rechazarCierre(r, cierreId, motivo, { quien? }) → void
//     `CierresAdminService.rechazarCierre`, con el mismo reparto de quién decide que `aprobarCierre`.
//
//   cierresDe(m) → los cierres del día del mensajero (id, estado, destino y totales), del más viejo
//     al más nuevo. Solo LEE lo que dejaron los servicios y los crons.
//
//   anclarDevolucionHaceDias(r, orden, dias) → void
//     ⚠️ EXCEPCIÓN DE R8 (design D4). Mueve al pasado la fila `anclaje_devolucion` del historial de
//     una orden en `novedad` (la que escribe la APROBACIÓN del cierre: el instante en que empieza a
//     correr el plazo del SLA). Motivo: sin reloj falso, el cron `procesar-devueltas-sla` no ve
//     vencida una devolución `wrong_*` hasta 5 días después, y ningún servicio fija ese instante. La
//     vía corta del tope de intentos tampoco sirve: con el tope la gestión `novedad` ya no se admite
//     (feature 276). Solo se toca la FECHA de esa fila, con la empresa fijada; el estado, la gestión
//     y el escalado los producen el servicio y el cron reales.
//
//   importe(n, { solo? }) → RegExp tolerante al símbolo y a los separadores (salen de
//     `lib/config/moneda.ts`); con `solo`, anclada a todo el texto del elemento.

export async function rechazarCierre(
  r: RepartoE2E,
  cierreId: string,
  motivo: string,
  opts: { quien?: Actor } = {},
): Promise<void> {
  const cierre = await baseReparto().cierreDia.findUniqueOrThrow({ where: { id: cierreId }, select: { destinoTipo: true } });
  const quien = opts.quien ?? (cierre.destinoTipo === "bodega_satelite" ? r.actores.adminSatelite : r.actores.maestro);
  const res = await conEmpresa(r.empresa.organizacionId, () => cierresAdmin().rechazarCierre(cierreId, motivo, quien));
  if (res.status !== "ok") throw new Error(`SL-44 E2E cierres: rechazarCierre no fue ok: ${JSON.stringify(res)}`);
}

export async function cierresDe(m: { id: string }) {
  return baseReparto().cierreDia.findMany({
    where: { mensajeroId: m.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      estado: true,
      destinoTipo: true,
      motivoRechazo: true,
      totalEfectivo: true,
      totalSimpe: true,
      totalTransferencia: true,
      totalGeneral: true,
      totalPagoMensajero: true,
      totalIngresoBodegaRechazos: true,
    },
  });
}

const DIA_MS = 24 * 60 * 60 * 1000;

export async function anclarDevolucionHaceDias(r: RepartoE2E, orden: { id: string }, dias: number): Promise<void> {
  const db = baseReparto();
  const n = await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, r.empresa.organizacionId);
    const res = await tx.ordenHistorialEstado.updateMany({
      where: { ordenId: orden.id, origenTipo: "anclaje_devolucion" },
      data: { createdAt: new Date(Date.now() - dias * DIA_MS) },
    });
    return res.count;
  });
  if (n !== 1) throw new Error(`SL-44 E2E cierres: la orden debía tener UN anclaje de devolución y tiene ${n}.`);
}

export function importe(n: number, opts: { solo?: boolean } = {}): RegExp {
  const miles = Math.trunc(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "\u0000").split("\u0000");
  const cifra = `${miles.join("[.\\s\\u00a0\\u202f]?")}(?:,\\d{2})?`;
  // `solo`: el texto ENTERO del elemento es el importe (con su símbolo). Sirve donde el importe va
  // pegado a otros números en el texto del contenedor (p. ej. «₡9.0001-1 de 1» de la paginación).
  return opts.solo ? new RegExp(`^\\s*[^\\d\\s]{0,3}\\s?${cifra}\\s*$`) : new RegExp(`(?<![\\d.,])${cifra}(?!\\d)`);
}
