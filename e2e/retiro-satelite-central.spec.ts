import { expect, test, type Page } from "@playwright/test";

import { marcarCasilla } from "./_escenarios/casillas";
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
 * E2E — SLT-197 «Retirar paquetes de una bodega satélite a la central» (R980 → R971 → R977 → R978).
 *
 * El maestro filtra en `/ordenes` las órdenes «En bodega satélite», retira dos a la bodega central
 * (quedan «En ruta a bodega central»), las recibe con la pistola en «Recibir paquetes» de la central
 * (quedan «En bodega central», con su zona satélite de siempre) y «Rutear a bodega satélite» las
 * vuelve a aceptar.
 *
 * DATOS (R7, R8): una empresa nueva por corrida (`crearEscenarioReparto`); las órdenes llevadas al
 * estante de la satélite por los servicios reales (`llevarA`). Sin `waitForTimeout`: todo espera
 * condiciones. FUERA: la cámara (html5-qrcode necesita una cámara real).
 */

let r: RepartoE2E;
let ordenes: OrdenE2E[];

function filaDe(page: Page, o: OrdenE2E) {
  return page.getByRole("row", { name: new RegExp(o.numRemision) });
}

/** Pone el filtro «Estado» de `BuscadorFiltros` en un solo valor. */
async function filtrarEstado(page: Page, estado: string) {
  const disparador = page.getByRole("button", { name: /^Estado: / });
  if (!(await disparador.isVisible())) {
    await page.getByRole("button", { name: "Filtros", exact: true }).click();
    await page.getByRole("listbox", { name: "Filtros" }).getByRole("option", { name: "Estado", exact: true }).click();
    await page.keyboard.press("Escape");
  }
  await disparador.click();
  await page.getByRole("listbox", { name: "Estado" }).getByRole("option", { name: estado, exact: true }).click();
  await page.keyboard.press("Escape");
}

test.describe.serial("Retiro de satélite a la central — retirar, recibir y volver a rutear", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("retiro-satelite-central");
    ordenes = [];
    for (let i = 0; i < 2; i++) {
      ordenes.push(await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite"));
    }
  });

  test("R980/R971/R981: el maestro retira dos órdenes del estante y quedan en ruta a la central", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");
    await filtrarEstado(page, "En bodega satélite");

    for (const o of ordenes) {
      const fila = filaDe(page, o);
      await expect(fila.getByText("En bodega satélite")).toBeVisible();
      await marcarCasilla(fila.getByRole("checkbox", { name: `Seleccionar orden ${o.numRemision}` }));
    }
    await page.getByRole("button", { name: "Retirar a bodega central", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Retirar a bodega central" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText("Se retirarán 2 orden(es)", { exact: false })).toBeVisible();
    await modal.getByRole("button", { name: "Retirar a bodega central", exact: true }).click();

    await expect(modal.getByText("2 orden(es) en ruta a bodega central.").first()).toBeVisible();
    await expect(modal.getByRole("button", { name: /Descargar manifiesto/i })).toBeVisible();
    await modal.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(modal).toBeHidden();

    for (const o of ordenes) expect(await estadoDe(o)).toBe("en_ruta_bodega_central");

    // Sin el filtro, cada orden se ve con su estado nuevo.
    await page.goto("/ordenes");
    for (const o of ordenes) {
      await expect(filaDe(page, o).getByText("En ruta a bodega central")).toBeVisible();
    }
  });

  test("R977: la central las recibe con la pistola y quedan en bodega central", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes/recibir");
    await expect(page.getByText("Bodega central", { exact: true })).toBeVisible();

    const campo = page.getByLabel("Escanea la guía con la pistola");
    await expect(campo).toBeFocused();
    for (const o of ordenes) {
      await page.keyboard.type(String(o.numGuia));
      await page.keyboard.press("Enter");
    }
    for (const o of ordenes) {
      const fila = page
        .getByRole("log", { name: "Lecturas" })
        .getByRole("row", { name: new RegExp(String(o.numGuia)) });
      await expect(fila.getByText("Recibida", { exact: true })).toBeVisible();
    }
    for (const o of ordenes) {
      await expect.poll(() => estadoDe(o)).toBe("en_bodega_central");
    }
  });

  test("R978: «Rutear a bodega satélite» las acepta de nuevo", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");

    for (const o of ordenes) {
      const fila = filaDe(page, o);
      await expect(fila.getByText("En bodega central")).toBeVisible();
      await marcarCasilla(fila.getByRole("checkbox", { name: `Seleccionar orden ${o.numRemision}` }));
    }
    await page.getByRole("button", { name: "Rutear a bodega satélite", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Rutear a bodega satélite" });
    await expect(modal).toBeVisible();
    await modal.getByRole("button", { name: "Rutear a bodega satélite", exact: true }).click();
    await expect(modal.getByText("2 orden(es) en ruta a bodega satélite.").first()).toBeVisible();

    for (const o of ordenes) expect(await estadoDe(o)).toBe("en_ruta_bodega_satelite");
  });
});
