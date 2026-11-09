import ExcelJS from "exceljs";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { cierresDe, importe, solicitarCierre } from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
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
import { abrirTarifas, activarConFaltantes, digitarYGuardar, irAZona, type Digitado } from "./_tarifas-activacion-fixture";

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (T5.1, R77) — lo que VEN la central y la
 * satélite al abrir un cierre de mensajero en /cierres-admin, con los importes ESCRITOS A MANO (nunca
 * calculados con la función que los produce). Derivación completa en `progress/impl_SLT-100.md > T0.3`.
 *
 * ESCENARIO A (modelo viejo). Tarifa de la tienda: flete 2.000 (las cuatro columnas iguales, así la satélite
 * da lo mismo), comisión COD 1 %, IVA 13 % en flete y comisión. Mensajero: 1.500 por entrega, 500 por rechazo.
 * Tres órdenes: 70.000 en efectivo y 30.000 por SINPE entregadas, y un rechazo manual.
 *   Recaudado 100.000 · flete con IVA 4.520 · comisión con IVA 1.130 · sale de lo recaudado 5.650
 *   se le paga hoy a la tienda 94.350 · flete de no entrega con IVA 2.260 · total facturado 7.910
 *   IVA 910 · pago al mensajero 3.000 · pago a la bodega 500 · le queda a la empresa 3.500
 *   nota R81: automático 0 · manual 500.
 *
 * ESCENARIO B (modelo nuevo). Tarifas digitadas y activadas por la pantalla
 * (`_tarifas-activacion-fixture`) en la zona central: flete por entregado 3.100 + 13 %, flete por devolución
 * 1.400 + 13 %, pago al mensajero 2.200 por entrega. Una entrega de 10.000 en efectivo.
 *   Recaudado 10.000 · sale de lo recaudado 3.100 + 403 = 3.503 · se le paga hoy 10.000 − 3.503 = 6.497
 *   pago al mensajero 2.200 · le queda a la empresa 3.503 − 403 − 2.200 − 0 = 900. Sin nota R81.
 *   (Los 3.503 son los que `tarifas-activacion.spec.ts` ya afirma como «Total cobrado» de esa misma
 *   tarifa.)
 */

const TARIFA_A = {
  valorFlete: 2000,
  valorFleteGam: 2000,
  valorFleteDevuelto: 2000,
  valorFleteDevueltoGam: 2000,
  comisionCod: 1,
  ivaFlete: 13,
  ivaComisionCod: 13,
};
const PAGO_A = { cobroEntregado: 1500, cobroRechazado: 500 };

const COBRO_B: readonly Digitado[] = [
  { concepto: "Flete por entregado", valor: "3100", iva: "13" },
  { concepto: "Flete por devolución a origen", valor: "1400", iva: "13" },
];
const PAGO_B: readonly Digitado[] = [{ concepto: "Por entregado", valor: "2200" }];

const COLUMNAS_R82 = ["Nº Guía", "Destinatario", "Tienda", "Resultado", "Recibido", "Cobro a la tienda", "Pago al mensajero"];

test.use({ actionTimeout: 30_000 });

/** Tres órdenes del escenario A en la zona pedida, gestionadas y con el cierre solicitado. */
async function cierreA(r: RepartoE2E, zona: "central" | "satelite") {
  const m = await crearMensajero(r, zona);
  for (const [monto, metodo] of [
    [70000, "efectivo"],
    [30000, "SINPE"],
  ] as const) {
    const o = await llevarA(r, await crearOrden(r, { zona, montoCobrar: monto }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado", pagos: [{ metodo, monto }] });
  }
  const rechazo = await llevarA(r, await crearOrden(r, { zona, montoCobrar: 15000 }), "en_reparto", { mensajero: m });
  await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
  return { m, rechazo, cierreId: await solicitarCierre(r, m) };
}

const detalleDe = (page: Page, m: MensajeroE2E): Locator =>
  page.getByRole("dialog", { name: `Detalle del cierre · Cierre de ${m.nombre}` });

async function abrirPendiente(page: Page, m: MensajeroE2E, boton: string): Promise<Locator> {
  await page.goto("/cierres-admin");
  const comprobante = page
    .getByRole("region", { name: "Pendientes de decisión" })
    .getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
  await comprobante.getByRole("button", { name: boton }).click();
  const detalle = detalleDe(page, m);
  await expect(detalle).toBeVisible();
  return detalle;
}

/** El importe que pinta una cifra de arriba, por su id (`data-cifra`). */
const cifra = (detalle: Locator, id: string): Locator => detalle.locator(`[data-cifra="${id}"]`);

/** El importe de una línea de una cuenta, por el rótulo exacto que se lee (con su operador). */
function linea(detalle: Locator, cuenta: string, rotulo: string): Locator {
  return detalle
    .getByRole("region", { name: cuenta })
    .locator("[data-signo]")
    .filter({ has: detalle.page().locator("[data-rotulo]", { hasText: new RegExp(`^${rotulo.replace(/[+()]/g, "\\$&")}$`) }) });
}

const FACTURA = "Lo que se le factura a la tienda";
const QUEDA = "De lo facturado, le queda a la empresa";
const BODEGA = "− Ingreso de bodega por devoluciones a origen";

/** Las cuatro cifras y las dos cuentas del escenario A, al céntimo. */
async function cifrasA(detalle: Locator) {
  await expect(cifra(detalle, "recaudado")).toHaveText(importe(100000, { solo: true }));
  await expect(cifra(detalle, "paraTienda")).toHaveText(importe(94350, { solo: true }));
  await expect(cifra(detalle, "pago")).toHaveText(importe(3000, { solo: true }));
  await expect(cifra(detalle, "leQueda")).toHaveText(importe(3500, { solo: true }));
  const metodos = detalle.getByRole("group", { name: "Cifras del cierre" }).getByLabel("Métodos de pago de lo recaudado");
  await expect(metodos.getByText("Efectivo", { exact: true }).locator("..")).toContainText(importe(70000));
  await expect(metodos.getByText("SINPE", { exact: true }).locator("..")).toContainText(importe(30000));
  await expect(metodos.getByText("Transferencia", { exact: true })).toHaveCount(0);
  await expect(detalle.getByText("Debe", { exact: true })).toHaveCount(0);
  await expect(detalle.getByText("Ganancia", { exact: true })).toHaveCount(0);
}

async function cuentasA(detalle: Locator) {
  const monto = (cuenta: string, rotulo: string) => linea(detalle, cuenta, rotulo).locator("[data-monto]");
  await expect(monto(FACTURA, "Flete por entregado + IVA")).toHaveText(importe(4520, { solo: true }));
  await expect(monto(FACTURA, "Comisión COD + IVA")).toHaveText(importe(1130, { solo: true }));
  await expect(monto(FACTURA, "Sale de lo recaudado")).toHaveText(importe(5650, { solo: true }));
  await expect(monto(FACTURA, "+ Flete por devolución a origen + IVA")).toHaveText(importe(2260, { solo: true }));
  await expect(monto(FACTURA, "Total facturado")).toHaveText(importe(7910, { solo: true }));
  await expect(monto(QUEDA, "Total facturado")).toHaveText(importe(7910, { solo: true }));
  await expect(monto(QUEDA, "− IVA (no es de la empresa)")).toHaveText(importe(910, { solo: true }));
  await expect(monto(QUEDA, "− Pago al mensajero")).toHaveText(importe(3000, { solo: true }));
  await expect(monto(QUEDA, BODEGA)).toHaveText(importe(500, { solo: true }));
  await expect(monto(QUEDA, "Le queda a la empresa")).toHaveText(importe(3500, { solo: true }));
  // R81: la nota del origen, bajo «− pago a la bodega».
  await expect(linea(detalle, QUEDA, BODEGA)).toContainText(
    /Automático \(por plazo vencido\) ₡0 · Manual \(mensajero\) ₡500/,
  );
}

/** Los botones del pie, en orden. */
async function pie(detalle: Locator): Promise<string[]> {
  return detalle.locator("footer").getByRole("button").allTextContents();
}

test.describe.serial("SLT-100 — la central y la satélite ven el detalle único (escenario A)", () => {
  let r: RepartoE2E;
  let central: { m: MensajeroE2E; rechazo: OrdenE2E; cierreId: string };
  let satelite: { m: MensajeroE2E; rechazo: OrdenE2E; cierreId: string };

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierres-rediseno-a", { tarifa: TARIFA_A, tarifaMensajero: PAGO_A });
    central = await cierreA(r, "central");
    satelite = await cierreA(r, "satelite");
  });

  test("central, solicitado: cifras, cuentas, nota R81, rechazos (0), «Descargar» y aprobar", async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirPendiente(page, central.m, "Ver / decidir");

    await cifrasA(detalle);
    await cuentasA(detalle);

    // El pie se alcanza desplazando el panel: un solo scroll, y el pie fuera de él (R11 de SLT-95).
    const aprobar = detalle.locator("footer").getByRole("button", { name: "Revisar paquetes y aprobar" });
    await aprobar.scrollIntoViewIfNeeded();
    await expect(aprobar).toBeVisible();
    expect(await pie(detalle)).toEqual(["Rechazar", "Revisar paquetes y aprobar"]);

    // R17: la pestaña está con 0 y dice que no hay ninguno (D11, D27).
    await detalle.getByRole("tab", { name: "Rechazados por la tienda (0)" }).click();
    await expect(detalle.getByText("Este cierre no tiene paquetes rechazados por la tienda.", { exact: true })).toBeVisible();

    // R21/R82: «Descargar» en «Gestiones»: siete cabeceras y una fila por gestión (3).
    await detalle.getByRole("tab", { name: "Gestiones (3)" }).click();
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      detalle.getByRole("button", { name: /^Descargar Gestiones del cierre / }).click(),
    ]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(await descarga.path());
    const hoja = libro.worksheets[0];
    const filas: string[][] = [];
    hoja.eachRow((fila) => filas.push((fila.values as unknown[]).slice(1).map((v) => String(v ?? ""))));
    const cabecera = filas.findIndex((f) => f[0] === "Nº Guía");
    expect(filas[cabecera]).toEqual(COLUMNAS_R82);
    expect(filas.length - cabecera - 1).toBe(3);

    // R21: nada imprimible dentro del diálogo.
    await expect(detalle.locator(".hoja-imprimible")).toHaveCount(0);

    // R39: «Aprobar» del pie lanza la confirmación física de hoy.
    await aprobar.click();
    const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
    const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
    await lector.getByLabel("Número de guía").fill(String(central.rechazo.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await confirmar.getByRole("button", { name: "Confirmar y aprobar" }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    expect((await cierresDe(central.m)).map((c) => [c.id, c.estado])).toEqual([[central.cierreId, "aprobado"]]);

    // Reabierto: solo lectura, quién lo aprobó (R80) y la pestaña de pago (R18).
    await page.getByRole("group", { name: "Cierres del día por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await page
      .getByRole("region", { name: "Histórico" })
      .getByRole("region", { name: `Comprobante del cierre de ${central.m.nombre}` })
      .getByRole("button", { name: `Ver el cierre resuelto de ${central.m.nombre}` })
      .click();
    const resuelto = detalleDe(page, central.m);
    await expect(resuelto.getByText(new RegExp(`· Aprobado \\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2} por ${r.empresa.maestro.nombre}$`))).toBeVisible();
    expect(await pie(resuelto)).toEqual(["Cerrar"]);
    await expect(resuelto.getByRole("tab", { name: "Pago al mensajero" })).toBeVisible();
    await cifrasA(resuelto);
  });

  test("satélite, solicitado: las mismas cifras, sin pago ni fulfillment, y rechaza con motivo", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirPendiente(page, satelite.m, "Ver / decidir");

    await cifrasA(detalle);
    await cuentasA(detalle);
    await expect(detalle.getByRole("tab", { name: "Pago al mensajero" })).toHaveCount(0);

    // FICHA 481: la satélite no ve el fulfillment en la fila desplegada.
    await detalle.getByRole("tab", { name: "Gestiones (3)" }).click();
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await ordenes.getByRole("button", { expanded: false }).first().click();
    await expect(ordenes.getByText("Fulfillment", { exact: true })).toHaveCount(0);

    await detalle.locator("footer").getByRole("button", { name: "Rechazar" }).click();
    const rechazo = page.getByRole("dialog", { name: "Rechazar cierre" });
    await rechazo.getByLabel("Motivo del rechazo").fill("Faltan paquetes");
    await rechazo.getByRole("button", { name: "Rechazar cierre" }).click();
    await expect(page.getByText("Cierre rechazado correctamente.")).toBeVisible();
    expect((await cierresDe(satelite.m)).map((c) => [c.id, c.estado, c.motivoRechazo])).toEqual([
      [satelite.cierreId, "rechazado", "Faltan paquetes"],
    ]);
  });
});

test.describe.serial("SLT-100 — la central ve un cierre del modelo nuevo (escenario B)", () => {
  let r: RepartoE2E;
  let m: MensajeroE2E;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierres-rediseno-b");
    const page = await paginaDe(browser, r.empresa.maestro);
    await abrirTarifas(page);
    await irAZona(page, r.zonaCentral.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_B);
    await digitarYGuardar(page, "Pago al mensajero", PAGO_B);
    await activarConFaltantes(page);
    await page.context().close();

    m = await crearMensajero(r, "central");
    const o = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10000 }] });
    await solicitarCierre(r, m);
  });

  test("central, B: las cuatro cifras del modelo nuevo y sin la nota de R81", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirPendiente(page, m, "Ver / decidir");
    await expect(cifra(detalle, "recaudado")).toHaveText(importe(10000, { solo: true }));
    await expect(cifra(detalle, "paraTienda")).toHaveText(importe(6497, { solo: true }));
    await expect(cifra(detalle, "pago")).toHaveText(importe(2200, { solo: true }));
    await expect(cifra(detalle, "leQueda")).toHaveText(importe(900, { solo: true }));
    await expect(detalle.getByText(/Automático \(por plazo vencido\)/)).toHaveCount(0);
  });
});

test.describe.serial("SLT-100 — destrabar un vencido desde el pie del detalle (R83)", () => {
  let r: RepartoE2E;
  let m: MensajeroE2E;
  let vencidoId: string;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    r = await crearEscenarioReparto("cierres-rediseno-vencido");
    m = await crearMensajero(r, "central");
    const o = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 4000 }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado" });
    await correrCron("corte-diario");
    const cierres = await cierresDe(m);
    expect(cierres.map((c) => c.estado)).toEqual(["vencido"]);
    vencidoId = cierres[0].id;
  });

  test("el pie destraba con el diálogo de hoy y el detalle se relee en modo decidir", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirPendiente(page, m, `Ver el cierre de ${m.nombre}`);
    expect(await pie(detalle)).toEqual(["Cerrar", "Destrabar cierre vencido"]);

    await detalle.locator("footer").getByRole("button", { name: "Destrabar cierre vencido" }).click();
    const destrabar = page.getByRole("dialog", { name: "Destrabar cierre vencido abandonado" });
    await destrabar.getByRole("button", { name: "Destrabar (excepción)" }).click();
    await expect(page.getByText("Cierre vencido destrabado; quedó como solicitado para aprobación.")).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[vencidoId, "solicitado"]]);

    await expect(detalle).toBeVisible();
    await expect.poll(() => pie(detalle)).toEqual(["Rechazar", "Aprobar"]);
  });
});
