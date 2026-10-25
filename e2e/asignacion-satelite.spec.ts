import { expect, test } from "@playwright/test";

import { marcarCasilla } from "./_escenarios/casillas";
import { drenarGeocodificacion } from "./_escenarios/crons";
import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Asignación desde la bodega satélite (feature 34; SL-44 T5.1, R18).
 *
 * El `adminSatelite` marca en «Órdenes de la bodega» una orden recibida (`en_bodega_satelite`) de su
 * zona, pulsa «Asignar», elige en el modal a un mensajero de su zona y confirma. El modal pasa a la
 * fase «resultado» (resumen + manifiesto del lote); al cerrarla, la orden sale de las asignables:
 * queda `mensajero_recogiendo_en_bodega` con ese mensajero, y el mensajero la ve en «Recoger en
 * bodega». Este spec se para en esa frontera; recogerla es de `mis-asignaciones`.
 *
 * DATOS (R7, R8): empresa nueva (`crearEscenarioReparto`), un mensajero de la satélite y una orden
 * llevada hasta `en_bodega_satelite` por los servicios reales. La geocodificación de la orden se
 * drena con el cron real `procesar-jobs` (sin credencial de mapas falla por configuración, y con
 * ese fallo el gate deja asignar sin ubicación, feature 400).
 */

let r: RepartoE2E;
let mensajero: MensajeroE2E;
let orden: OrdenE2E;

test.describe.serial("Asignación satélite — asignar un mensajero de la zona", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("asignacion-satelite");
    mensajero = await crearMensajero(r, "satelite");
    orden = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite");
    await drenarGeocodificacion([orden.id]);
  });

  test("marcar la orden → Asignar → elegir el mensajero → queda asignada a él", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/en-bodega");

    const bodega = page.getByRole("region", { name: "Órdenes de la bodega" });
    const marcar = bodega.getByRole("checkbox", { name: `Seleccionar ${orden.numRemision}` });
    await expect(marcar).toBeVisible();
    await marcarCasilla(marcar);
    await bodega.getByRole("button", { name: "Asignar", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Asignar mensajero" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(orden.numRemision)).toBeVisible();
    await modal.getByRole("combobox", { name: "Mensajero para el lote" }).click();
    await page.getByRole("option", { name: mensajero.nombre, exact: true }).click();
    await modal.getByRole("button", { name: "Asignar", exact: true }).click();

    // Fase «resultado»: el resumen de lo cometido y el manifiesto del lote.
    await expect(modal.getByText("Mensajero asignado a 1 orden(es).").first()).toBeVisible();
    await expect(modal.getByRole("button", { name: /Descargar manifiesto/i })).toBeVisible();
    await modal.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(modal).toBeHidden();

    // Al cerrar se refresca: la fila sigue en la bodega (se puede deshacer) pero con el estado nuevo.
    const fila = bodega.getByRole("row", { name: new RegExp(orden.numRemision) });
    await expect(fila.getByText("Mensajero recogiendo en la bodega")).toBeVisible();
    await expect(fila.getByText("En bodega satélite")).toHaveCount(0);
    expect(await estadoDe(orden)).toBe("mensajero_recogiendo_en_bodega");
    const enBase = await baseReparto().orden.findUniqueOrThrow({ where: { id: orden.id }, select: { mensajeroAsignadoId: true } });
    expect(enBase.mensajeroAsignadoId).toBe(mensajero.id);

    // El mensajero la tiene para recoger en la bodega.
    const suya = await paginaDe(browser, mensajero);
    await suya.goto("/mis-asignaciones/recoger");
    await expect(suya.getByRole("region", { name: "Recoger en bodega" }).getByText(orden.numRemision).first()).toBeVisible();
  });
});
