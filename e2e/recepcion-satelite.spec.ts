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
});
