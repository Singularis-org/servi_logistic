import { expect, test, type Page } from "@playwright/test";

import {
  crearEscenarioReparto,
  crearOrden,
  estadoDe,
  llevarA,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — SLT-159 «Escaneo continuo en recepciones y recogidas» (R580, R581, R610, R613): la página
 * «Recibir paquetes» de escritorio, con la pistola simulada (teclear la guía y Enter, sin clics
 * entre lecturas) y las acciones REALES con su `resumen` real (SLT-167).
 *
 * - Satélite: tres guías en camino a la bodega satélite, leídas seguidas en
 *   `/recepcion-satelite/recibir` → tres «Recibida» con destinatario y tienda; «Terminar recepción
 *   (3)» vuelve a «Por recibir».
 * - Bodega central: los escenarios no tienen camino de servicio a `en_ruta_bodega_central` (solo lo
 *   produce la carga por API), así que la página de `/ordenes/recibir` se prueba con una orden YA en
 *   bodega central: «Ya recibida» con su destinatario y tienda, y «Terminar recepción (0)» vuelve a
 *   `/ordenes`.
 *
 * DATOS (R7, R8): una empresa nueva por corrida (`crearEscenarioReparto`); las órdenes, por los
 * servicios reales (`llevarA`). FUERA: la cámara (html5-qrcode necesita una cámara real).
 */

const NOMBRE_TIENDA = "Tienda Recibir E2E";

let r: RepartoE2E;
let satelite: OrdenE2E[];
let central: OrdenE2E;

async function leerConPistola(page: Page, guias: number[]) {
  const campo = page.getByLabel("Escanea la guía con la pistola");
  await expect(campo).toBeFocused();
  for (const g of guias) {
    await page.keyboard.type(String(g));
    await page.keyboard.press("Enter");
  }
}

function filaDe(page: Page, numGuia: number | null) {
  return page.getByRole("log", { name: "Lecturas" }).getByRole("row", { name: new RegExp(String(numGuia)) });
}

test.describe.serial("Recibir paquetes — escaneo continuo en la página", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("recibir-paquetes", { nombreTienda: NOMBRE_TIENDA });
    satelite = [];
    for (let i = 0; i < 3; i++) {
      satelite.push(await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_ruta_bodega_satelite"));
    }
    central = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_bodega_central");
  });

  test("satélite: tres guías seguidas quedan «Recibida» y «Terminar recepción (3)» vuelve a Por recibir", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/por-recibir");
    // SLT-202: el único disparador de recibir dice «Recibir paquete», como en prod.
    await page.getByRole("link", { name: "Recibir paquete", exact: true }).click();
    await expect(page).toHaveURL(/\/recepcion-satelite\/recibir\?desde=por-recibir$/);
    await expect(page.getByRole("heading", { name: "Recibir paquetes" })).toBeVisible();
    await expect(page.getByText("Bodega satélite", { exact: true })).toBeVisible();

    await leerConPistola(page, satelite.map((o) => o.numGuia as number));

    for (const o of satelite) {
      const fila = filaDe(page, o.numGuia);
      await expect(fila.getByText("Recibida", { exact: true })).toBeVisible();
      await expect(fila.getByText(o.destinatario)).toBeVisible();
      await expect(fila.getByText(NOMBRE_TIENDA)).toBeVisible();
    }
    await expect(page.getByRole("status")).toHaveText(
      `Guía ${satelite[2].numGuia} recibida · ${satelite[2].destinatario}`,
    );

    await page.getByRole("button", { name: "Terminar recepción (3)" }).click();
    await expect(page).toHaveURL(/\/recepcion-satelite\/por-recibir$/);
    for (const o of satelite) expect(await estadoDe(o)).toBe("en_bodega_satelite");
  });

  test("bodega central: la página de /ordenes/recibir dice «Ya recibida» con destinatario y tienda", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");
    // SLT-202: el único disparador de recibir dice «Recibir paquete», como en prod.
    await page.getByRole("link", { name: "Recibir paquete", exact: true }).click();
    await expect(page).toHaveURL(/\/ordenes\/recibir$/);
    await expect(page.getByText("Bodega central", { exact: true })).toBeVisible();

    await leerConPistola(page, [central.numGuia as number]);

    const fila = filaDe(page, central.numGuia);
    await expect(fila.getByText("Ya recibida", { exact: true })).toBeVisible();
    await expect(fila.getByText(central.destinatario)).toBeVisible();
    await expect(fila.getByText(NOMBRE_TIENDA)).toBeVisible();

    await page.getByRole("button", { name: "Terminar recepción (0)" }).click();
    await expect(page).toHaveURL(/\/ordenes$/);
  });
});
