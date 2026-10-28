import { expect, test, type Locator, type Page } from "@playwright/test";

import { crearEscenarioCaja, importe, type CajaE2E } from "./_escenarios/caja";
import { paginaDe } from "./_escenarios/reparto";

/**
 * E2E — `/mi-wallet`, el estado de cuenta de la TIENDA con la empresa (features 43, 335, 458-D, 467;
 * SL-44 T6.3, R18).
 *
 * Recorre lo que declara D5: el saldo de la tienda, su desglose y el bloqueo de otro rol.
 *  1. La tienda ve el resumen de su cuenta (a su favor, cargos, ya pagado y el saldo), la tarjeta
 *     «Saldo actual» con la frase de quién le debe a quién, y el libro con los dos movimientos que
 *     dejó aprobar el cierre; abre el desglose del flete y ve sus dos órdenes.
 *  2. Filtra el libro por «Tipo de movimiento»: con «Pagos» no queda ninguno de los dos movimientos;
 *     con «Cierres», los dos.
 *  3. Un mensajero y el maestro piden `/mi-wallet`: 404 y ningún saldo ni libro.
 *
 * DATOS (R7, R8): `crearEscenarioCaja` (la tienda del escenario es la dueña de las dos órdenes; el
 * cierre lo solicita `CierreDiaService` y lo aprueba `CierresAdminService`). Ninguna fila del libro
 * de la tienda se escribe a mano.
 *
 * CIFRAS, escritas a mano a partir del escenario (flete 2.000 por entrega; una entrega cobra 8.000 y
 * la otra nada):
 *   - a tu favor: el contra-entrega cobrado, 8.000;
 *   - cargos de la empresa: el flete de las dos entregas, 2 × 2.000 = 4.000;
 *   - ya pagado: 0 (nadie le pagó nada a la tienda);
 *   - saldo a favor: 8.000 − 4.000 − 0 = 4.000 → «La empresa te debe 4.000».
 */

let c: CajaE2E;

/** Un importe del resumen («A tu favor», «Cargos de la empresa», «Ya pagado»): su rótulo y su cifra. */
function importeDe(resumen: Locator, rotulo: string): Locator {
  return resumen.getByText(rotulo, { exact: true }).locator("xpath=..");
}

async function abrirMiWallet(page: Page) {
  const res = await page.goto("/mi-wallet");
  expect(res?.status()).toBe(200);
  const libro = page.getByRole("table", { name: `Estado de cuenta de ${c.r.tienda.nombre}` });
  await expect(libro).toBeVisible();
  return { resumen: page.getByRole("region", { name: "Resumen de tu cuenta" }), libro };
}

test.describe.serial("Mi wallet — saldo de la tienda, desglose y bloqueo", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    c = await crearEscenarioCaja("mi-wallet");
  });

  test("la tienda ve su saldo, el resumen y los dos movimientos del cierre, con su desglose", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.tienda);
    const { resumen, libro } = await abrirMiWallet(page);

    await expect(importeDe(resumen, "A tu favor")).toContainText(importe(8000));
    await expect(importeDe(resumen, "Cargos de la empresa")).toContainText(importe(4000));
    await expect(importeDe(resumen, "Ya pagado")).toContainText(importe(0));
    await expect(importeDe(resumen, "Saldo a favor")).toContainText(importe(4000));

    const tarjeta = page.getByRole("region", { name: `Saldo de ${c.r.tienda.nombre}` });
    await expect(tarjeta).toContainText(importe(4000));
    await expect(tarjeta.getByText(/La empresa te debe/)).toContainText(importe(4000));

    const cod = libro.getByRole("row").filter({ hasText: "Cobrado a tus clientes en contra-entrega" });
    const flete = libro.getByRole("row").filter({ hasText: "La empresa te cobró el flete" });
    await expect(cod).toHaveCount(1);
    await expect(flete).toHaveCount(1);
    await expect(cod).toContainText(importe(8000));
    await expect(flete).toContainText(importe(4000));

    await page.getByRole("button", { name: /^Ver las órdenes que componen «La empresa te cobró el flete»/ }).click();
    await expect(page.getByText(c.conCod.destinatario)).toBeVisible();
    await expect(page.getByText(c.sinCod.destinatario)).toBeVisible();
  });

  test("el filtro «Tipo de movimiento» deja fuera los movimientos del cierre con «Pagos» y los trae con «Cierres»", async ({
    browser,
  }) => {
    const page = await paginaDe(browser, c.r.tienda);
    const { libro } = await abrirMiWallet(page);
    const delCierre = libro.getByRole("row").filter({ hasText: /Cobrado a tus clientes en contra-entrega|La empresa te cobró el flete/ });
    await expect(delCierre).toHaveCount(2);

    await page.getByRole("button", { name: "Filtros" }).click();
    await page.getByRole("option", { name: "Tipo de movimiento" }).click();
    await page.keyboard.press("Escape");
    const tipo = page.getByRole("combobox", { name: "Tipo de movimiento" });

    await tipo.click();
    await page.getByRole("option", { name: "Pagos", exact: true }).click();
    await expect(delCierre).toHaveCount(0);

    await tipo.click();
    await page.getByRole("option", { name: "Cierres", exact: true }).click();
    await expect(delCierre).toHaveCount(2);
  });

  test("un mensajero y el maestro reciben 404 en /mi-wallet y no ven saldo ni libro (R19)", async ({ browser }) => {
    for (const u of [c.mensajero, c.r.empresa.maestro]) {
      const page = await paginaDe(browser, u);
      const res = await page.goto("/mi-wallet");
      expect(res?.status(), `/mi-wallet para ${u.email}`).toBe(404);
      await expect(page.getByRole("region", { name: "Resumen de tu cuenta" })).toHaveCount(0);
      await expect(page.getByRole("table", { name: `Estado de cuenta de ${c.r.tienda.nombre}` })).toHaveCount(0);
      await page.context().close();
    }
  });
});
