import { expect, test, type Locator, type Page } from "@playwright/test";

import { cierresDe, importe } from "./_escenarios/cierres";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  gestionesDe,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — «Cierre del día» del mensajero (features 37, 39 y 67; SL-44 T6.1, R18; SLT-109 «/cierre-dia:
 * el cierre de hoy, rechazado o vencido como página»).
 *
 *  (a) El mensajero, con todo lo suyo gestionado, ve su cierre de hoy como página: el detalle único
 *      con sus tres cifras y la lista de gestiones; pulsa «Solicitar cierre» en el pie, confirma, y el
 *      cierre aparece en «Cierres solicitados» como «Solicitado» con su destino.
 *  (b) Deshace una entrega antes de cerrar desde la fila (feature 67, SLT-109 R243): la fila sale, el
 *      efectivo baja y la orden vuelve a su lista de entregas, con la gestión anulada.
 *  (c) SLT-108 / SLT-109 (R256): la fila del incidente enseña su «Ganancia».
 *  (d) SLT-109 (R254): en un teléfono de 375 × 667, el botón del pie se ve sin desplazar la página y
 *      «Cierres solicitados» sigue debajo del detalle.
 *
 * DATOS (R7, R8): empresa nueva; cada caso con SU mensajero de la zona satélite y SUS órdenes,
 * llevadas hasta `en_reparto` y gestionadas por los servicios reales (`MisAsignacionesService`).
 * Tarifa del mensajero: 1.700 por entrega. Las cifras de abajo salen, a mano, de esas órdenes:
 *  (a) 8.000 en efectivo + 3.000 por SINPE → Efectivo 8.000, SINPE 3.000, Transferencia 0, Total
 *      general 11.000; ganancia 2 × 1.700 = 3.400.
 *      SLT-109 (R77, T0.4, modelo viejo) — las tres cifras del detalle, medidas en la base desechable
 *      `slt109_e2e` el 2026-11-12: «Recaudado» ₡11.000 (con Efectivo ₡8.000 y SINPE ₡3.000 debajo;
 *      Transferencia vale 0 y no se pinta), «Gestiones» 2 (las dos entregas) y «Tu ganancia» ₡3.400.
 *  (b) 5.000 + 2.000 en efectivo → Efectivo 7.000; deshecha la de 5.000 → Efectivo 2.000.
 *  (c) SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (R58, R162), T0.3: un incidente
 *      (causa «perdido», orden de 4.000) con la tarifa 1.700 / 300 del modelo viejo. Medido en la base
 *      desechable el 2026-11-11: la «Ganancia» dice «₡0». Derivación: `pagoPorResultado` del modelo
 *      viejo solo paga `entregado` (1.700); cualquier otro resultado, incidente incluido, da «0.00», y
 *      `money("0.00")` = «₡0». Un `null` pintaría «—».
 */

const TARIFA_MENSAJERO = { cobroEntregado: 1700, cobroRechazado: 300 };
const DETALLE = "Detalle del cierre · Tu cierre del día";

let r: RepartoE2E;

/** El valor de una cifra del detalle («Recaudado», «Gestiones», «Tu ganancia»). */
function cifra(page: Page, rotulo: string): Locator {
  return page.getByRole("region", { name: DETALLE }).getByRole("group", { name: rotulo, exact: true }).locator("[data-cifra]");
}

/** El importe de un método bajo «Recaudado»: el contenedor del rótulo exacto (`dt` + `dd`). */
function metodo(page: Page, rotulo: string): Locator {
  return page
    .getByRole("region", { name: DETALLE })
    .getByRole("group", { name: "Recaudado", exact: true })
    .getByText(rotulo, { exact: true })
    .locator("..");
}

/** La fila única de una gestión en la lista de «Gestiones», por su orden. */
function fila(page: Page, orden: OrdenE2E): Locator {
  return page
    .getByRole("region", { name: "Órdenes del cierre" })
    .locator("[data-gestion]")
    .filter({ has: page.getByRole("button", { name: `Devolver a gestión la orden ${orden.numRemision} · ${orden.destinatario}` }) });
}

async function entregada(m: MensajeroE2E, monto: number, metodoPago: "efectivo" | "SINPE"): Promise<OrdenE2E> {
  const orden = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: monto }), "en_reparto", { mensajero: m });
  await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: metodoPago, monto }] });
  return orden;
}

test.describe("Cierre del día — el mensajero solicita y deshace", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierre-dia", { tarifaMensajero: TARIFA_MENSAJERO });
  });

  test("(a) cifras del detalle y su lista → Solicitar cierre → «Solicitado» en el histórico", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const o1 = await entregada(m, 8000, "efectivo");
    const o2 = await entregada(m, 3000, "SINPE");

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");

    // R77 (modelo viejo): los literales de la cabecera, a mano.
    await expect(cifra(page, "Recaudado")).toHaveText(importe(11000, { solo: true }));
    await expect(metodo(page, "Efectivo")).toContainText(importe(8000));
    await expect(metodo(page, "SINPE")).toContainText(importe(3000));
    await expect(page.getByRole("region", { name: DETALLE }).getByText("Transferencia", { exact: true })).toHaveCount(0);
    await expect(cifra(page, "Gestiones")).toHaveText("2");
    await expect(cifra(page, "Tu ganancia")).toHaveText(importe(3400, { solo: true }));

    await expect(fila(page, o1)).toHaveCount(1);
    await expect(fila(page, o2)).toHaveCount(1);

    const solicitar = page.getByRole("region", { name: DETALLE }).getByRole("button", { name: "Solicitar cierre" });
    await expect(solicitar).toBeEnabled();
    await solicitar.click();
    const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
    await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
    await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();

    // SLT-137: «Cierres solicitados» es la cola del mensajero, una fila por cierre (la cabecera
    // también dice «Solicitado»: se lee la fila, no la región entera).
    const historico = page.getByRole("region", { name: "Cierres solicitados" });
    await expect(page.getByRole("tab", { name: "Cierres solicitados 1" })).toBeVisible();
    const filaCola = historico.getByRole("row").nth(1);
    await expect(filaCola.getByText("Solicitado", { exact: true })).toBeVisible();
    await expect(filaCola.getByRole("cell", { name: "Bodega satélite", exact: true })).toBeVisible();
    await expect(filaCola.getByRole("button", { name: /^Ver del cierre del \d{4}-\d{2}-\d{2}$/ })).toBeEnabled();

    // El cierre quedó con el snapshot de lo gestionado (R14 de la 37).
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => [c.estado, c.destinoTipo])).toEqual([["solicitado", "bodega_satelite"]]);
    const [c] = cierres;
    expect([c.totalEfectivo, c.totalSimpe, c.totalTransferencia, c.totalGeneral, c.totalPagoMensajero].map(String)).toEqual([
      "8000",
      "3000",
      "0",
      "11000",
      "3400",
    ]);
  });

  test("(b) Devolver a gestión desde la fila → la fila sale, el efectivo baja y la orden vuelve a entregas", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const deshacer = await entregada(m, 5000, "efectivo");
    const queda = await entregada(m, 2000, "efectivo");

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    await expect(fila(page, deshacer)).toHaveCount(1);
    await expect(metodo(page, "Efectivo")).toContainText(importe(7000));

    await page.getByRole("button", { name: `Devolver a gestión la orden ${deshacer.numRemision} · ${deshacer.destinatario}` }).click();
    const dialogo = page.getByRole("dialog", { name: "Devolver la orden a gestión" });
    await expect(dialogo).toContainText(/quedará anulada/);
    await dialogo.getByRole("button", { name: "Devolver a gestión" }).click();

    await expect(page.getByText("Gestión deshecha; la orden volvió a tu lista para gestionar.")).toBeVisible();
    await expect(fila(page, deshacer)).toHaveCount(0);
    await expect(fila(page, queda)).toHaveCount(1);
    await expect(metodo(page, "Efectivo")).toContainText(importe(2000));
    await expect(metodo(page, "Efectivo")).not.toContainText(importe(7000));

    // La gestión quedó anulada (con rastro) y la orden sigue en reparto con él, lista para re-gestionar.
    const gestiones = await gestionesDe(deshacer);
    expect(gestiones).toHaveLength(1);
    expect(gestiones[0].anuladaAt).not.toBeNull();
    expect(await estadoDe(deshacer)).toBe("en_reparto");

    await page.goto("/mis-asignaciones/reparto");
    await expect(page.getByText(deshacer.numRemision).first()).toBeVisible();
  });

  test("(c) SLT-108/SLT-109: la fila del incidente enseña su «Ganancia»", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const inc = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 4000 }), "en_reparto", { mensajero: m });
    await gestionar(r, inc, m, { resultado: "incidente", causa: "perdido" });

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    const lista = page.getByRole("region", { name: "Órdenes del cierre" });
    await expect(lista.getByText("Ganancia", { exact: true })).toBeVisible();
    const filaInc = fila(page, inc);
    await expect(filaInc.getByText("Incidente", { exact: true })).toBeVisible();
    // Literal medido una vez en la base desechable (T0.3 de SLT-108): «₡0», un importe y no «—».
    await expect(filaInc.getByText("₡0", { exact: true })).toBeVisible();
  });

  test("(d) R254: en 375 × 667 el botón del pie se ve sin desplazar y «Cierres solicitados» sigue debajo", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    for (let i = 0; i < 6; i++) await entregada(m, 1000 + i, "efectivo");

    const page = await paginaDe(browser, m);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/cierre-dia");

    const detalle = page.getByRole("region", { name: DETALLE });
    const boton = detalle.getByRole("button", { name: "Solicitar cierre" });
    await expect(boton).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    const caja = await boton.boundingBox();
    expect(caja, "el botón del pie no tiene caja").not.toBeNull();
    expect(caja!.y).toBeGreaterThanOrEqual(0);
    expect(caja!.y + caja!.height).toBeLessThanOrEqual(667);

    const cajaDetalle = await detalle.boundingBox();
    const cola = await page.getByRole("heading", { level: 2, name: "Cierres solicitados" }).boundingBox();
    expect(cajaDetalle && cola, "falta el detalle o la cola").toBeTruthy();
    expect(cola!.y).toBeGreaterThanOrEqual(cajaDetalle!.y + cajaDetalle!.height);
  });
});
