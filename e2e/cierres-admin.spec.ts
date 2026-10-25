import { expect, test, type Page } from "@playwright/test";

import { cierresDe, importe, solicitarCierre } from "./_escenarios/cierres";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — «Cierres del día» del admin de la bodega (features 38 y 238; SL-44 T6.1, R18).
 *
 * El maestro decide los cierres de los mensajeros de la bodega central:
 *  (a) APROBAR: abre el detalle de un cierre solicitado, lee los totales del snapshot, abre la
 *      evidencia firmada de la orden rechazada (sale del doble de Storage, D2), pulsa «Aprobar»,
 *      confirma físicamente el paquete que vuelve (su guía) y el cierre pasa a «Resueltos» como
 *      «Aprobado».
 *  (b) RECHAZAR: el motivo es obligatorio; con motivo, el cierre pasa a «Resueltos» como
 *      «Rechazado» y el motivo queda guardado.
 *
 * DATOS (R7, R8): empresa nueva; cada caso con SU mensajero de la zona central. Las gestiones, por
 * `MisAsignacionesService` (con la foto subida al doble de Storage); el cierre, por
 * `CierreDiaService.solicitarCierre`. Cifras a mano:
 *  (a) entrega de 6.000 en efectivo + un rechazo → Efectivo 6.000, Total general 6.000.
 *  (b) entrega de 2.500 en efectivo.
 */

let r: RepartoE2E;

async function conCierreSolicitado(
  entregas: number[],
  rechazos: number,
): Promise<{ m: MensajeroE2E; rechazadas: OrdenE2E[]; cierreId: string }> {
  const m = await crearMensajero(r, "central");
  for (const monto of entregas) {
    const o = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: monto }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto }] });
  }
  const rechazadas: OrdenE2E[] = [];
  for (let i = 0; i < rechazos; i++) {
    const o = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    rechazadas.push(o);
  }
  return { m, rechazadas, cierreId: await solicitarCierre(r, m) };
}

async function abrirDetalle(page: Page, m: MensajeroE2E) {
  await page.goto("/cierres-admin");
  const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
  const comprobante = pendientes.getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
  await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
  await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await expect(detalle).toBeVisible();
  return detalle;
}

async function verResueltos(page: Page, m: MensajeroE2E) {
  await page.getByRole("group", { name: "Cierres del día por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
  return page.getByRole("region", { name: "Histórico" }).getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
}

test.describe("Cierres del día — el admin aprueba o rechaza", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierres-admin");
  });

  test("(a) detalle con totales y evidencia → Aprobar con la guía confirmada → «Aprobado»", async ({ browser }) => {
    const { m, rechazadas, cierreId } = await conCierreSolicitado([6000], 1);
    const [rechazada] = rechazadas;
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirDetalle(page, m);

    const totales = detalle.getByRole("region", { name: "Totales del cierre" });
    await expect(totales.getByText("Efectivo", { exact: true }).locator("xpath=ancestor::div[1]")).toContainText(importe(6000));
    await expect(totales.getByText("Total general", { exact: true }).locator("xpath=ancestor::div[1]")).toContainText(importe(6000));

    // R7 de la 38: la evidencia de la rechazada abre por URL firmada y la imagen CARGA (bytes del doble).
    // Las gestiones van en pestañas por resultado, con la fila desplegable (fichas 456 y 478).
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await ordenes.getByRole("tab", { name: /Devolución a origen por rechazo/ }).click();
    await ordenes.getByRole("button", { name: new RegExp(rechazada.numRemision), expanded: false }).click();
    await detalle.getByRole("button", { name: `Ver evidencia de la orden ${rechazada.numRemision} · ${rechazada.destinatario}` }).click();
    const visor = page.getByRole("dialog", { name: "Evidencia de la gestión" });
    const foto = visor.getByRole("img", { name: "Evidencia fotográfica de la gestión" });
    await expect(foto).toBeVisible();
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await visor.getByRole("button", { name: "Cerrar" }).click();

    await detalle.getByRole("button", { name: "Aprobar", exact: true }).click();
    // Feature 238: el paquete que vuelve se confirma con su guía antes de aprobar.
    const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
    const aprobar = confirmar.getByRole("button", { name: "Confirmar y aprobar" });
    await expect(aprobar).toBeDisabled();
    const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
    await lector.getByLabel("Número de guía").fill(String(rechazada.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(aprobar).toBeEnabled();
    await aprobar.click();

    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    // El detalle se cierra. El efectivo (6.000) cubre la ganancia del mensajero, así que no queda
    // nada que liquidar y tampoco se ofrece registrar un pago (feature 172/R16).
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const resuelto = await verResueltos(page, m);
    await expect(resuelto.getByText("Aprobado", { exact: true })).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[cierreId, "aprobado"]]);
  });

  test("(b) Rechazar exige motivo → con motivo pasa a «Rechazado» con el motivo guardado", async ({ browser }) => {
    const { m, cierreId } = await conCierreSolicitado([2500], 0);
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirDetalle(page, m);
    await expect(detalle.getByRole("region", { name: "Totales del cierre" })).toContainText(importe(2500));

    await detalle.getByRole("button", { name: "Rechazar", exact: true }).click();
    const rechazo = page.getByRole("dialog", { name: "Rechazar cierre" });
    await rechazo.getByRole("button", { name: "Rechazar cierre" }).click();
    await expect(rechazo.getByText("El motivo de rechazo es obligatorio.")).toBeVisible();
    expect((await cierresDe(m))[0].estado).toBe("solicitado");

    await rechazo.getByLabel("Motivo del rechazo").fill("Los montos no cuadran");
    await rechazo.getByRole("button", { name: "Rechazar cierre" }).click();
    await expect(page.getByText("Cierre rechazado correctamente.")).toBeVisible();

    const resuelto = await verResueltos(page, m);
    await expect(resuelto.getByText("Rechazado", { exact: true })).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, c.motivoRechazo])).toEqual([
      [cierreId, "rechazado", "Los montos no cuadran"],
    ]);
  });
});
