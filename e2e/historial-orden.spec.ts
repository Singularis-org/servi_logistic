import { expect, test } from "@playwright/test";

import { aprobarCierre, solicitarCierre } from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
import {
  corregirFechaReprogramacion,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import { crearUsuarioE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

/**
 * E2E — Historial de estados de una orden (feature 49; SL-44 T5.3, R18).
 *
 * La tienda dueña abre «Ver historial» desde `/ordenes` y la línea de tiempo enseña, en orden
 * cronológico y con etiquetas legibles (nunca un id):
 *  - primero, la CREACIÓN («Creación · En preparación»), firmada por la tienda que la cargó;
 *  - la REPROGRAMACIÓN del mensajero («En reparto → Reprogramado»), con su nombre y su motivo;
 *  - al final, la LIBERACIÓN del cron («Reprogramado → En bodega satélite») por «Sistema».
 * Lado deny (R27): otra tienda de la misma empresa no tiene el disparador de esa orden.
 *
 * DATOS (R7, R8): empresa nueva; la orden llevada por los servicios reales hasta `en_reparto`,
 * reprogramada por el mensajero (`MisAsignacionesService`), su cierre solicitado y aprobado (la
 * aprobación aplica el estado, ficha 454), la fecha corregida a hoy por el maestro
 * (`CorreccionFechaReprogramacionService`) y liberada por el cron real `liberar-reprogramadas`.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MOTIVO = "Cliente ausente";

let r: RepartoE2E;
let mensajero: MensajeroE2E;
let otraTienda: UsuarioE2E;
let orden: OrdenE2E;

test.describe.serial("Historial de la orden — línea de tiempo", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("historial-orden");
    mensajero = await crearMensajero(r, "satelite");
    otraTienda = await crearUsuarioE2E(r.empresa, "adminTienda");
    orden = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero });
    await gestionar(r, orden, mensajero, { resultado: "reprogramado", motivo: MOTIVO });
    await aprobarCierre(r, await solicitarCierre(r, mensajero));
    await corregirFechaReprogramacion(r, orden);
    await correrCron("liberar-reprogramadas");
  });

  test("la tienda abre el historial: creación, reprogramación con actor y motivo, liberación del sistema", async ({ browser }) => {
    const page = await paginaDe(browser, r.tienda);
    await page.goto("/ordenes");

    await page.getByRole("button", { name: `Ver historial de la orden ${orden.numRemision}` }).click();
    const dialogo = page.getByRole("dialog", { name: `Historial de la orden ${orden.numRemision}` });
    await expect(dialogo.getByRole("heading", { name: `Historial de la orden ${orden.numRemision}` })).toBeVisible();

    const linea = dialogo.getByRole("list", { name: "Línea de tiempo de la orden" });
    const entradas = linea.getByRole("listitem");
    await expect(entradas.first()).toBeVisible();
    await expect(dialogo.getByText(UUID_RE)).toHaveCount(0);

    // La reprogramación: actor humano (el mensajero) y su motivo.
    const reprogramacion = entradas.filter({ hasText: `Motivo: ${MOTIVO}` });
    await expect(reprogramacion).toHaveCount(1);
    await expect(reprogramacion.getByText("Reprogramado").first()).toBeVisible();
    await expect(reprogramacion.getByText(`Por ${mensajero.nombre}`)).toBeVisible();

    // La primera es la creación, firmada por la tienda que cargó la orden.
    const primera = entradas.first();
    await expect(primera.getByText("Creación")).toBeVisible();
    await expect(primera.getByText("En preparación")).toBeVisible();
    await expect(primera.getByText(`Por ${r.tienda.nombre}`)).toBeVisible();

    // La última es la liberación del cron: «Sistema», sin motivo, y la orden de vuelta en la bodega.
    const ultima = entradas.last();
    await expect(ultima.getByText("Reprogramado")).toBeVisible();
    await expect(ultima.getByText("En bodega satélite")).toBeVisible();
    await expect(ultima.getByText("Por Sistema")).toBeVisible();
    expect(await estadoDe(orden)).toBe("en_bodega_satelite");
  });

  test("otra tienda de la empresa no tiene el disparador del historial de esa orden (R27)", async ({ browser }) => {
    const page = await paginaDe(browser, otraTienda);
    await page.goto("/ordenes");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: `Ver historial de la orden ${orden.numRemision}` })).toHaveCount(0);
    await expect(page.getByText(orden.numRemision)).toHaveCount(0);
  });
});
