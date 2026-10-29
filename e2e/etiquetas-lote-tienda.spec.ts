import { expect, test } from "@playwright/test";

import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  llevarA,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Impresión de etiquetas por lote para la tienda (SLT-49, R3).
 *
 * La tienda (`adminTienda`) entra a `/ordenes`, marca dos de sus órdenes en un estado de recogida,
 * pulsa «Imprimir etiquetas», ve las dos etiquetas en la vista previa y «Descargar etiquetas»
 * descarga un `.pdf` armado en el navegador.
 *
 * DATOS (R7, R8 de SL-44): empresa nueva; las dos órdenes, centrales, cargadas por la tienda y
 * llevadas por los servicios reales hasta `mensajero_recogiendo_en_bodega` (`llevarA` no ofrece
 * `por_recolectar_en_tienda` ni `recolectando` como destino: design §7). Se buscan por su número de
 * remisión, nunca por recuento total.
 */

let r: RepartoE2E;
let ordenes: OrdenE2E[];

test.describe.serial("Etiquetas por lote — la tienda", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("etiquetas-lote-tienda");
    const mensajero = await crearMensajero(r, "central");
    ordenes = [];
    for (let i = 0; i < 2; i++) {
      ordenes.push(
        await llevarA(r, await crearOrden(r, { zona: "central" }), "mensajero_recogiendo_en_bodega", { mensajero }),
      );
    }
  });

  test("marca 2 órdenes, ve 2 etiquetas en la vista previa y descarga un PDF (R3)", async ({ browser }) => {
    const page = await paginaDe(browser, r.tienda);
    await page.goto("/ordenes");

    for (const o of ordenes) {
      await page.getByRole("checkbox", { name: `Seleccionar orden ${o.numRemision}` }).check();
    }
    await page.getByRole("button", { name: "Imprimir etiquetas", exact: true }).click();

    const dialogo = page.getByRole("dialog", { name: "Imprimir etiquetas" });
    await expect(dialogo).toBeVisible();
    for (const o of ordenes) {
      const etiqueta = dialogo.getByRole("article", { name: `Etiqueta de la orden ${o.numRemision}` });
      await expect(etiqueta).toBeVisible();
      await expect(etiqueta.getByText(String(o.numGuia), { exact: true }).first()).toBeVisible();
    }
    await expect(dialogo.getByRole("article", { name: /^Etiqueta de la orden / })).toHaveCount(2);

    const descargar = dialogo.getByRole("button", { name: "Descargar etiquetas" });
    await expect(descargar).toBeEnabled();

    const [descarga] = await Promise.all([page.waitForEvent("download"), descargar.click()]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/);
    expect(await descarga.failure()).toBeNull();
  });
});
