import { expect, test, type Locator } from "@playwright/test";

import { cierresDe, importe } from "./_escenarios/cierres";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  gestionesDe,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — «Cierre del día» del mensajero (features 37, 39 y 67; SL-44 T6.1, R18).
 *
 *  (a) El mensajero, con todo lo suyo gestionado, ve sus gestiones por resultado, los totales por
 *      método y su ganancia; pulsa «Solicitar cierre», confirma, y el cierre aparece en «Cierres
 *      solicitados» como «Solicitado» con su destino (la bodega satélite de su zona).
 *  (b) Deshace una entrega antes de cerrar (feature 67): la fila sale de «Entregados», el total de
 *      efectivo baja y la orden vuelve a su lista de entregas, con la gestión anulada.
 *
 * DATOS (R7, R8): empresa nueva; cada caso con SU mensajero de la zona satélite y SUS órdenes,
 * llevadas hasta `en_reparto` y gestionadas por los servicios reales (`MisAsignacionesService`).
 * Tarifa del mensajero: 1.700 por entrega. Las cifras de abajo salen, a mano, de esas órdenes:
 *  (a) 8.000 en efectivo + 3.000 por SINPE → Efectivo 8.000, SINPE 3.000, Transferencia 0, Total
 *      general 11.000; ganancia 2 × 1.700 = 3.400.
 *  (b) 5.000 + 2.000 en efectivo → Efectivo 7.000; deshecha la de 5.000 → Efectivo 2.000.
 */

const TARIFA_MENSAJERO = { cobroEntregado: 1700, cobroRechazado: 300 };

let r: RepartoE2E;

/** El importe de una pareja rótulo/importe del panel (`TotalItem`): el contenedor del rótulo exacto. */
function total(panel: Locator, rotulo: string): Locator {
  return panel.getByText(rotulo, { exact: true }).locator("..");
}

async function entregada(m: MensajeroE2E, monto: number, metodo: "efectivo" | "SINPE"): Promise<OrdenE2E> {
  const orden = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: monto }), "en_reparto", { mensajero: m });
  await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo, monto }] });
  return orden;
}

test.describe("Cierre del día — el mensajero solicita y deshace", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierre-dia", { tarifaMensajero: TARIFA_MENSAJERO });
  });

  test("(a) totales por método y ganancia → Solicitar cierre → «Solicitado» en el histórico", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const o1 = await entregada(m, 8000, "efectivo");
    const o2 = await entregada(m, 3000, "SINPE");

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");

    const totales = page.getByRole("region", { name: "Totales del día" });
    await expect(total(totales, "Efectivo")).toContainText(importe(8000));
    await expect(total(totales, "SINPE")).toContainText(importe(3000));
    await expect(total(totales, "Transferencia")).toContainText(importe(0));
    await expect(total(totales, "Total general")).toContainText(importe(11000));
    await expect(page.getByRole("region", { name: "Ganancia" })).toContainText(importe(3400));

    const entregados = page.getByRole("region", { name: "Entregado" });
    await expect(entregados.getByText(o1.numRemision)).toBeVisible();
    await expect(entregados.getByText(o2.numRemision)).toBeVisible();

    const solicitar = page.getByRole("region", { name: "Solicitar cierre" }).getByRole("button", { name: "Solicitar cierre" });
    await expect(solicitar).toBeEnabled();
    await solicitar.click();
    const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
    await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
    await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();

    const historico = page.getByRole("region", { name: "Cierres solicitados" });
    await expect(historico.getByText("Solicitado", { exact: true })).toBeVisible();
    await expect(historico.getByText(/Bodega satélite/)).toBeVisible();

    // El cierre quedó con el snapshot de lo gestionado (R14 de la 37).
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => [c.estado, c.destinoTipo])).toEqual([["solicitado", "bodega_satelite"]]);
    const [c] = cierres;
    expect([c.totalEfectivo, c.totalSimpe, c.totalTransferencia, c.totalGeneral, c.totalPagoMensajero].map(String)).toEqual([
      "8000",
      "3000",
      "0",
      "11000",
      "3400",
    ]);
  });

  test("(b) Devolver a gestión → la fila sale, el efectivo baja y la orden vuelve a entregas", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const deshacer = await entregada(m, 5000, "efectivo");
    const queda = await entregada(m, 2000, "efectivo");

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    const entregados = page.getByRole("region", { name: "Entregado" });
    const totales = page.getByRole("region", { name: "Totales del día" });
    await expect(entregados.getByText(deshacer.numRemision)).toBeVisible();
    await expect(total(totales, "Efectivo")).toContainText(importe(7000));

    await entregados.getByRole("button", { name: `Devolver a gestión la orden ${deshacer.numRemision} · ${deshacer.destinatario}` }).click();
    const dialogo = page.getByRole("dialog", { name: "Devolver la orden a gestión" });
    await expect(dialogo).toContainText(/quedará anulada/);
    await dialogo.getByRole("button", { name: "Devolver a gestión" }).click();

    await expect(page.getByText("Gestión deshecha; la orden volvió a tu lista para gestionar.")).toBeVisible();
    await expect(entregados.getByText(deshacer.numRemision)).toHaveCount(0);
    await expect(entregados.getByText(queda.numRemision)).toBeVisible();
    await expect(total(totales, "Efectivo")).toContainText(importe(2000));
    await expect(total(totales, "Efectivo")).not.toContainText(importe(7000));

    // La gestión quedó anulada (con rastro) y la orden sigue en reparto con él, lista para re-gestionar.
    const gestiones = await gestionesDe(deshacer);
    expect(gestiones).toHaveLength(1);
    expect(gestiones[0].anuladaAt).not.toBeNull();
    expect(await estadoDe(deshacer)).toBe("en_reparto");

    await page.goto("/mis-asignaciones/reparto");
    await expect(page.getByText(deshacer.numRemision).first()).toBeVisible();
  });
});
