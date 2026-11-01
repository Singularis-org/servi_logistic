import { expect, test, type Page } from "@playwright/test";

import { movimientosCajaDe } from "./_escenarios/caja";
import { aprobarCierre, importe, solicitarCierre } from "./_escenarios/cierres";
import {
  baseReparto,
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
 * E2E — Cierre de bodega satélite → bodega central (features 40 y 431; SL-44 T6.2, R18).
 *
 * El segundo nivel de cierre, contra la UI ACTUAL:
 *  1. El adminSatelite (pestaña «Bodega») ve los totales a consolidar y los cierres del día
 *     aprobados de su zona, pulsa «Solicitar cierre de bodega», confirma, y la consolidación queda
 *     en «Solicitados».
 *  2. El maestro abre la consolidación pendiente: totales agregados, el cierre del día de cada
 *     mensajero con sus gestiones y la evidencia firmada de la rechazada; la «Marca recibido» por
 *     lo que la satélite le debe a la central (SLT-73 R8) y pasa a «Resueltos». Desde SLT-73
 *     (R10) esa marca es la que asienta en los libros el dinero del cierre del día de la satélite.
 *  3. El maestro intenta «Desmarcarla»: como ya entró a la caja, se rechaza con el aviso propio
 *     (SLT-73 R14) y la consolidación sigue conciliada, en «Resueltos».
 *
 * ⚠️ Desde la ficha 431 la central ya no APRUEBA ni RECHAZA una consolidación: marca si el efectivo
 * llegó (y cuánto), y la marca se deshace con «Desmarcar». El «aprobar / rechazar con motivo» que
 * describía esta cabecera ya no existe en la pantalla; los pasos 2 y 3 recorren su sustituto.
 *
 * DATOS (R7, R8): empresa nueva; un mensajero de la zona satélite con una entrega de 9.000 en
 * efectivo y un rechazo (foto al doble de Storage), por `MisAsignacionesService`; su cierre del día
 * solicitado (`CierreDiaService`) y aprobado por el adminSatelite (`CierresAdminService`, con la
 * guía del rechazo confirmada). Cifras a mano: efectivo 9.000 = total general 9.000.
 *
 * SLT-73 (D3/D4, R8): «Monto recibido» llega precargado con `paraLaCentral`, no con el efectivo:
 *   total general 9.000 − pago al mensajero 1.500 (la entrega, `cobroEntregado`; el rechazo no
 *   se le paga al mensajero) − ganancia de la satélite por rechazos 500 (`cobroRechazado` del
 *   rechazo, `total_ingreso_bodega_rechazos`) = 7.000.
 * Medido en la base de la corrida: `total_general` 9000.00, `total_pago_mensajero` 1500.00,
 * `total_ingreso_bodega_rechazos` 500.00.
 */

let r: RepartoE2E;
let m: MensajeroE2E;
let rechazada: OrdenE2E;

async function pestanaBodega(page: Page) {
  await page.goto("/cierres-admin");
  await page.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
}

async function consolidacionDeLaZona() {
  return baseReparto().cierreBodega.findMany({
    where: { zonaId: r.zonaSatelite.id },
    select: { id: true, estado: true, totalEfectivo: true, totalGeneral: true, conciliadoAt: true, montoRecibido: true },
  });
}

test.describe.serial("Cierre de bodega satélite — solicitar, marcar recibido y desmarcar", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierre-bodega", { tarifaMensajero: { cobroEntregado: 1500, cobroRechazado: 500 } });
    m = await crearMensajero(r, "satelite");
    const entrega = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 9000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entrega, m, { resultado: "entregado" });
    rechazada = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero: m });
    await gestionar(r, rechazada, m, { resultado: "devolucion_a_origen_por_rechazo" });
    await aprobarCierre(r, await solicitarCierre(r, m));
  });

  test("1 — el adminSatelite ve lo consolidable y solicita el cierre de bodega", async ({ browser }) => {
    const page = await paginaDe(browser, r.adminSatelite);
    await pestanaBodega(page);
    const bodega = page.getByRole("region", { name: "Cierre de bodega" });
    const totales = bodega.getByRole("region", { name: "Totales a consolidar" });
    await expect(totales.getByText("Efectivo", { exact: true }).locator("xpath=ancestor::div[1]")).toContainText(importe(9000));
    await expect(bodega.getByRole("region", { name: "Cierres del día a consolidar" })).toContainText(m.nombre);

    const solicitar = bodega.getByRole("region", { name: "Solicitar cierre de bodega" }).getByRole("button", { name: "Solicitar cierre de bodega" });
    await expect(solicitar).toBeEnabled();
    await solicitar.click();
    await page.getByRole("dialog", { name: "Solicitar cierre de bodega" }).getByRole("button", { name: "Solicitar cierre de bodega" }).click();
    await expect(page.getByText("Cierre de bodega solicitado correctamente.")).toBeVisible();

    await bodega.getByRole("group", { name: "Cierre de bodega por etapa" }).getByRole("button", { name: /^Solicitados/ }).click();
    // Sin recargar: la lista se revalida al solicitar (defecto arreglado en SL-44, ver bitácora).
    const solicitados = bodega.getByRole("region", { name: "Cierres de bodega solicitados" });
    await expect(solicitados.getByText("Pendiente de conciliar", { exact: true })).toBeVisible();
    await expect(solicitados.getByText(importe(9000, { solo: true }))).toBeVisible();
    const consolidaciones = await consolidacionDeLaZona();
    expect(consolidaciones.map((c) => [c.estado, String(c.totalEfectivo), String(c.totalGeneral), c.conciliadoAt])).toEqual([
      ["solicitado", "9000", "9000", null],
    ]);
  });

  test("2 — el maestro abre el detalle agregado, ve la evidencia y la marca recibida", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await pestanaBodega(page);
    const modulo = page.getByRole("region", { name: "Cierres de bodega satélite" });
    await modulo
      .getByRole("region", { name: "Cierres de bodega pendientes" })
      .getByRole("button", { name: `Ver / decidir el cierre de bodega de ${r.zonaSatelite.nombre}` })
      .click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre de bodega" });
    const totales = detalle.getByRole("region", { name: "Totales del cierre de bodega" });
    await expect(totales.getByText("Efectivo", { exact: true }).locator("xpath=ancestor::div[1]")).toContainText(importe(9000));

    const delDia = detalle.getByRole("region", { name: `Cierre del día · ${m.nombre}` });
    const ordenes = delDia.getByRole("region", { name: `Órdenes del cierre · ${m.nombre}` });
    await ordenes.getByRole("tab", { name: /Devolución a origen por rechazo/ }).click();
    await ordenes.getByRole("button", { name: new RegExp(rechazada.numRemision), expanded: false }).click();
    await ordenes.getByRole("button", { name: `Ver evidencia de la orden ${rechazada.numRemision} · ${rechazada.destinatario}` }).click();
    const visor = page.getByRole("dialog", { name: "Evidencia de la gestión" });
    const foto = visor.getByRole("img");
    await expect(foto).toBeVisible();
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await visor.getByRole("button", { name: "Cerrar" }).first().click();

    // SLT-73 (R1): aprobar el cierre del día de la satélite no escribió nada en la caja.
    const delCierre = async () => (await movimientosCajaDe(r)).filter((mv) => mv.origenTipo === "cierre_dia");
    expect(await delCierre()).toEqual([]);

    await detalle.getByRole("button", { name: /^Marcar recibido la consolidación de / }).click();
    const marcar = page.getByRole("dialog", { name: "Marcar recibido" });
    // SLT-73 (R8): la precarga es `paraLaCentral` = 9.000 − 1.500 − 500 = 7.000 (cuenta en la cabecera).
    await expect(marcar.getByLabel("Monto recibido")).toHaveValue(/^7000(\.00)?$/);
    await marcar.getByRole("button", { name: "Marcar recibido" }).click();
    await expect(page.getByText(/^Marcada como recibida por /)).toContainText(importe(7000));

    const [c] = await consolidacionDeLaZona();
    // Ficha 431 (D2): la marca guarda `aprobado` (se lee «Recibido») con lo contado.
    expect([c.estado, String(c.montoRecibido)]).toEqual(["aprobado", "7000"]);
    expect(c.conciliadoAt).not.toBeNull();
    // SLT-73 (R10): la marca asentó en la caja el dinero del cierre del día de la satélite.
    expect((await delCierre()).length).toBeGreaterThan(0);

    await modulo.getByRole("group", { name: "Cierres de bodega por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await expect(
      modulo.getByRole("region", { name: "Cierres de bodega resueltos" }).getByRole("button", {
        name: `Ver el cierre de bodega resuelto de ${r.zonaSatelite.nombre}`,
      }),
    ).toBeVisible();
  });

  test("3 — desmarcar una consolidación que ya entró a la caja se rechaza y sigue en resueltos", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await pestanaBodega(page);
    const modulo = page.getByRole("region", { name: "Cierres de bodega satélite" });
    await modulo.getByRole("group", { name: "Cierres de bodega por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await modulo.getByRole("button", { name: `Ver el cierre de bodega resuelto de ${r.zonaSatelite.nombre}` }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre de bodega" });
    const antes = await movimientosCajaDe(r);
    await detalle.getByRole("button", { name: /^Desmarcar la consolidación de / }).click();
    const desmarcar = page.getByRole("dialog", { name: "Desmarcar" });
    await desmarcar.getByRole("button", { name: "Desmarcar" }).click();
    // SLT-73 (R14): el aviso propio, dentro del diálogo; el botón queda deshabilitado.
    await expect(desmarcar.getByRole("alert")).toContainText("No se puede desmarcar.");
    await expect(desmarcar.getByRole("alert")).toContainText("Ya entró a la caja: corrige el monto en vez de revertir");
    await expect(desmarcar.getByRole("button", { name: "Desmarcar" })).toBeDisabled();

    // Ni la marca ni ningún libro cambian.
    const [c] = await consolidacionDeLaZona();
    expect([c.estado, String(c.montoRecibido)]).toEqual(["aprobado", "7000"]);
    expect(c.conciliadoAt).not.toBeNull();
    expect(await movimientosCajaDe(r)).toEqual(antes);
    await desmarcar.getByRole("button", { name: "Cancelar" }).click();
    await page.keyboard.press("Escape");
    await modulo.getByRole("group", { name: "Cierres de bodega por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await expect(
      modulo.getByRole("button", { name: `Ver el cierre de bodega resuelto de ${r.zonaSatelite.nombre}` }),
    ).toBeVisible();
  });
});
