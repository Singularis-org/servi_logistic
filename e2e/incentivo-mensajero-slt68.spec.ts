import { expect, test, type Locator, type Page } from "@playwright/test";

import { crearEscenarioCaja, importe, type CajaE2E } from "./_escenarios/caja";
import { baseReparto, paginaDe } from "./_escenarios/reparto";

/**
 * E2E — SLT-68 (R22): el incentivo manual a un mensajero, de punta a punta en el navegador.
 *
 *  1. El maestro registra un incentivo desde «Registrar un movimiento» de `/wallet`, con el concepto
 *     «La empresa le da un incentivo a un mensajero».
 *  2. En `/wallet/mensajeros` la cuenta por pagar de ese mensajero sube el monto, y su estado de cuenta
 *     lo muestra como «Incentivo».
 *  3. Lo anula desde el panel «Ver» de su fila en la caja, con un motivo.
 *  4. La cuenta por pagar y la ganancia vuelven a su valor; el libro conserva el incentivo y suma su
 *     «Anulación de incentivo».
 *
 * DATOS (R7, R8): `crearEscenarioCaja` — un mensajero con un cierre APROBADO (al que se imputa el
 * incentivo, Q1). Nada se escribe a mano.
 *
 * CIFRAS, escritas a mano a partir del escenario (ver `wallet-mensajeros.spec.ts` y `wallet.spec.ts`):
 *   - cuenta por pagar antes = 3.000 devengado − 1.000 pagado del efectivo = 2.000;
 *   - ganancia de la empresa antes = 1.000;
 *   - incentivo M = 700 ⇒ cuenta por pagar 2.700 y ganancia 300; tras anularlo, 2.000 y 1.000.
 */

const MONTO = "700";
const MOTIVO = "SLT-68 E2E: cumplió todas las entregas";
const MOTIVO_ANULACION = "SLT-68 E2E: monto equivocado";
const CONCEPTO = "La empresa le da un incentivo a un mensajero";
/** Cómo se llama en la CAJA la fila del incentivo (`egreso_pago_mensajero`). */
const CONCEPTO_EN_CAJA = "La empresa le paga a un mensajero";

let c: CajaE2E;

/**
 * Pulsa hasta que se abra lo esperado. Recién cargada, la página puede no estar hidratada todavía y el
 * primer clic cae en el HTML del servidor sin manejador. Abrir es idempotente.
 */
async function abrirCon(control: Locator, abierto: Locator): Promise<void> {
  await expect(async () => {
    await control.click({ timeout: 2_000 });
    await expect(abierto).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

function ganancia(page: Page): Locator {
  return page.getByRole("region", { name: "Ganancia de la empresa", exact: true });
}

/** La celda «Cuenta por pagar» de la fila del mensajero en `/wallet/mensajeros`. */
async function cuentaPorPagar(page: Page): Promise<Locator> {
  const res = await page.goto("/wallet/mensajeros");
  expect(res?.status()).toBe(200);
  const fila = page
    .getByRole("table", { name: "Cuentas por pagar a mensajeros" })
    .getByRole("row")
    .filter({ hasText: c.mensajero.nombre });
  await expect(fila).toHaveCount(1);
  // Columnas: Mensajero · Devengado · Pagado · Cuenta por pagar · Estado · Estado de cuenta.
  return fila.getByRole("cell").nth(3);
}

async function libroDelMensajero(page: Page): Promise<Locator> {
  const res = await page.goto(`/wallet/mensajeros/${c.mensajero.id}`);
  expect(res?.status()).toBe(200);
  const libro = page.getByRole("table", { name: `Estado de cuenta de ${c.mensajero.nombre}` });
  await expect(libro).toBeVisible();
  return libro;
}

/** Las filas del libro cuyo concepto es EXACTAMENTE ese texto («Incentivo» no casa con su anulación). */
function filasDeConcepto(libro: Locator, concepto: string): Locator {
  return libro.getByRole("row").filter({ has: libro.page().getByText(concepto, { exact: true }) });
}

async function incentivosEnLaBase() {
  return baseReparto().pagoMensajeroMovimiento.findMany({
    where: { organizacionId: c.r.empresa.organizacionId, categoria: { in: ["incentivo", "reverso_incentivo"] } },
    orderBy: { createdAt: "asc" },
    select: { tipo: true, categoria: true, monto: true },
  });
}

test.describe.serial("SLT-68 — incentivo manual a un mensajero: registrar, verlo como «Incentivo» y anularlo (R22)", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    c = await crearEscenarioCaja("incentivo-slt68");
  });

  test("antes: la cuenta por pagar del mensajero es 2.000 y la ganancia 1.000", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    await expect(await cuentaPorPagar(page)).toHaveText(importe(2000));
    await page.goto("/wallet");
    await expect(ganancia(page)).toContainText(importe(1000));
    expect(await incentivosEnLaBase()).toEqual([]);
  });

  test("el maestro registra un incentivo de 700 desde «Registrar un movimiento»", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const res = await page.goto("/wallet");
    expect(res?.status()).toBe(200);

    const dialogo = page.getByRole("dialog");
    await abrirCon(page.getByRole("button", { name: "Registrar un movimiento" }), dialogo);
    await dialogo.getByRole("radio", { name: CONCEPTO }).click();
    // La cabecera pasa a ser la del concepto (R19) y dice qué le pasa al dinero.
    await expect(page.getByRole("dialog", { name: CONCEPTO })).toBeVisible();
    await expect(dialogo).toContainText("sube lo que le debe y baja su ganancia");
    await expect(dialogo).toContainText("en el libro del mensajero como «Incentivo»");

    await dialogo.getByRole("button", { name: /^Mensajero que recibe el incentivo:/ }).click();
    await page.getByRole("combobox", { name: "Buscar el mensajero" }).fill(c.mensajero.nombre);
    await page.getByRole("option", { name: c.mensajero.nombre }).click();
    await dialogo.getByRole("textbox", { name: "Monto" }).fill(MONTO);
    await dialogo.getByRole("textbox", { name: "Motivo del incentivo" }).fill(MOTIVO);
    await dialogo.getByRole("button", { name: "Registrar", exact: true }).click();

    await expect(page.getByText(/^Incentivo de .+ registrado\./).first()).toBeVisible({ timeout: 30_000 });
    await expect(dialogo).toBeHidden();
    // D5/R7: baja la ganancia en M.
    await expect(ganancia(page)).toContainText(importe(300), { timeout: 30_000 });

    expect((await incentivosEnLaBase()).map((m) => [m.tipo, m.categoria, m.monto.toString()])).toEqual([
      ["devengo", "incentivo", "700"],
    ]);
  });

  test("en /wallet/mensajeros la cuenta por pagar sube a 2.700 y su libro lo rotula «Incentivo»", async ({ browser }) => {
    const page = await paginaDe(browser, c.r.empresa.maestro);
    await expect(await cuentaPorPagar(page)).toHaveText(importe(2700));

    const libro = await libroDelMensajero(page);
    const incentivo = filasDeConcepto(libro, "Incentivo");
    await expect(incentivo).toHaveCount(1);
    await expect(incentivo).toContainText(importe(700));
    await expect(incentivo).toContainText(MOTIVO);
  });

  test("lo anula desde «Ver» de su fila en la caja, y la cuenta por pagar y la ganancia vuelven", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await paginaDe(browser, c.r.empresa.maestro);
    const res = await page.goto("/wallet");
    expect(res?.status()).toBe(200);

    const ver = page.getByRole("button", {
      name: new RegExp(`^Ver «${CONCEPTO_EN_CAJA}» del .+ por \\D*${importe(700).source}$`),
    });
    await expect(ver).toHaveCount(1);
    const panel = page.getByRole("dialog", { name: CONCEPTO_EN_CAJA });
    await abrirCon(ver, panel);
    await panel.getByRole("button", { name: "Anular…", exact: true }).click();
    const anular = page.getByRole("dialog", { name: /^Anular / });
    await expect(anular).toBeVisible();
    await anular.getByLabel(/^Motivo de la anulación/).fill(MOTIVO_ANULACION);
    await anular.getByRole("button", { name: "Anular", exact: true }).click();
    await expect(anular).toBeHidden({ timeout: 30_000 });
    await page.keyboard.press("Escape");

    // R14: la ganancia vuelve a 1.000.
    await expect(ganancia(page)).toContainText(importe(1000), { timeout: 30_000 });
    // R14: la cuenta por pagar vuelve a 2.000.
    await expect(await cuentaPorPagar(page)).toHaveText(importe(2000));

    // R13/R18: el incentivo sigue en el libro y se suma su contraasiento.
    const libro = await libroDelMensajero(page);
    await expect(filasDeConcepto(libro, "Incentivo")).toHaveCount(1);
    await expect(filasDeConcepto(libro, "Anulación de incentivo")).toHaveCount(1);
    expect((await incentivosEnLaBase()).map((m) => [m.tipo, m.categoria, m.monto.toString()])).toEqual([
      ["devengo", "incentivo", "700"],
      ["pago", "reverso_incentivo", "700"],
    ]);
  });
});
