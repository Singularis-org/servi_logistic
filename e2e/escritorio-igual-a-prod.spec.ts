import { expect, test, type Locator, type Page } from "@playwright/test";

import { crearEscenarioReparto, crearOrden, llevarA, paginaDe, type RepartoE2E } from "./_escenarios/reparto";

/**
 * E2E — SLT-202 «Escritorio igual a prod: tamaños de controles y un solo botón de recibir».
 *
 * Decisión de Carlos del 2026-11-18: en escritorio, cada control mide lo que medía en prod; por
 * debajo de `md` (el teléfono) se conservan los 44 px que pidieron SLT-160 (R771) y SLT-194.
 *
 * - A 1280 px, la barra de Órdenes («Vistas», los dos conmutadores de orden, el campo, la cámara,
 *   «Filtros» y «Descargar») mide 32 px y todos sus controles comparten `top` y `height`: antes el
 *   campo, la cámara y «Filtros» medían 44 y los demás 32, desalineados.
 * - A 360 px, el campo, la cámara y «Filtros» siguen en 44.
 * - Un solo disparador de recibir, «Recibir paquete», que lleva a la recepción continua (SLT-159).
 *
 * DATOS (R7, R8): una empresa nueva por corrida y una orden en bodega central, para que el listado
 * tenga tabla y «Descargar».
 */

let r: RepartoE2E;

async function cajaDe(l: Locator) {
  await expect(l).toBeVisible();
  const caja = await l.boundingBox();
  expect(caja, "sin caja (¿está visible?)").not.toBeNull();
  return caja!;
}

async function abrirOrdenes(page: Page) {
  await page.goto("/ordenes");
  await expect(page.getByRole("searchbox", { name: "Buscar órdenes" })).toBeVisible();
}

/** Los controles de la barra de Órdenes que existían en prod más la cámara, con su nombre. */
function controlesDeLaBarra(page: Page): Array<[string, Locator]> {
  return [
    ["Vistas", page.getByRole("button", { name: /^Vistas/ })],
    ["Ordenar por", page.getByRole("group", { name: "Ordenar por" })],
    ["campo", page.getByRole("searchbox", { name: "Buscar órdenes" })],
    ["cámara", page.getByRole("button", { name: "Escanear con cámara" })],
    ["Filtros", page.getByRole("button", { name: /^Filtros/ })],
    ["Descargar", page.getByRole("button", { name: /^Descargar/ }).first()],
  ];
}

test.describe.serial("SLT-202 — escritorio igual a prod en Órdenes", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("escritorio-igual-a-prod");
    await llevarA(r, await crearOrden(r, { zona: "central" }), "en_bodega_central");
  });

  test("a 1280 px la barra mide 32 px y todos sus controles comparten top y height", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro, { viewport: { width: 1280, height: 900 } });
    await abrirOrdenes(page);

    const campo = await cajaDe(page.getByRole("searchbox", { name: "Buscar órdenes" }));
    for (const [nombre, control] of controlesDeLaBarra(page)) {
      const caja = await cajaDe(control);
      expect(Math.round(caja.height), `alto de «${nombre}»`).toBe(32);
      expect(Math.abs(caja.y - campo.y), `top de «${nombre}» frente al campo`).toBeLessThanOrEqual(1);
    }
  });

  test("a 360 px el campo, la cámara y «Filtros» siguen en 44 px", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro, { viewport: { width: 360, height: 800 } });
    await abrirOrdenes(page);

    for (const [nombre, control] of [
      ["campo", page.getByRole("searchbox", { name: "Buscar órdenes" })],
      ["cámara", page.getByRole("button", { name: "Escanear con cámara" })],
      ["Filtros", page.getByRole("button", { name: /^Filtros/ })],
    ] as const) {
      const caja = await cajaDe(control);
      expect(Math.round(caja.height), `alto de «${nombre}» en el móvil`).toBe(44);
      if (nombre === "cámara") expect(Math.round(caja.width), "ancho de la cámara en el móvil").toBe(44);
    }
  });

  test("un solo disparador de recibir, «Recibir paquete», que lleva a la recepción continua", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro, { viewport: { width: 1280, height: 900 } });
    await abrirOrdenes(page);

    const recibir = page.getByRole("link", { name: "Recibir paquete", exact: true });
    await expect(recibir).toBeVisible();
    await expect(page.getByRole("link", { name: /Recibir paquete/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Recibir paquete/ })).toHaveCount(0);

    await recibir.click();
    await expect(page).toHaveURL(/\/ordenes\/recibir$/);
    await expect(page.getByRole("heading", { name: "Recibir paquetes" })).toBeVisible();
  });
});
