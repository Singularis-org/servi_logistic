import type { Actor } from "../../lib/interfaces/services/IOrdenService";
import { escenarioCierres, solicitarCierre as solicitarCierreNucleo } from "../../tests/fabricas/escenarios/cierres";
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

// SL-43 T5: el núcleo vive en `tests/fabricas/escenarios/cierres.ts`, que comparte con la demo de
// QA. Aquí se monta con el lector del E2E (`baseReparto`). Importar `./reparto` deja puesto el
// doble de Storage antes de que nada hable con él.
const nucleo = escenarioCierres({ lector: baseReparto });

export function solicitarCierre(r: RepartoE2E, m: MensajeroE2E): Promise<string> {
  return solicitarCierreNucleo(r, m);
}

export function aprobarCierre(r: RepartoE2E, cierreId: string, opts: { quien?: Actor } = {}): Promise<void> {
  return nucleo.aprobarCierre(r, cierreId, opts);
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

export function rechazarCierre(
  r: RepartoE2E,
  cierreId: string,
  motivo: string,
  opts: { quien?: Actor } = {},
): Promise<void> {
  return nucleo.rechazarCierre(r, cierreId, motivo, opts);
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
