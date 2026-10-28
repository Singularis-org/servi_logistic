import path from "node:path";

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

/**
 * E2E — Tope de intentos de entrega (features 47, 215 y 276; SL-44 T5.4, R18).
 *
 * El umbral legal es 3 intentos (`REINTENTOS_MIN_INTENTOS`, por defecto 3). Desde la feature 276 la
 * gestión que ALCANZA el tope ya no puede devolver la orden a circulación: con dos intentos
 * vigentes, el panel del mensajero explica la condición (nota) y deja de ofrecer «Reprogramar» y
 * «Devolver»; quedan «Entregar» y «Rechazar». Así una orden no da una cuarta vuelta: el tercer
 * intento termina en el cliente o vuelve al origen. (El escalado «la tercera devolución la rechaza
 * el sistema» que describía la feature 47 ya no existe: lo sustituyó esta puerta.)
 *
 *  1. Dos intentos (reprogramaciones con su cierre aprobado y su liberación por el cron).
 *  2. Tercer intento, en la UI: nota del tope, sin «Reprogramar» ni «Devolver»; el mensajero rechaza.
 *  3. Aprobado el cierre, la tienda abre el historial: «Intento 3 de 3», dos «Reprogramado» y el
 *     rechazo del mensajero, todo con etiquetas legibles.
 *
 * DATOS (R7, R8): empresa nueva; cada intento por los servicios reales — `MisAsignacionesService`
 * (gestión), `CierreDiaService` + `CierresAdminService` (cierre), `CorreccionFechaReprogramacionService`
 * (la fecha llega a hoy) y el cron real `liberar-reprogramadas` (vuelve a la bodega) —, y vuelta a
 * `en_reparto` por la asignación y la recogida.
 */

const UMBRAL = 3;
const EVIDENCIA = path.join(__dirname, "fixtures", "evidencia.jpg");
const CONTEXTO_MENSAJERO = { geolocation: { latitude: 9.9281, longitude: -84.0907 }, permissions: ["geolocation"] };
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let r: RepartoE2E;
let mensajero: MensajeroE2E;
let orden: OrdenE2E;

test.describe.serial("Tope de intentos — el tercer intento no vuelve a circulación", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("reintentos-escalado");
    mensajero = await crearMensajero(r, "satelite");
    orden = await crearOrden(r, { zona: "satelite" });
    for (let intento = 1; intento < UMBRAL; intento++) {
      orden = await llevarA(r, orden, "en_reparto", { mensajero });
      await gestionar(r, orden, mensajero, { resultado: "reprogramado", motivo: `Intento ${intento}: no estaba` });
      await aprobarCierre(r, await solicitarCierre(r, mensajero));
      await corregirFechaReprogramacion(r, orden);
      await correrCron("liberar-reprogramadas");
      expect(await estadoDe(orden)).toBe("en_bodega_satelite");
    }
    orden = await llevarA(r, orden, "en_reparto", { mensajero });
  });

  test("con dos intentos, el panel solo ofrece entregar o rechazar; el mensajero rechaza", async ({ browser }) => {
    const page = await paginaDe(browser, mensajero, CONTEXTO_MENSAJERO);
    await page.goto("/mis-asignaciones/reparto");
    const panel = page.getByRole("region", { name: "Detalle de la orden" });
    await expect(panel.getByText(`Guía ${orden.numGuia}`).first()).toBeVisible();
    await panel.getByRole("button", { name: "Gestionar esta orden" }).click();
    const gate = panel.getByRole("region", { name: "Verificar la guía del paquete antes de gestionar" });
    await gate.getByLabel("Número de guía").fill(String(orden.numGuia));
    await gate.getByRole("button", { name: "Gestionar", exact: true }).click();
    await expect(panel.getByText("¿Cómo terminó la gestión?")).toBeVisible();

    await expect(panel.getByRole("note").first()).toBeVisible();
    await expect(panel.getByRole("button", { name: "Reprogramar", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Devolver", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Entregar", exact: true })).toBeVisible();

    await panel.getByRole("button", { name: "Rechazar", exact: true }).click();
    await page.getByLabel("Foto de evidencia del rechazo", { exact: true }).setInputFiles(EVIDENCIA);
    await panel.getByLabel("Motivo").fill("Intento 3: no la quiere");
    await panel.getByRole("button", { name: "Guardar gestión" }).click();
    await expect(page.getByText(`Orden ${orden.numRemision}: Devolución a origen por rechazo.`)).toBeVisible();
  });

  test("aprobado el cierre, el historial cuenta «Intento 3 de 3»", async ({ browser }) => {
    await aprobarCierre(r, await solicitarCierre(r, mensajero));
    expect(await estadoDe(orden)).toBe("por_devolver_a_bodega_central");

    const page = await paginaDe(browser, r.tienda);
    await page.goto("/ordenes");
    await page.getByRole("button", { name: `Ver historial de la orden ${orden.numRemision}` }).click();
    const dialogo = page.getByRole("dialog", { name: `Historial de la orden ${orden.numRemision}` });

    const badge = dialogo.getByRole("status", { name: `Intentos de entrega: ${UMBRAL} de ${UMBRAL}` });
    await expect(badge).toHaveText(`Intento ${UMBRAL} de ${UMBRAL}`);

    const linea = dialogo.getByRole("list", { name: "Línea de tiempo de la orden" });
    await expect(dialogo.getByText(UUID_RE)).toHaveCount(0);
    const entradas = linea.getByRole("listitem");
    await expect(entradas.filter({ hasText: /Motivo: Intento \d: no estaba/ })).toHaveCount(UMBRAL - 1);
    const rechazo = entradas.filter({ hasText: "Motivo: Intento 3: no la quiere" });
    await expect(rechazo).toHaveCount(1);
    await expect(rechazo.getByText("Devolución a origen por rechazo")).toBeVisible();
    await expect(rechazo.getByText(`Por ${mensajero.nombre}`)).toBeVisible();
  });
});
