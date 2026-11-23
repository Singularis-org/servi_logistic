import { expect, test, type Page } from "@playwright/test";

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
import {
  ALTO_MOVIL,
  ANCHOS_MOVIL,
  DESTINATARIO_LARGO,
  IMPORTE_LARGO,
  sinDesborde,
  sinElipsis,
  sinSolapes,
} from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-156 «PWA de los mensajeros: tablas usables en el móvil», rebanada A «Base común» (A8; R490-R493,
 * R497, R501).
 *
 *  (a) R490, R501: Reparto a 360 y 414 px, con la orden de destinatario más largo (80 caracteres, una
 *      palabra de 40 sin espacios): el documento no desborda en horizontal y ninguna tarjeta recorta
 *      con «…»; el destinatario se ve entero.
 *  (b) R497, R498: al bajar por Reparto, los dos flotantes («Reportar un problema» y el chat) miden
 *      44 px; al volver arriba, su tamaño de hoy (48 / 56 px).
 *  (c) R490-R492: `/cierre-dia` a 1280 px, con una gestión de destinatario largo e importe de
 *      ₡99.999.999: en «Gestiones» no hay «…» y los datos de la fila no se montan.
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`), cada caso con SU mensajero de la zona satélite y
 * SUS órdenes, por los servicios reales. El escenario solo deja fijar destinatario, remisión y monto
 * (`crearOrden`): la dirección, el producto y la tienda largos de `design.md §12` llegan con las
 * rebanadas que amplían el escenario. Sin datos, los `expect` fallan: no se salta nada.
 */

let r: RepartoE2E;

const REPARTO = "/mis-asignaciones/reparto";

async function enReparto(m: MensajeroE2E, destinatario: string, montoCobrar = 5000): Promise<OrdenE2E> {
  return llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar, destinatario }), "en_reparto", { mensajero: m });
}

async function anchoDe(page: Page, nombre: string | RegExp): Promise<number> {
  const caja = await page.getByRole("button", { name: nombre }).boundingBox();
  expect(caja, `sin caja para ${String(nombre)}`).not.toBeNull();
  return Math.round(caja!.width);
}

test.describe("SLT-156 A — base común de las pantallas del mensajero", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("pwa-mensajero-base");
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) R490, R501: Reparto a ${ancho} px sin desborde ni «…», con el destinatario entero`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      await enReparto(m, DESTINATARIO_LARGO, 2500);
      await enReparto(m, "Beto Ruiz", 4000);

      const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(REPARTO);

      const tarjeta = page.locator("article").filter({ hasText: DESTINATARIO_LARGO });
      await expect(tarjeta.first()).toBeVisible();
      // El destinatario de la tarjeta (el `<p>`); el `<dd>` del detalle plegado repite el mismo texto.
      await expect(tarjeta.first().locator("p").filter({ hasText: DESTINATARIO_LARGO })).toHaveText(DESTINATARIO_LARGO);
      await expect(tarjeta.first().locator("p").filter({ hasText: DESTINATARIO_LARGO })).toBeVisible();

      await sinDesborde(page);
      await sinElipsis(page.locator("article"));
    });
  }

  test("(b) R497, R498: al bajar los flotantes miden 44 px; arriba, 48 y 56", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    // Bastantes órdenes para que la página tenga por dónde bajar a 360 × 780.
    for (let i = 0; i < 8; i++) await enReparto(m, `Destinatario ${i + 1}`);

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto(REPARTO);
    await expect(page.locator("article").first()).toBeVisible();

    const BUG = "Reportar un problema";
    const CHAT = /^Abrir chat con clientes/;
    expect(await anchoDe(page, BUG)).toBe(48);
    expect(await anchoDe(page, CHAT)).toBe(56);

    const alto = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(alto, "la página no tiene por dónde bajar").toBeGreaterThan(200);

    await page.mouse.wheel(0, 600);
    // Primero, que la VENTANA bajó (el hook escucha el `scroll` de `window`).
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: "la ventana no bajó" }).toBeGreaterThan(100);
    // En dev el JS puede hidratar después del gesto: el hook mide también al montar.
    await expect(page.getByRole("button", { name: BUG })).toHaveAttribute("data-compacto", "", { timeout: 15_000 });
    await expect.poll(() => anchoDe(page, BUG)).toBe(44);
    await expect.poll(() => anchoDe(page, CHAT)).toBe(44);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => anchoDe(page, BUG)).toBe(48);
    await expect.poll(() => anchoDe(page, CHAT)).toBe(56);
  });

  test("(c) R490-R492: /cierre-dia a 1280 px, «Gestiones» sin «…» ni datos montados", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const orden = await enReparto(m, DESTINATARIO_LARGO, IMPORTE_LARGO);
    await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: IMPORTE_LARGO }] });

    const page = await paginaDe(browser, m, { viewport: { width: 1280, height: 900 } });
    await page.goto("/cierre-dia");

    const lista = page.getByRole("region", { name: "Órdenes del cierre" });
    const fila = lista.locator("[data-gestion]").filter({ hasText: DESTINATARIO_LARGO });
    await expect(fila).toHaveCount(1);
    await expect(fila.getByText(DESTINATARIO_LARGO, { exact: true })).toBeVisible();

    await sinElipsis(lista);
    await sinSolapes(fila, "[data-columna]");
    await sinDesborde(page);
  });
});
