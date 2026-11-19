import { expect, test, type Page } from "@playwright/test";

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
 * E2E — SLT-222 «Tablas de órdenes: la selección se mantiene entre búsquedas y escaneos» (T4).
 *
 * En las DOS tablas de órdenes con casilla, la persona busca una orden (escribiendo su remisión,
 * como lo haría la pistola), la marca, busca la siguiente, la marca… y la barra cuenta las dos
 * («2 seleccionadas · 1 fuera de esta búsqueda») y la acción en lote las recibe a las dos:
 *
 *   - `/ordenes` (la tienda): «Imprimir etiquetas» enseña las DOS etiquetas (R1501, R1505, R1506).
 *   - `/recepcion-satelite/en-bodega` (adminSatelite): «Asignar» abre el modal con 2 órdenes
 *     (R1501, R1505, R1506).
 *
 * Ninguna de las dos acciones se confirma: abrir el modal basta para ver qué lote recibe, y así el
 * spec no mueve el estado de las órdenes.
 *
 * DATOS (R7, R8 de SL-44): una empresa nueva por corrida (`crearEscenarioReparto`); las órdenes se
 * llevan por los servicios reales al estado de cada pantalla y se buscan por su remisión.
 */

let r: RepartoE2E;
let centrales: OrdenE2E[];
let satelite: OrdenE2E[];

/** Escribe el término en el buscador y espera a que la tabla enseñe SOLO esa orden. */
async function buscar(page: Page, buscador: string, tabla: string, o: OrdenE2E, otra: OrdenE2E) {
  await page.getByRole("searchbox", { name: buscador, exact: true }).fill(o.numRemision);
  const t = page.getByRole("table", { name: tabla, exact: true });
  await expect(t.getByRole("row", { name: new RegExp(otra.numRemision) })).toHaveCount(0);
  await expect(t.getByRole("row", { name: new RegExp(o.numRemision) })).toBeVisible();
}

test.describe.serial("SLT-222 — la selección se mantiene entre búsquedas", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("seleccion-entre-busquedas");
    const mensajero = await crearMensajero(r, "central");
    centrales = [];
    for (let i = 0; i < 2; i++) {
      centrales.push(
        await llevarA(r, await crearOrden(r, { zona: "central" }), "mensajero_recogiendo_en_bodega", { mensajero }),
      );
    }
    satelite = [];
    for (let i = 0; i < 2; i++) {
      satelite.push(await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite"));
    }
  });

  test("/ordenes: buscar A, marcar, buscar B, marcar: la barra dice 2 y las etiquetas son las dos", async ({ browser }) => {
    const [a, b] = centrales as [OrdenE2E, OrdenE2E];
    const page = await paginaDe(browser, r.tienda);
    await page.goto("/ordenes");

    await buscar(page, "Buscar órdenes", "Órdenes", a, b);
    await page.getByRole("checkbox", { name: `Seleccionar orden ${a.numRemision}` }).check();
    await buscar(page, "Buscar órdenes", "Órdenes", b, a);
    await page.getByRole("checkbox", { name: `Seleccionar orden ${b.numRemision}` }).check();

    await expect(page.getByText("2 seleccionadas · 1 fuera de esta búsqueda")).toBeVisible();
    await page.getByRole("button", { name: "Imprimir etiquetas", exact: true }).click();

    const dialogo = page.getByRole("dialog", { name: "Imprimir etiquetas" });
    await expect(dialogo).toBeVisible();
    for (const o of [a, b]) {
      await expect(dialogo.getByRole("article", { name: `Etiqueta de la orden ${o.numRemision}` })).toBeVisible();
    }
    await expect(dialogo.getByRole("article", { name: /^Etiqueta de la orden / })).toHaveCount(2);
  });

  test("bodega satélite: buscar A, marcar, buscar B, marcar: la barra dice 2 y «Asignar» recibe las dos", async ({ browser }) => {
    const [a, b] = satelite as [OrdenE2E, OrdenE2E];
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/en-bodega");
    const tabla = "Órdenes de la bodega";

    await buscar(page, "Buscar órdenes de la bodega", tabla, a, b);
    await page.getByRole("checkbox", { name: `Seleccionar ${a.numRemision}` }).check();
    await buscar(page, "Buscar órdenes de la bodega", tabla, b, a);
    await page.getByRole("checkbox", { name: `Seleccionar ${b.numRemision}` }).check();

    const region = page.getByRole("region", { name: tabla });
    await expect(region.getByText(/2 seleccionadas · 1 fuera de esta búsqueda/)).toBeVisible();
    await region.getByRole("button", { name: "Asignar", exact: true }).click();

    const dialogo = page.getByRole("dialog", { name: "Asignar mensajero" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText(/Asigna un mensajero a 2 orden\(es\) seleccionada\(s\)/)).toBeVisible();
  });
});
