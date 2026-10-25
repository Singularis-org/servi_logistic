import { expect, test, type Locator, type Page } from "@playwright/test";

import { crearEscenarioCaja, importe, movimientosCajaDe, type CajaE2E } from "./_escenarios/caja";
import { paginaDe } from "./_escenarios/reparto";

/**
 * E2E — `/wallet`, la caja principal de la empresa (features 42, 173, 231, 334, 459, 467; SL-44 T6.3,
 * R18).
 *
 * Recorre lo que declara D5: la caja del maestro, el filtro del libro, el registro manual y el
 * bloqueo de otro rol.
 *  1. El maestro ve las cifras de la caja (flujo, «Entró», «Salió», el conteo, la ganancia y lo que la
 *     empresa les debe a las tiendas) y el libro con los tres movimientos que dejó aprobar el cierre.
 *  2. Filtra el libro por «Entra/Sale» = «Sale»: queda solo el pago al mensajero y las cifras de arriba
 *     no se mueven (el filtro del libro no relee la caja, ficha 467 R13). «Limpiar todo» lo devuelve.
 *  3. Registra a mano una «Corrección de caja (resta)»: sin motivo, el diálogo lo bloquea; con motivo,
 *     queda en el libro y las cifras se releen solas.
 *  4. Un mensajero y una tienda piden `/wallet`: 404 y ninguna cifra ni libro.
 *
 * DATOS (R7, R8): `crearEscenarioCaja` (empresa nueva, dos entregas en la zona central, cierre
 * solicitado por `CierreDiaService` y aprobado por `CierresAdminService`). Ninguna fila de caja se
 * escribe a mano.
 *
 * CIFRAS, escritas a mano a partir del escenario (flete 2.000 por entrega, pago al mensajero 1.500 por
 * entrega, una entrega cobra 8.000 y la otra nada):
 *   - libro: flete cobrado a la tienda 2 × 2.000 = 4.000 (entra, de la empresa) · contra-entrega 8.000
 *     (entra, de la tienda) · pago al mensajero 2 × 1.500 = 3.000 (sale) → 3 movimientos;
 *   - «Entró» 8.000: solo el contra-entrega es dinero que entra; el flete es un CARGO a la tienda, se
 *     toma de ese mismo dinero (ficha 459, `LIQUIDEZ_POR_CATEGORIA`);
 *   - «Salió» 3.000 · flujo 8.000 − 3.000 = 5.000 · ganancia 4.000 − 3.000 = 1.000 · a las tiendas
 *     8.000 − 4.000 = 4.000;
 *   - tras la corrección de 500: «Salió» 3.500 · flujo 4.500 · 4 movimientos.
 * La deuda con la plataforma (SL-40) no entra en ninguna de estas cifras y no se afirma: depende del
 * cobro por orden, que es un ajuste global.
 */

const MOTIVO = "Faltante del arqueo E2E";

let c: CajaE2E;

/** El dato secundario de la tarjeta («Entró», «Salió», «Movimientos»): su rótulo y su valor. */
function dato(resumen: Locator, rotulo: string): Locator {
  return resumen.getByText(rotulo, { exact: true }).locator("xpath=..");
}

async function abrirWallet(page: Page) {
  const res = await page.goto("/wallet");
  expect(res?.status()).toBe(200);
  const libro = page.getByRole("table", { name: "Libro de movimientos" });
  await expect(libro).toBeVisible();
  return {
    resumen: page.getByRole("region", { name: "Resumen de la caja y acciones" }),
    flujo: page.getByRole("region", { name: "Flujo de dinero registrado" }),
    libro,
    filas: libro.locator("tbody tr"),
  };
}

test.describe.serial("Wallet — caja del maestro, filtro, registro manual y bloqueo", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    c = await crearEscenarioCaja("wallet");
  });

  test("el maestro ve las cifras de la caja y los tres movimientos del cierre", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const { resumen, flujo, filas } = await abrirWallet(page);

    await expect(flujo).toContainText(importe(5000));
    await expect(dato(resumen, "Entró")).toContainText(importe(8000));
    await expect(dato(resumen, "Salió")).toContainText(importe(3000));
    await expect(dato(resumen, "Movimientos")).toContainText(/(?<!\d)3(?!\d)/);
    await expect(page.getByRole("region", { name: "Ganancia de la empresa", exact: true })).toContainText(importe(1000));
    await expect(page.getByRole("region", { name: "Lo que la empresa les debe a las tiendas" })).toContainText(importe(4000));

    await expect(filas).toHaveCount(3);
    await expect(filas.filter({ hasText: "Flete cobrado a la tienda" })).toContainText(importe(4000));
    await expect(filas.filter({ hasText: "Contra-entrega cobrado a los clientes de la tienda" })).toContainText(importe(8000));
    const pago = filas.filter({ hasText: "La empresa le paga a un mensajero" });
    await expect(pago).toContainText(importe(3000));
    await expect(pago).toContainText(c.mensajero.nombre);

    // El desglose de la fila del flete: las dos órdenes del cierre.
    await page.getByRole("button", { name: /^Ver las órdenes que componen «Flete cobrado a la tienda»/ }).click();
    await expect(page.getByText(c.conCod.destinatario)).toBeVisible();
    await expect(page.getByText(c.sinCod.destinatario)).toBeVisible();
  });

  test("filtrar el libro por «Sale» deja solo el pago al mensajero y no mueve las cifras", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const { resumen, flujo, filas } = await abrirWallet(page);
    await expect(filas).toHaveCount(3);

    await page.getByRole("button", { name: "Filtros" }).click();
    await page.getByRole("option", { name: "Entra/Sale" }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Entra/Sale" }).click();
    await page.getByRole("option", { name: "Sale", exact: true }).click();

    await expect(filas).toHaveCount(1);
    await expect(filas.first()).toContainText("La empresa le paga a un mensajero");
    await expect(filas.first()).toContainText(importe(3000));
    // El filtro es del libro: la caja sigue diciendo lo mismo.
    await expect(flujo).toContainText(importe(5000));
    await expect(dato(resumen, "Entró")).toContainText(importe(8000));

    await page.getByRole("button", { name: "Limpiar todo" }).click();
    await expect(filas).toHaveCount(3);
  });

  test("la corrección de caja exige el motivo y, con él, entra en el libro y en las cifras", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const { resumen, flujo, filas } = await abrirWallet(page);

    await page.getByRole("button", { name: "Registrar un movimiento" }).click();
    const dialogo = page.getByRole("dialog", { name: "Registrar movimiento en la caja" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("radio", { name: "Corrección de caja (resta)" }).click();
    await dialogo.getByRole("textbox", { name: "Monto" }).fill("500");

    // Sin motivo no se registra nada.
    await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(dialogo.getByRole("alert").filter({ hasText: "La descripción es obligatoria." })).toBeVisible();
    expect((await movimientosCajaDe(c.r)).filter((m) => m.origenTipo === "manual")).toHaveLength(0);

    await dialogo.getByRole("textbox", { name: "Motivo de la corrección" }).fill(MOTIVO);
    await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();
    await expect(page.getByText("Movimiento registrado correctamente.").first()).toBeVisible();
    await expect(dialogo).toBeHidden();

    // Las cifras se releen solas: sale 500 más.
    await expect(dato(resumen, "Salió")).toContainText(importe(3500));
    await expect(flujo).toContainText(importe(4500));
    await expect(dato(resumen, "Movimientos")).toContainText(/(?<!\d)4(?!\d)/);
    await expect(filas).toHaveCount(4);
    const correccion = filas.filter({ hasText: MOTIVO });
    await expect(correccion).toContainText("Sale");
    await expect(correccion).toContainText(importe(500));

    const manuales = (await movimientosCajaDe(c.r)).filter((m) => m.origenTipo === "manual");
    expect(manuales.map((m) => [m.tipo, m.categoria, m.monto.toString()])).toEqual([["egreso", "egreso_ajuste", "500"]]);
  });

  test("un mensajero y una tienda reciben 404 en /wallet y no ven cifras ni libro (R19)", async ({ browser }) => {
    for (const u of [c.mensajero, c.r.tienda]) {
      const page = await paginaDe(browser, u);
      const res = await page.goto("/wallet");
      expect(res?.status(), `/wallet para ${u.email}`).toBe(404);
      await expect(page.getByRole("region", { name: "Flujo de dinero registrado" })).toHaveCount(0);
      await expect(page.getByRole("table", { name: "Libro de movimientos" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Ganancia de la empresa", exact: true })).toHaveCount(0);
      await page.context().close();
    }
  });
});
