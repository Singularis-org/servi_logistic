import { expect, test, type Locator, type Page } from "@playwright/test";

import { cierresDe } from "./_escenarios/cierres";
import { correrCron, drenarGeocodificacion } from "./_escenarios/crons";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Reglas y bloqueos de cierre: el camino crítico del `vencido` (features 41, 111 y 271;
 * SL-44 T6.2, R18). Une las tres pantallas alrededor del cierre `vencido` que deja el corte:
 *  1. El corte diario (la ruta real del cron) deja `vencido` el cierre del mensajero M.
 *  2. M ve el aviso de bloqueo total en «Cierre del día».
 *  3. La bodega satélite de M no puede asignarle trabajo a M: le avisa del cierre abierto de su
 *     mensajero y, al asignar, M sale deshabilitado («tiene cierres sin resolver»).
 *     ⚠️ Contra la UI ACTUAL (features 241, 271 y ficha 431): la bodega ya NO se congela entera
 *     («No puedes asignar órdenes…» con «Asignar» apagado). Se veta al mensajero bloqueado y la
 *     bodega sigue asignando a los demás; el spec afirma esa puerta y que el aviso de bloqueo
 *     total de la bodega no aparece.
 *  4. Válvula (111/R16): en «Cierres del día» el `vencido` sale marcado «Vencido» y sin «Ver /
 *     decidir»; el adminSatelite lo destraba (`vencido → solicitado`) y lo aprueba por la vía normal.
 *  5. M ya no está bloqueado y la bodega vuelve a poder asignarle.
 *
 * DATOS (R7, R8): empresa nueva; M es el ÚNICO mensajero de la zona satélite (así el aviso de la
 * bodega habla solo de él). Una entrega de 3.000 en efectivo gestionada por
 * `MisAsignacionesService` sin cierre, y otra orden recibida en la bodega satélite
 * (`RecepcionSateliteService`) para marcarla. El `vencido` lo crea el cron real; como en
 * `cierre-vencido-modelo`, sin excepción de R8 (el corte no mira la fecha de la gestión).
 */

const NO_PUEDES = "Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo.";
const BODEGA_BLOQUEADA = "No puedes asignar órdenes: tu bodega tiene cierres pendientes de resolver.";
const CIERRE_ABIERTO = "Tienes 1 cierre abierto de tus mensajeros.";
const MOTIVO_CIERRE = "tiene cierres sin resolver";

let r: RepartoE2E;
let m: MensajeroE2E;
let enBodega: OrdenE2E;
let vencidoId: string;

async function bodegaDelSatelite(page: Page): Promise<Locator> {
  await page.goto("/recepcion-satelite/en-bodega");
  const bodega = page.getByRole("region", { name: "Órdenes de la bodega" });
  await bodega.getByRole("checkbox", { name: `Seleccionar ${enBodega.numRemision}` }).check();
  return bodega;
}

/** «Asignar» con la orden marcada y el desplegable de mensajeros abierto. */
async function abrirAsignar(page: Page, bodega: Locator): Promise<void> {
  const asignar = bodega.getByRole("button", { name: "Asignar", exact: true });
  await expect(asignar).toBeEnabled();
  await asignar.click();
  await page.getByRole("dialog", { name: "Asignar mensajero" }).getByRole("combobox", { name: "Mensajero para el lote" }).click();
}

test.describe.serial("Reglas y bloqueos de cierre — camino crítico del vencido", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("reglas-bloqueos");
    m = await crearMensajero(r, "satelite");
    const o = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 3000 }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado" });
    enBodega = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_satelite");
    await drenarGeocodificacion([enBodega.id]);
  });

  test("paso 1 — el corte diario deja `vencido` el cierre de M", async () => {
    await correrCron("corte-diario");
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => [c.estado, c.destinoTipo, String(c.totalEfectivo)])).toEqual([["vencido", "bodega_satelite", "3000"]]);
    vencidoId = cierres[0].id;
  });

  test("paso 2 — M ve el aviso de bloqueo total", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    await expect(page.getByRole("alert").filter({ hasText: NO_PUEDES })).toBeVisible();
  });

  test("paso 3 — la bodega satélite no puede asignarle a M: aviso del cierre abierto y M deshabilitado", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    const bodega = await bodegaDelSatelite(page);
    // 241/271 (R32/R34): el cierre de UN mensajero ya no congela la bodega; avisa y lo veta a él.
    await expect(page.getByRole("status").filter({ hasText: CIERRE_ABIERTO })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: BODEGA_BLOQUEADA })).toHaveCount(0);
    await abrirAsignar(page, bodega);
    await expect(page.getByRole("option", { name: `${m.nombre} (${MOTIVO_CIERRE})` })).toBeDisabled();
  });

  test("paso 4 — válvula: destrabar el `vencido` y aprobarlo ya como `solicitado`", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/cierres-admin");
    const comprobante = page
      .getByRole("region", { name: "Pendientes de decisión" })
      .getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
    await expect(comprobante.getByText("Vencido", { exact: true })).toBeVisible();
    // 111/R15: un `vencido` no se decide por la vía normal.
    await expect(comprobante.getByRole("button", { name: "Ver / decidir" })).toHaveCount(0);

    await comprobante.getByRole("button", { name: `Destrabar cierre vencido abandonado de ${m.nombre}` }).click();
    const destrabar = page.getByRole("dialog", { name: "Destrabar cierre vencido abandonado" });
    await destrabar.getByRole("button", { name: "Destrabar (excepción)" }).click();
    await expect(page.getByText("Cierre vencido destrabado; quedó como solicitado para aprobación.")).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[vencidoId, "solicitado"]]);

    await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
    await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
    await expect(detalle.getByRole("region", { name: "Totales del cierre" })).toBeVisible();
    await detalle.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[vencidoId, "aprobado"]]);
  });

  test("paso 5 — resuelto, M no está bloqueado y la bodega vuelve a asignar", async ({ browser }) => {
    const suya = await paginaDe(browser, m);
    await suya.goto("/cierre-dia");
    await expect(suya.getByRole("region", { name: "Totales del día" })).toBeVisible();
    await expect(suya.getByRole("alert").filter({ hasText: NO_PUEDES })).toHaveCount(0);

    const page = await paginaDe(browser, r.adminSatelite);
    const bodega = await bodegaDelSatelite(page);
    await expect(page.getByRole("status").filter({ hasText: CIERRE_ABIERTO })).toHaveCount(0);
    await abrirAsignar(page, bodega);
    await expect(page.getByRole("option", { name: m.nombre, exact: true })).toBeEnabled();
  });
});
