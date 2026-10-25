import { expect, test } from "@playwright/test";

import { marcarCasilla } from "./_escenarios/casillas";
import { aprobarCierre, solicitarCierre } from "./_escenarios/cierres";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Devolución a la tienda de origen (features 48 y 139; SL-44 T5.3, R18).
 *
 * Una orden de la zona CENTRAL que el mensajero rechazó llega, al APROBARSE su cierre, a
 * `por_devolver_a_tienda` (feature 139: la central ya la tiene en la mano). El maestro la marca en
 * `/ordenes`, pulsa «Enviar a la tienda» y confirma en el modal (fase «resultado» con el manifiesto
 * del lote): la orden pasa a `devolviendo_a_tienda`. La tienda dueña la ve con su etiqueta legible
 * y, en su historial, la última transición es «Por devolver a tienda → Devolviendo a tienda», sin
 * ningún id crudo.
 *
 * DATOS (R7, R8): empresa nueva; un mensajero de la central; la orden llevada a `en_reparto` y
 * rechazada (con la foto, contra el doble de Storage) por `MisAsignacionesService`; el cierre
 * solicitado por `CierreDiaService` y aprobado por el maestro con `CierresAdminService`.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

let r: RepartoE2E;
let orden: OrdenE2E;

test.describe.serial("Devolución a la tienda — por_devolver_a_tienda → devolviendo_a_tienda", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("devolucion-origen");
    const m = await crearMensajero(r, "central");
    orden = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, orden, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    await aprobarCierre(r, await solicitarCierre(r, m));
    expect(await estadoDe(orden)).toBe("por_devolver_a_tienda");
  });

  test("el maestro envía a la tienda la orden que la central tiene por devolver", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");

    const fila = page.getByRole("row", { name: new RegExp(orden.numRemision) });
    await expect(fila.getByText("Por devolver a tienda")).toBeVisible();
    await marcarCasilla(fila.getByRole("checkbox", { name: `Seleccionar orden ${orden.numRemision}` }));
    await page.getByRole("button", { name: "Enviar a la tienda", exact: true }).click();

    const modal = page.getByRole("dialog", { name: "Enviar a la tienda" });
    await expect(modal).toBeVisible();
    await expect(modal.getByText(orden.numRemision)).toBeVisible();
    await modal.getByRole("button", { name: "Enviar a la tienda", exact: true }).click();

    await expect(modal.getByText("1 orden(es) enviada(s) a la tienda.").first()).toBeVisible();
    await expect(modal.getByRole("button", { name: /Descargar manifiesto/i })).toBeVisible();
    await modal.getByRole("button", { name: "Cerrar" }).first().click();
    await expect(modal).toBeHidden();

    await expect(fila.getByText("Devolviendo a tienda")).toBeVisible();
    expect(await estadoDe(orden)).toBe("devolviendo_a_tienda");
  });

  test("la tienda la ve devolviéndose y su historial termina en esa transición", async ({ browser }) => {
    const page = await paginaDe(browser, r.tienda);
    await page.goto("/ordenes");

    const fila = page.getByRole("row", { name: new RegExp(orden.numRemision) });
    await expect(fila.getByText("Devolviendo a tienda")).toBeVisible();

    await page.getByRole("button", { name: `Ver historial de la orden ${orden.numRemision}` }).click();
    const dialogo = page.getByRole("dialog", { name: `Historial de la orden ${orden.numRemision}` });
    const linea = dialogo.getByRole("list", { name: "Línea de tiempo de la orden" });
    await expect(linea).toBeVisible();
    await expect(dialogo.getByText(UUID_RE)).toHaveCount(0);

    const ultima = linea.getByRole("listitem").last();
    await expect(ultima.getByText("Por devolver a tienda")).toBeVisible();
    await expect(ultima.getByText("Devolviendo a tienda")).toBeVisible();
    await expect(ultima.getByText(`Por ${r.empresa.maestro.nombre}`)).toBeVisible();
  });
});
