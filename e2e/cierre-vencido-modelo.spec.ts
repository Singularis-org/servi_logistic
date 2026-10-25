import { expect, test } from "@playwright/test";

import { cierresDe } from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — Cierre `vencido`: bloqueo total y resolución POR EL MENSAJERO (features 41, 111 y 271;
 * SL-44 T6.2, R18).
 *
 * Complementa `reglas-bloqueos-cierre.spec.ts` (la válvula del admin): aquí el propio mensajero
 * envía su `vencido` a aprobación.
 *  1. El corte diario (`/api/cron/corte-diario`, la ruta real) le deja un cierre `vencido` al
 *     mensajero que gestionó y no cerró.
 *  2. Bloqueo total: en «Cierre del día» y en «Entregas» ve el aviso (no puede entregar, cobrar ni
 *     recibir trabajo nuevo).
 *  3. Pulsa «Solicitar aprobación del cierre vencido» → el MISMO cierre pasa a `solicitado` (no se
 *     crea otro) y el aviso desaparece.
 *  4. El adminSatelite lo ve como «Solicitado» (ya no «Vencido») y lo aprueba por la vía normal.
 *  5. El mensajero sigue libre.
 *
 * DATOS (R7, R8): empresa nueva; un mensajero de la zona satélite con una entrega de 4.000 en
 * efectivo gestionada por `MisAsignacionesService` y sin cierre. El `vencido` lo crea el cron real:
 * el corte toma toda gestión sin cierre, sin mirar su fecha (rama (a) de
 * `CorteDiarioRepository.findMensajerosConActividadSinCierre`), así que NO hace falta la excepción de
 * R8 de la fecha de la gestión en el pasado prevista en D4: se QUITA.
 */

const AVISO_SIN_ENVIAR = "Tienes un cierre sin enviar a aprobación.";
const NO_PUEDES = "Mientras tanto no puedes entregar, cobrar ni recibir trabajo nuevo.";

let r: RepartoE2E;
let m: MensajeroE2E;
let vencidoId: string;

test.describe.serial("Cierre vencido — el mensajero lo envía y la bodega lo aprueba", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierre-vencido");
    m = await crearMensajero(r, "satelite");
    const o = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 4000 }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado" });
  });

  test("paso 1 — el corte diario deja el cierre del mensajero en `vencido`", async () => {
    expect(await cierresDe(m)).toEqual([]);
    await correrCron("corte-diario");
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => [c.estado, c.destinoTipo, String(c.totalEfectivo)])).toEqual([["vencido", "bodega_satelite", "4000"]]);
    vencidoId = cierres[0].id;
  });

  test("paso 2 — bloqueo total: el aviso en «Cierre del día» y en «Entregas»", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    const aviso = page.getByRole("alert").filter({ hasText: AVISO_SIN_ENVIAR });
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(NO_PUEDES);

    await page.goto("/mis-asignaciones/reparto");
    await expect(page.getByRole("alert").filter({ hasText: NO_PUEDES })).toBeVisible();
  });

  test("paso 3 — «Solicitar aprobación del cierre vencido» → el mismo cierre queda `solicitado`", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    await page.getByRole("region", { name: "Cierre vencido" }).getByRole("button", { name: "Solicitar aprobación del cierre vencido" }).click();
    const confirmar = page.getByRole("dialog", { name: "Solicitar aprobación del cierre vencido" });
    await confirmar.getByRole("button", { name: "Solicitar aprobación" }).click();
    await expect(page.getByText("Cierre vencido enviado a aprobación.")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: NO_PUEDES })).toHaveCount(0);

    // R10 de la 111: no nace un segundo cierre; los montos no se recalculan.
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, String(c.totalEfectivo)])).toEqual([[vencidoId, "solicitado", "4000"]]);
  });

  test("paso 4 — el adminSatelite ve «Solicitado» y lo aprueba por la vía normal", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/cierres-admin");
    const comprobante = page
      .getByRole("region", { name: "Pendientes de decisión" })
      .getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
    await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
    await expect(comprobante.getByText("Vencido", { exact: true })).toHaveCount(0);
    await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
    await detalle.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[vencidoId, "aprobado"]]);
  });

  test("paso 5 — resuelto el cierre, el mensajero no tiene bloqueo", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    await expect(page.getByRole("region", { name: "Totales del día" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: NO_PUEDES })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Cierre vencido" })).toHaveCount(0);
  });
});
