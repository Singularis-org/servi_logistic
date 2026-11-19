import { expect, test } from "@playwright/test";

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
 * E2E — Recepción en la bodega satélite (feature 33; SL-44 T5.1, R18).
 *
 * El `adminSatelite` ve en «Por recibir» la orden que la central ruteó a su bodega
 * (`en_ruta_bodega_satelite`), abre «Recibir paquete», teclea el número de guía (el mismo camino que
 * la pistola lectora, que «teclea» el código) y la orden pasa a `en_bodega_satelite`: sale de «Por
 * recibir» y aparece en «Órdenes de la bodega» con el estado «En bodega satélite».
 *
 * SLT-202 (Carlos, 2026-11-18): «Recibir paquete» es el único disparador y, en escritorio, lleva a la
 * recepción continua de SLT-159 («Recibir paquetes»); la guía suelta se quitó.
 *
 * DATOS (R7, R8): una empresa nueva por corrida (`crearEscenarioReparto`) y una orden llevada hasta
 * `en_ruta_bodega_satelite` por los servicios reales (carga masiva → generar guía → rutear).
 *
 * SLT-210 (R1400-R1410): en «Órdenes de la bodega», invertir el orden, ordenar por remisión (por su
 * CLAVE: `NA-90817` antes que `NA-908165`; el texto crudo las pondría al revés), guardar una vista y aplicarla sin tocar el orden.
 *
 * FUERA DE ESTE SPEC: la cámara (html5-qrcode necesita una cámara real) se verifica a mano.
 */

let r: RepartoE2E;
let orden: OrdenE2E;

test.describe.serial("Recepción satélite — recibir por número de guía", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("recepcion-satelite");
    orden = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_ruta_bodega_satelite");
  });

  test("la orden en camino está en «Por recibir» y al teclear su guía pasa a la bodega", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/por-recibir");

    const porRecibir = page.getByRole("region", { name: "Por recibir" });
    await expect(porRecibir.getByText(orden.numRemision).first()).toBeVisible();
    await expect(porRecibir.getByText(`Guía ${orden.numGuia}`).first()).toBeVisible();

    await page.getByRole("link", { name: "Recibir paquete", exact: true }).click();
    await expect(page).toHaveURL(/\/recepcion-satelite\/recibir\?desde=por-recibir$/);
    const campo = page.getByLabel("Escanea la guía con la pistola");
    await expect(campo).toBeFocused();
    await page.keyboard.type(String(orden.numGuia));
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("log", { name: "Lecturas" }).getByRole("row", { name: new RegExp(String(orden.numGuia)) }).getByText("Recibida", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Terminar recepción (1)" }).click();
    await expect(page).toHaveURL(/\/recepcion-satelite\/por-recibir$/);

    // De vuelta en «Por recibir», la orden ya no está…
    await expect(porRecibir.getByText(orden.numRemision)).toHaveCount(0);
    expect(await estadoDe(orden)).toBe("en_bodega_satelite");

    // …y está en la bodega, con su estado legible.
    await page.goto("/recepcion-satelite/en-bodega");
    const fila = page.getByRole("table", { name: "Órdenes de la bodega" }).getByRole("row", { name: new RegExp(orden.numRemision) });
    await expect(fila.getByText("En bodega satélite")).toBeVisible();
  });

  test("SLT-210: ordenar, guardar una vista y aplicarla en «Órdenes de la bodega»", async ({ browser }) => {
    // Dos órdenes más en la bodega, creadas EN ESTE ORDEN: la de «NA-908165» antes que la de «NA-90817».
    // Por fecha la más nueva es «NA-90817»; por la clave de remisión, «NA-90817» va antes que «NA-908165».
    const vieja = await llevarA(r, await crearOrden(r, { zona: "satelite", numRemision: "NA-908165" }), "en_bodega_satelite");
    const nueva = await llevarA(r, await crearOrden(r, { zona: "satelite", numRemision: "NA-90817" }), "en_bodega_satelite");

    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/en-bodega");
    const tabla = page.getByRole("table", { name: "Órdenes de la bodega" });
    const filaDe = (o: OrdenE2E) => tabla.getByRole("row", { name: new RegExp(o.numRemision) });
    await expect(filaDe(vieja)).toBeVisible();
    await expect(filaDe(nueva)).toBeVisible();
    /** Posición de cada orden en la tabla, leída de las filas pintadas. */
    const posicion = async (o: OrdenE2E) =>
      (await tabla.getByRole("row").allInnerTexts()).findIndex((t) => t.includes(o.numRemision));
    const antes = async (a: OrdenE2E, b: OrdenE2E) => {
      await expect.poll(async () => (await posicion(a)) < (await posicion(b))).toBe(true);
    };

    // R1401: por defecto, las más recientes primero.
    const campo = page.getByRole("group", { name: "Ordenar por" });
    await expect(campo.getByRole("button", { name: "Fecha de creación" })).toHaveAttribute("aria-pressed", "true");
    await antes(nueva, vieja);

    // R1402: «Más antiguas» invierte; cambiar a remisión conserva la dirección (ascendente).
    await page.getByRole("group", { name: "Dirección del orden por fecha de creación" }).getByRole("button", { name: "Más antiguas" }).click();
    await antes(vieja, nueva);
    await campo.getByRole("button", { name: "Número de remisión" }).click();
    await expect(
      page.getByRole("group", { name: "Dirección del orden por número de remisión" }).getByRole("button", { name: "Más bajas" }),
    ).toHaveAttribute("aria-pressed", "true");
    await antes(nueva, vieja); // NA-90817 < NA-908165 por la clave; el texto crudo las pondría al revés

    // R1408: guardar una vista con la búsqueda puesta.
    const buscar = page.getByRole("searchbox", { name: "Buscar órdenes de la bodega" });
    await buscar.fill(nueva.numRemision);
    await expect(filaDe(vieja)).toHaveCount(0);
    await expect(filaDe(nueva)).toBeVisible();
    await page.getByRole("button", { name: "Vistas guardadas" }).click();
    await page.getByRole("button", { name: /Guardar filtros actuales/ }).click();
    const modal = page.getByRole("dialog");
    await modal.getByRole("textbox", { name: "Nombre" }).fill("Solo NA-90817");
    await modal.getByRole("button", { name: "Guardar" }).click();
    await expect(modal).toHaveCount(0);
    await page.keyboard.press("Escape");

    // «Limpiar todo» deja ver las dos y NO toca el orden (R1407).
    await page.getByRole("button", { name: /Limpiar todo/ }).click();
    await expect(filaDe(vieja)).toBeVisible();
    await expect(campo.getByRole("button", { name: "Número de remisión" })).toHaveAttribute("aria-pressed", "true");

    // R1409: aplicar la vista repone la búsqueda y no cambia el orden.
    await page.getByRole("button", { name: "Vistas guardadas" }).click();
    await page.getByRole("button", { name: "Aplicar «Solo NA-90817»" }).click();
    await expect(buscar).toHaveValue(nueva.numRemision);
    await expect(filaDe(vieja)).toHaveCount(0);
    await expect(filaDe(nueva)).toBeVisible();
    await expect(campo.getByRole("button", { name: "Número de remisión" })).toHaveAttribute("aria-pressed", "true");
  });
});
