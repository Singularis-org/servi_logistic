import { expect, test } from "@playwright/test";

import { cierresDe, filaDeCola, rechazarCierre, repartoDeDiasAtras } from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
import {
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
 * E2E — SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna
 * antes de reenviarlo» (T3.5; R1770, R1779, R1782, R1784, R1791, R1796).
 *
 *  1. El corte diario (la ruta real) deja un `vencido` con una orden barrida a Novedad interna.
 *  2. El mensajero lo envía y la bodega lo rechaza: la barrida vuelve a Entregas (R1770).
 *  3. El mensajero la ve en Entregas (R1779); en «Cierre del día», «Corregir» la lista como
 *     pendiente y el reenvío sale deshabilitado con el motivo (R1795, R1796).
 *  4. La gestiona y reenvía (R1782, R1784).
 *  5. La bodega aprueba SIN escanearla: ya no vuelve a bodega (R1791).
 *
 * DATOS (R7, R8): empresa nueva; un mensajero de la satélite con una entrega gestionada (lo que el
 * corte se lleva por la rama (a)) y una orden `en_reparto` sin gestionar (la que barre, rama (b)).
 * El rechazo usa el servicio real (`rechazarCierre` del escenario), como la acción de la pantalla.
 * ⚠️ EXCEPCIÓN de R8 (`repartoDeDiasAtras`): sin reloj falso, la `fecha_reparto` de la orden que se
 * barre se mueve al pasado; el corte solo barre lo reservado para un día ya cerrado.
 */

const DETALLE = "Detalle del cierre · Tu cierre del día";
const REENVIAR = "Solicitar aprobación del cierre rechazado";
const MOTIVO_FALTA =
  "Te falta 1 orden que pasó a Novedad interna. Gestiónala en Entregas y vuelve a enviar el cierre.";

let r: RepartoE2E;
let m: MensajeroE2E;
let barrida: OrdenE2E;
let cierreId: string;

test.describe.serial("Cierre rechazado — el mensajero gestiona lo que pasó a Novedad interna y lo reenvía", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierre-rechazado-sin-gestion");
    m = await crearMensajero(r, "satelite");
    const entregada = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 4000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entregada, m, { resultado: "entregado" });
    barrida = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 2500 }), "en_reparto", { mensajero: m });
  });

  test("paso 1 — el corte deja el vencido y barre la orden sin gestionar", async () => {
    await repartoDeDiasAtras(r, barrida);
    await correrCron("corte-diario");
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => c.estado)).toEqual(["vencido"]);
    cierreId = cierres[0].id;
    expect(await estadoDe(barrida)).toBe("novedad_interna");
  });

  test("paso 2 — lo envía, la bodega lo rechaza y la barrida vuelve a Entregas (R1770)", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    await page.getByRole("region", { name: DETALLE }).getByRole("button", { name: "Solicitar aprobación del cierre vencido" }).click();
    await page
      .getByRole("dialog", { name: "Solicitar aprobación del cierre vencido" })
      .getByRole("button", { name: "Solicitar aprobación" })
      .click();
    await expect(page.getByText("Cierre vencido enviado a aprobación.")).toBeVisible();

    await rechazarCierre(r, cierreId, "Falta gestionar una orden");
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[cierreId, "rechazado"]]);
    expect(await estadoDe(barrida)).toBe("en_reparto");
  });

  test("paso 3 — la ve en Entregas; el reenvío sale deshabilitado con el motivo (R1779, R1795, R1796)", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    await page.goto("/mis-asignaciones/reparto");
    await expect(page.getByRole("button", { name: `Gestionar la orden ${barrida.numRemision}` })).toBeVisible();

    await page.goto("/cierre-dia");
    const detalle = page.getByRole("region", { name: DETALLE });
    const seccion = detalle.getByRole("region", { name: "Órdenes que pasaron a Novedad interna" });
    await expect(seccion).toContainText(barrida.numRemision);
    await expect(seccion).toContainText("Falta gestionarla");
    const boton = detalle.getByRole("button", { name: REENVIAR });
    await expect(boton).toBeDisabled();
    await expect(boton).toHaveAttribute("title", MOTIVO_FALTA);
  });

  test("paso 4 — la gestiona y reenvía el cierre (R1782, R1784)", async ({ browser }) => {
    await gestionar(r, barrida, m, { resultado: "entregado" });

    const page = await paginaDe(browser, m);
    await page.goto("/cierre-dia");
    const detalle = page.getByRole("region", { name: DETALLE });
    await expect(detalle.getByRole("region", { name: "Órdenes que pasaron a Novedad interna" })).toContainText("Ya la gestionaste");
    await detalle.getByRole("button", { name: REENVIAR }).click();
    await page.getByRole("dialog", { name: REENVIAR }).getByRole("button", { name: "Solicitar aprobación" }).click();
    await expect(page.getByText("Cierre rechazado enviado a aprobación.")).toBeVisible();

    // R1784: el mismo cierre, ahora con las dos entregas (4.000 + 2.500).
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, String(c.totalEfectivo)])).toEqual([[cierreId, "solicitado", "6500"]]);
  });

  test("paso 5 — la bodega lo aprueba sin escanear la gestionada (R1791)", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/cierres-admin");
    const comprobante = filaDeCola(page.getByRole("region", { name: "Pendientes de decisión" }), m.nombre);
    await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
    await page.getByRole("dialog", { name: "Detalle del cierre" }).getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" })).toHaveCount(0);

    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[cierreId, "aprobado"]]);
    expect(await estadoDe(barrida)).toBe("entregado");
  });
});
