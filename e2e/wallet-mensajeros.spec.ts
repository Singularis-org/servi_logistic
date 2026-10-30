import { expect, test } from "@playwright/test";

import { crearEscenarioCaja, importe, type CajaE2E } from "./_escenarios/caja";
import { navegarCon } from "./_escenarios/pulsar";
import { paginaDe } from "./_escenarios/reparto";

/**
 * E2E — `/wallet/mensajeros`, las cuentas por pagar a mensajeros (features 44, 458-D; SL-44 T6.3,
 * R18).
 *
 * Recorre lo que declara D5: las cuentas por pagar, el desglose y el bloqueo de otro rol.
 *  1. El maestro ve la fila del mensajero con lo devengado, lo pagado del efectivo y la cuenta por
 *     pagar; el buscador por nombre la esconde con un nombre que no casa y la devuelve con el suyo.
 *  2. Abre su estado de cuenta: el saldo, la frase de quién le debe a quién, los dos movimientos del
 *     cierre y, en el desglose del devengo, las dos órdenes que lo pagan.
 *  3. Un mensajero y una tienda piden `/wallet/mensajeros` (y el estado de cuenta): 404, sin cifras.
 *
 * DATOS (R7, R8): `crearEscenarioCaja`. El libro del mensajero lo alimenta la APROBACIÓN del cierre
 * (`CierresAdminService`, feature 44); nada se escribe a mano.
 *
 * CIFRAS, escritas a mano a partir del escenario (pago al mensajero 1.500 por entrega; de lo cobrado,
 * 1.000 en efectivo y 7.000 por transferencia):
 *   - devengado P = 2 × 1.500 = 3.000;
 *   - efectivo recaudado E = 1.000 (la transferencia no es efectivo) → pagado = mín(P, E) = 1.000;
 *   - cuenta por pagar = 3.000 − 1.000 = 2.000 → «La empresa le debe 2.000 a <mensajero>».
 */

let c: CajaE2E;

test.describe.serial("Cuentas por pagar a mensajeros — cuenta, desglose y bloqueo", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    c = await crearEscenarioCaja("wallet-mensajeros");
  });

  test("el maestro ve la cuenta por pagar del mensajero y la busca por su nombre", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const res = await page.goto("/wallet/mensajeros");
    expect(res?.status()).toBe(200);

    const tabla = page.getByRole("table", { name: "Cuentas por pagar a mensajeros" });
    const fila = tabla.getByRole("row").filter({ hasText: c.mensajero.nombre });
    await expect(fila).toHaveCount(1);
    // Columnas: Mensajero · Devengado · Pagado · Cuenta por pagar · Estado · Estado de cuenta.
    const celdas = fila.getByRole("cell");
    await expect(celdas.nth(1)).toHaveText(importe(3000));
    await expect(celdas.nth(2)).toHaveText(importe(1000));
    await expect(celdas.nth(3)).toHaveText(importe(2000));
    await expect(celdas.nth(4)).toHaveText("Pendiente");

    const buscador = page.getByRole("searchbox", { name: "Buscar por mensajero" });
    await buscador.fill(`nadie-${c.mensajero.id.slice(0, 8)}`);
    await expect(fila).toHaveCount(0);
    await buscador.fill(c.mensajero.nombre);
    await expect(fila).toHaveCount(1);
  });

  test("el estado de cuenta del mensajero desglosa el devengo y el pago del cierre", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    await page.goto("/wallet/mensajeros");
    // Recién cargada, la página puede no estar hidratada y el clic en el enlace se pierde (run
    // 40875969358 de CI: la URL siguió en `/wallet/mensajeros`): ver `navegarCon`.
    await navegarCon(
      page,
      page.getByRole("link", { name: `Ver estado de cuenta de ${c.mensajero.nombre}` }),
      new RegExp(`/wallet/mensajeros/${c.mensajero.id}$`),
    );

    const tarjeta = page.getByRole("region", { name: `Saldo de ${c.mensajero.nombre}` });
    await expect(tarjeta.getByText(`La empresa le debe`)).toContainText(importe(2000));
    await expect(tarjeta.getByText(`La empresa le debe`)).toContainText(c.mensajero.nombre);

    const libro = page.getByRole("table", { name: `Estado de cuenta de ${c.mensajero.nombre}` });
    const devengo = libro.getByRole("row").filter({ hasText: "Pago devengado" });
    const pago = libro.getByRole("row").filter({ hasText: "Pago del efectivo" });
    await expect(devengo).toHaveCount(1);
    await expect(pago).toHaveCount(1);
    await expect(devengo).toContainText(importe(3000));
    await expect(pago).toContainText(importe(1000));

    await page.getByRole("button", { name: /^Ver las órdenes que componen «Pago devengado»/ }).click();
    await expect(page.getByText(c.conCod.destinatario)).toBeVisible();
    await expect(page.getByText(c.sinCod.destinatario)).toBeVisible();
  });

  test("un mensajero y una tienda reciben 404 en las cuentas por pagar y no ven cifras (R19)", async ({ browser }) => {
    for (const u of [c.mensajero, c.r.tienda]) {
      const page = await paginaDe(browser, u);
      for (const ruta of ["/wallet/mensajeros", `/wallet/mensajeros/${c.mensajero.id}`]) {
        const res = await page.goto(ruta);
        expect(res?.status(), `${ruta} para ${u.email}`).toBe(404);
        await expect(page.getByRole("table", { name: "Cuentas por pagar a mensajeros" })).toHaveCount(0);
        await expect(page.getByRole("region", { name: `Saldo de ${c.mensajero.nombre}` })).toHaveCount(0);
      }
      await page.context().close();
    }
  });
});
