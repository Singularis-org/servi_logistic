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
 * DATOS (R7, R8): una empresa nueva por corrida (`crearEscenarioReparto`) y una orden llevada hasta
 * `en_ruta_bodega_satelite` por los servicios reales (carga masiva → generar guía → rutear).
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

    await page.getByRole("button", { name: "Recibir paquete" }).click();
    const tarjeta = page.getByRole("region", { name: "Recibir por número de guía o escaneo" });
    await tarjeta.getByLabel("Número de guía").fill(String(orden.numGuia));
    await tarjeta.getByRole("button", { name: "Recibir", exact: true }).click();

    await expect(page.getByText(`Guía ${orden.numGuia} recibida.`, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    // Tras el refresco, la orden ya no está por recibir…
    await expect(porRecibir.getByText(orden.numRemision)).toHaveCount(0);
    expect(await estadoDe(orden)).toBe("en_bodega_satelite");

    // …y está en la bodega, con su estado legible.
    await page.goto("/recepcion-satelite/en-bodega");
    const fila = page.getByRole("table", { name: "Órdenes de la bodega" }).getByRole("row", { name: new RegExp(orden.numRemision) });
    await expect(fila.getByText("En bodega satélite")).toBeVisible();
  });
});
