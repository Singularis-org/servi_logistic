import type { Escenario } from "./454/_escenario";

/**
 * FICHA 477 — utilidades compartidas por los tests de Postgres de la correccion de un cierre
 * rechazado. Todo corre DENTRO de la transaccion revertida del escenario de la 454
 * (`conEscenario`): siembra con los servicios REALES (gestionar, solicitar, rechazar, deshacer).
 */

/** Los seis totales del cierre, como STRING escala 2 (money-safe), mas su estado. */
export async function cierreDe(e: Escenario, cierreId: string) {
  const c = await e.tx.cierreDia.findUniqueOrThrow({
    where: { id: cierreId },
    select: {
      estado: true,
      totalEfectivo: true,
      totalSimpe: true,
      totalTransferencia: true,
      totalGeneral: true,
      totalPagoMensajero: true,
      totalIngresoBodegaRechazos: true,
    },
  });
  return {
    estado: c.estado as string,
    efectivo: c.totalEfectivo.toFixed(2),
    simpe: c.totalSimpe.toFixed(2),
    transferencia: c.totalTransferencia.toFixed(2),
    general: c.totalGeneral.toFixed(2),
    pago: c.totalPagoMensajero.toFixed(2),
    ingreso: c.totalIngresoBodegaRechazos.toFixed(2),
  };
}

/** Una gestion, con sus columnas de cierre y de snapshot. */
export async function gestionDe(e: Escenario, gestionId: string) {
  const g = await e.tx.gestionOrden.findUniqueOrThrow({
    where: { id: gestionId },
    select: {
      cierreId: true,
      anuladaAt: true,
      anuladaPor: true,
      pagoMensajero: true,
      ingresoBodegaRechazo: true,
      resultado: true,
    },
  });
  return {
    cierreId: g.cierreId,
    anulada: g.anuladaAt !== null,
    anuladaPor: g.anuladaPor,
    pago: g.pagoMensajero?.toFixed(2) ?? null,
    ingreso: g.ingresoBodegaRechazo?.toFixed(2) ?? null,
    resultado: g.resultado as string,
  };
}

/** Las filas de `cierre_detail` del cierre, con su identidad (para afirmar «intactas»). */
export async function detalleDe(e: Escenario, cierreId: string) {
  return e.tx.cierreDetail.findMany({
    where: { cierreId },
    orderBy: { ordenId: "asc" },
  });
}

/** Fija la tarifa por defecto de la zona satelite del escenario (la del pago al mensajero). */
export async function fijarTarifaSatelite(
  e: Escenario,
  cobroEntregado: string,
  cobroRechazado: string,
): Promise<void> {
  await e.tx.tarifaZonaMensajero.updateMany({
    where: { zonaId: e.zonaSateliteId, vehiculoId: null },
    data: { cobroEntregado, cobroRechazado },
  });
}

/** Suscripcion de webhook de la tienda del escenario: sin ella no se encola el job del evento. */
export async function suscribirWebhook(e: Escenario, sufijo: string): Promise<void> {
  await e.tx.webhookSuscripcion.create({
    data: {
      ownerUsuarioId: e.tiendaId,
      url: `https://example.test/hook-477-${sufijo}`,
      secret: "cifrado",
      activa: true,
    },
  });
}
