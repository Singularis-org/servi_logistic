import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import { ALTO_MOVIL, tactil } from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R910-R917, R919, R925). Es la
 * primera MEDICIÓN real de estos controles (el informe de la comparación leyó las clases).
 *
 *  (a) Reparto a 360 px, vista Mosaico: «Ver detalle completo» mide ≥ 44 de alto a todo el ancho
 *      (R910); el (i) del estado tiene su caja de 16 × 16 y `elementFromPoint` a 20 px de su centro
 *      devuelve el botón (R916); pulsar a 18 px del centro abre la explicación y la tarjeta no pide
 *      «¿Gestionar esta orden?» (R917).
 *  (b) Encabezado y menú a 360 px: hamburguesa, «Instalar» (si el navegador lo ofrece), «Ayuda» (si la
 *      pantalla tiene documento), «Cambiar tema», «Notificaciones» y «Salir» ≥ 44 × 44 (R911); el
 *      documento no desborda en horizontal (R912); con el menú abierto, cada ítem visible ≥ 44 de alto
 *      (R914).
 *  (c) A 1280 px, «Salir» sigue en 32 px de alto (R913).
 *  (d) Cierre del día a 360 px: el (i) de la gestión (`FilaGestion`) acierta a 20 px de su centro (R919).
 *  (e) El escáner de Reparto a 360 px: barra «Abrir orden por guía» y un único «Cerrar» ≥ 44 × 44 (R925).
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`), un mensajero por caso con SUS órdenes, por los
 * servicios reales. Sin datos, los `expect` fallan: no se salta nada. Las medidas tras una animación
 * o un scroll van con `expect.poll` / `toPass`.
 */

let r: RepartoE2E;

const REPARTO = "/mis-asignaciones/reparto";
const CIERRE_DIA = "/cierre-dia";

async function conOrdenEnReparto(m: MensajeroE2E, destinatario: string) {
  return llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 5000, destinatario }), "en_reparto", {
    mensajero: m,
  });
}

/**
 * Lo que hay en el punto a (dx, dy) del centro del control: «propio» si es el control (o su
 * `::after`); si no, una descripción corta de lo que lo tapa, para el mensaje del fallo.
 */
function queHayEn(control: Locator, dx: number, dy: number): Promise<string> {
  return control.evaluate(
    (el, [x, y]) => {
      const r = el.getBoundingClientRect();
      const punto = document.elementFromPoint(r.left + r.width / 2 + x, r.top + r.height / 2 + y);
      if (punto !== null && (punto === el || el.contains(punto))) return "propio";
      return punto === null ? "nada" : `${punto.tagName} ${(punto.getAttribute("class") ?? "").slice(0, 80)}`;
    },
    [dx, dy] as const,
  );
}

/** R916/R919: a 20 px del centro, en las cuatro direcciones, el punto es del (i). */
async function areaDe44(control: Locator): Promise<void> {
  await expect(async () => {
    // Al centro de la ventana: arriba lo taparía la barra fija de la búsqueda (`sticky`, z-20).
    await control.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const caja = await control.boundingBox();
    expect(caja, "el (i) no tiene caja").not.toBeNull();
    // La caja NO crece: el área la pone el pseudo-elemento.
    expect(Math.round(caja!.width)).toBe(16);
    expect(Math.round(caja!.height)).toBe(16);
    for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20]] as const) {
      expect(await queHayEn(control, dx, dy), `a (${dx}, ${dy}) del centro`).toBe("propio");
    }
  }).toPass({ timeout: 10_000 });
}

/** La caja de un control visible. */
async function cajaDe(l: Locator) {
  await expect(l).toBeVisible();
  const caja = await l.boundingBox();
  expect(caja, "sin caja (¿está visible?)").not.toBeNull();
  return caja!;
}

async function enMovil(page: Page, ruta: string) {
  await page.goto(ruta);
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
}

test.describe("SLT-193 — botones de 44 px en la PWA del mensajero", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("pwa-mensajero-botones-44");
  });

  test("(a) R910, R916, R917: Mosaico a 360 px — «Ver detalle completo» y el (i) del estado", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await conOrdenEnReparto(m, "Paula Mosaico");
    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await enMovil(page, REPARTO);

    const tarjeta = page.locator("article").filter({ hasText: "Paula Mosaico" }).first();
    await expect(tarjeta).toBeVisible();

    // R910: 44 de alto y todo el ancho del bloque (su caja de contenido: sin borde ni padding).
    const ver = tarjeta.getByRole("button", { name: "Ver detalle completo" });
    await ver.scrollIntoViewIfNeeded();
    await expect(async () => {
      const caja = await cajaDe(ver);
      const bloque = await ver.evaluate((el) => {
        const padre = el.parentElement!;
        const cs = getComputedStyle(padre);
        return padre.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      });
      expect(caja.height).toBeGreaterThanOrEqual(44);
      expect(caja.width).toBeGreaterThanOrEqual(bloque - 1);
    }).toPass({ timeout: 10_000 });
    await expect(ver).toHaveAttribute("aria-expanded", "false");

    // R916: el (i) del estado, caja de 16 y área de 44.
    const info = tarjeta.getByRole("button", { name: "Qué significa «En reparto»" });
    await areaDe44(info);

    // R917: se pulsa a 18 px del centro (dentro del área, fuera de la caja): se abre la explicación y
    // la tarjeta no se selecciona.
    const caja = await cajaDe(info);
    await page.mouse.click(caja.x + caja.width / 2 - 18, caja.y + caja.height / 2);
    await expect(page.getByRole("dialog", { name: "En reparto" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "¿Gestionar esta orden?" })).toHaveCount(0);
    await expect(ver).toHaveAttribute("aria-expanded", "false");
  });

  test("(b) R911, R912, R914: encabezado y menú a 360 px", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await conOrdenEnReparto(m, "Encabezado Móvil");
    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await enMovil(page, REPARTO);

    // R911: cada control del encabezado, 44 × 44 (por su rol y su nombre de hoy).
    const hamburguesa = page.locator('[data-slot="sidebar-trigger"]');
    await tactil(hamburguesa);
    const condicionales = [
      page.getByRole("button", { name: "Instalar la aplicación" }),
      page.getByRole("button", { name: "Ayuda de esta pantalla" }),
    ];
    for (const control of condicionales) {
      // «Cuando se ofrece» / «cuando la pantalla tiene documento»: si está, mide 44.
      if ((await control.count()) > 0 && (await control.first().isVisible())) await tactil(control.first());
    }
    await tactil(page.locator("header").getByRole("button", { name: /tema/i }));
    await tactil(page.getByRole("button", { name: /^Notificaciones/ }));
    await tactil(page.getByRole("button", { name: "Salir" }));

    // R912: el documento no desborda en horizontal.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);

    // R914: con el menú abierto, cada ítem y subítem visible mide 44 de alto.
    await hamburguesa.click();
    const menu = page.locator('[data-slot="sidebar"][data-mobile="true"]');
    await expect(menu).toBeVisible();
    // Se despliegan los submenús para medir también los subítems.
    const plegados = menu.locator('button[aria-expanded="false"]');
    while ((await plegados.count()) > 0) await plegados.first().click();
    const items = menu.locator(
      '[data-slot="sidebar-menu-button"], [data-slot="sidebar-menu-sub-button"], button[aria-expanded]',
    );
    await expect(async () => {
      const altos = await items.evaluateAll((els) =>
        els
          .filter((el) => el.getBoundingClientRect().width > 0)
          .map((el) => ({ texto: (el.textContent ?? "").trim(), alto: el.getBoundingClientRect().height })),
      );
      expect(altos.length).toBeGreaterThan(0);
      expect(altos.filter((a) => a.alto < 44)).toEqual([]);
    }).toPass({ timeout: 10_000 });
  });

  test("(c) R913: a 1280 px, «Salir» sigue en 32 px de alto", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await conOrdenEnReparto(m, "Escritorio Igual");
    const page = await paginaDe(browser, m, { viewport: { width: 1280, height: 800 } });
    await enMovil(page, REPARTO);
    const salir = await cajaDe(page.getByRole("button", { name: "Salir" }));
    expect(Math.round(salir.height)).toBe(32);
  });

  test("(d) R919: Cierre del día a 360 px — el (i) de la gestión acierta a 20 px", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const orden = await conOrdenEnReparto(m, "Gestión Entregada");
    await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 5000 }] });
    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await enMovil(page, CIERRE_DIA);

    const info = page.getByRole("button", { name: "Qué significa «Entregado»" }).locator("visible=true").first();
    await expect(info).toBeVisible();
    await areaDe44(info);
  });

  test("(e) R925: el escáner de Reparto a 360 px — barra con título y un solo «Cerrar» de 44 × 44", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await conOrdenEnReparto(m, "Escáner Reparto");
    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await enMovil(page, REPARTO);

    await page.getByRole("button", { name: "Escanear o escribir guía" }).click();
    const dialogo = page.getByRole("dialog", { name: "Abrir orden por guía" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByRole("heading", { name: "Abrir orden por guía" })).toHaveCount(1);
    await expect(dialogo.getByText("Escanea o ingresa el número de guía de una orden de tu reparto.")).toHaveCount(0);
    const cerrar = dialogo.getByRole("button", { name: "Cerrar" });
    await expect(cerrar).toHaveCount(1);
    await expect(async () => tactil(cerrar)).toPass({ timeout: 10_000 });
    await cerrar.click();
    await expect(dialogo).toHaveCount(0);
  });
});
