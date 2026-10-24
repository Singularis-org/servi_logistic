import { expect, test } from "@playwright/test";

import { aprobarCierre, solicitarCierre } from "./_escenarios/cierres";
import { llamarCron } from "./_escenarios/crons";
import {
  corregirFechaReprogramacion,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  mananaCR,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Reprogramación: bloqueo y liberación por el cron (feature 46; SL-44 T5.4, R18, R23).
 *
 *  1. Bloqueo: dos órdenes de la satélite reprogramadas (A y B, su cierre aprobado) no están en
 *     «Órdenes de la bodega»: no se pueden asignar mientras su fecha no llega.
 *  2. Liberación: la fecha de B se corrige a HOY (la de A sigue siendo mañana) y
 *     `GET /api/cron/liberar-reprogramadas` con el `CRON_SECRET` efímero responde 200 y libera B:
 *     vuelve a la bodega (`en_bodega_satelite`) y aparece en «Liberadas hoy (reprogramación)» con su
 *     guía y su destinatario. A sigue bloqueada.
 *  3. El cron sin el secreto correcto responde 401 y no libera nada.
 *
 * DATOS (R7, R8): empresa nueva; A y B llevadas a `en_reparto` y reprogramadas por el mensajero
 * (`MisAsignacionesService`), su cierre aprobado (`CierresAdminService`). La fecha «ya llegada» de B
 * la produce `CorreccionFechaReprogramacionService` (sin su liberador: ver `./_escenarios/reparto.ts`),
 * así que no hay ninguna fila escrita a mano. `CRON_SECRET` lo genera `playwright.config.ts` (R23).
 */

let r: RepartoE2E;
let a: OrdenE2E;
let b: OrdenE2E;

test.describe.serial("Reprogramación — bloqueo y liberación por el cron", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("reprogramacion-liberacion");
    const m = await crearMensajero(r, "satelite");
    a = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero: m });
    b = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero: m });
    await gestionar(r, a, m, { resultado: "reprogramado", fecha: mananaCR() });
    await gestionar(r, b, m, { resultado: "reprogramado", fecha: mananaCR() });
    await aprobarCierre(r, await solicitarCierre(r, m));
    expect(await estadoDe(a)).toBe("reprogramado");
    expect(await estadoDe(b)).toBe("reprogramado");
  });

  test("mientras su fecha no llega, las reprogramadas no se pueden asignar", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/en-bodega");
    const bodega = page.getByRole("region", { name: "Órdenes de la bodega" });
    // Se ven en la bodega (ficha 357), con su estado…
    for (const o of [a, b]) {
      await expect(bodega.getByRole("row", { name: new RegExp(o.numRemision) }).getByText("Reprogramado")).toBeVisible();
      await bodega.getByRole("checkbox", { name: `Seleccionar ${o.numRemision}` }).check();
    }
    // …pero marcadas no ofrecen «Asignar»: la barra solo ofrece la transición de su estado.
    // (La contraprueba, «Asignar» presente para una orden ya liberada, está en el caso siguiente.)
    await expect(bodega.getByRole("checkbox", { name: `Seleccionar ${b.numRemision}` })).toBeChecked();
    await expect(bodega.getByRole("button", { name: "Asignar", exact: true })).toHaveCount(0);
  });

  test("el cron libera la que ya venció → 200, vuelve a la bodega y sale en «Liberadas hoy»", async ({ browser }) => {
    await corregirFechaReprogramacion(r, b);
    const res = await llamarCron("liberar-reprogramadas");
    expect(res.status).toBe(200);
    const cuerpo = res.cuerpo as { liberadas: number };
    expect(cuerpo.liberadas).toBeGreaterThanOrEqual(1);

    expect(await estadoDe(b)).toBe("en_bodega_satelite");
    expect(await estadoDe(a)).toBe("reprogramado");

    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/recepcion-satelite/en-bodega");
    const liberadas = page.getByRole("region", { name: "Liberadas hoy (reprogramación)" });
    await expect(liberadas).toBeVisible();
    await expect(liberadas.getByText(`Guía ${b.numGuia} · ${b.destinatario}`)).toBeVisible();
    await expect(liberadas.getByText(a.numRemision)).toHaveCount(0);

    // B vuelve a ser asignable; A sigue reprogramada.
    const bodega = page.getByRole("region", { name: "Órdenes de la bodega" });
    await expect(bodega.getByRole("row", { name: new RegExp(b.numRemision) }).getByText("En bodega satélite")).toBeVisible();
    await expect(bodega.getByRole("row", { name: new RegExp(a.numRemision) }).getByText("Reprogramado")).toBeVisible();
    await bodega.getByRole("checkbox", { name: `Seleccionar ${b.numRemision}` }).check();
    await expect(bodega.getByRole("button", { name: "Asignar", exact: true })).toBeEnabled();
  });

  test("el cron sin el secreto correcto → 401", async () => {
    const res = await llamarCron("liberar-reprogramadas", { secreto: "no-es-el-secreto" });
    expect(res.status).toBe(401);
    expect(await estadoDe(a)).toBe("reprogramado");
  });
});
