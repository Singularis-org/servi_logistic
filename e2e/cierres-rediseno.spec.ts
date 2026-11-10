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

// SLT-101 «Fila de gestión única y lista con filtros» (R91): «Señales» al final. Antes eran las siete de R82.
const COLUMNAS_R82 = ["Nº Guía", "Destinatario", "Tienda", "Resultado", "Recibido", "Cobro a la tienda", "Pago al mensajero", "Señales"];

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

    // R21/R82: «Descargar» en «Gestiones»: las cabeceras (SLT-101: ocho, con «Señales») y una fila por gestión (3).
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
    // SLT-101: antes el primer botón plegado de la lista (en la fila única, el primero es el botón de
    // información del resultado); ahora el botón que despliega la fila, por su nombre (R89).
    await ordenes.getByRole("button", { name: /^(Desglose de ingreso|Detalle) de la orden /, expanded: false }).first().click();
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

// ═══ SLT-101 «Fila de gestión única y lista con filtros» (T6.1, R77) ═══════════════════════════════════════════
//
// La pestaña «Gestiones» de un cierre de mensajero: filtros con conteo, fila cerrada con señales, fila desplegada
// con las tarjetas en cascada y «Ver cómo se calculó». Importes ESCRITOS A MANO; derivación en
// `progress/impl_SLT-101.md > T0.3` (escrita antes del test).
//
// ESCENARIO S3-A (modelo viejo): la tarifa A de arriba MÁS un fulfillment de 300 (para que la central tenga la
// tarjeta y se vea que la satélite no). Por zona: entrega de 70.000 en efectivo, entrega de 30.000 por SINPE y un
// rechazo manual.
//   Entrega 70.000: flete 2.000 + IVA 260 = 2.260; comisión 1 % = 700 + IVA 91 = 791; se le cobra 3.051; de eso,
//   IVA 260 + 91 = 351; se le paga 1.500 (sin «Por tarifa»: el viejo no congela el pago). Fulfillment 300, IVA 0
//   (el viejo no tiene % de IVA del fulfillment): se cobró 300.
//   Rechazo: flete de devolución 2.000 + 260 = 2.260; se le cobra 2.260; señal «Vuelve a bodega».
//   Filtros: Todas 3 · Entregado 2 · Reprogramado 0 · Novedad 0 · Devolución a origen por rechazo 1 · Incidente 0 ·
//   Con señales 1.
//   La central (zona GAM) aplica la columna GAM; la satélite, la no GAM (mismo 2.000, la tarifa A es plana).

// Se pasa como variable y no como literal: `TarifaTienda` de la fábrica no declara el fulfillment, pero el esquema
// de `TarifaService.crear` sí lo acepta (opcional, D3).
const TARIFA_S3 = { ...TARIFA_A, fulfillment: 300 };

/** Las órdenes del escenario S3-A en una zona, gestionadas y con el cierre solicitado. */
async function cierreS3(r: RepartoE2E, zona: "central" | "satelite") {
  const m = await crearMensajero(r, zona);
  const entrega = await llevarA(r, await crearOrden(r, { zona, montoCobrar: 70000 }), "en_reparto", { mensajero: m });
  await gestionar(r, entrega, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 70000 }] });
  const sinpe = await llevarA(r, await crearOrden(r, { zona, montoCobrar: 30000 }), "en_reparto", { mensajero: m });
  await gestionar(r, sinpe, m, { resultado: "entregado", pagos: [{ metodo: "SINPE", monto: 30000 }] });
  const rechazo = await llevarA(r, await crearOrden(r, { zona, montoCobrar: 15000 }), "en_reparto", { mensajero: m });
  await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
  return { m, entrega, rechazo, cierreId: await solicitarCierre(r, m) };
}

const FILTROS_S3_A = [
  "Todas 3",
  "Entregado 2",
  "Reprogramado 0",
  "Novedad 0",
  "Devolución a origen por rechazo 1",
  "Incidente 0",
  "Con señales 1",
];

const filtros = (detalle: Locator): Locator => detalle.getByRole("group", { name: "Filtrar por resultado" });
const ordenesDe = (detalle: Locator): Locator => detalle.getByRole("region", { name: "Órdenes del cierre" });
const deLa = (o: OrdenE2E): string => `de la orden ${o.numRemision} · ${o.destinatario}`;

/** La fila (cerrada y desplegada) de una orden. */
function filaDe(detalle: Locator, o: OrdenE2E): Locator {
  // El `has` se busca DENTRO de cada fila: va desde `page`, no desde el diálogo.
  const boton = detalle.page().getByRole("button", { name: new RegExp(`^(Desglose de ingreso|Detalle) ${deLa(o)}$`) });
  return ordenesDe(detalle).locator("[data-gestion]").filter({ has: boton });
}

async function desplegarFila(detalle: Locator, o: OrdenE2E): Promise<Locator> {
  const fila = filaDe(detalle, o);
  await fila.getByRole("button", { name: new RegExp(`^(Desglose de ingreso|Detalle) ${deLa(o)}$`) }).click();
  return fila;
}

/** [rótulo, importe] de cada línea de una tarjeta de la fila, como se leen. */
async function lineasDe(tarjeta: Locator): Promise<string[][]> {
  await expect(tarjeta).toBeVisible();
  return tarjeta.locator("[data-signo]").evaluateAll((ls) =>
    ls.map((l) => [l.querySelector("[data-rotulo]")?.textContent ?? "", l.querySelector("[data-monto]")?.textContent ?? ""]),
  );
}

const tarjeta = (fila: Locator, titulo: string, o: OrdenE2E): Locator =>
  fila.getByRole("region", { name: `${titulo} ${deLa(o)}`, exact: true });

test.describe.serial("SLT-101 — la fila única en «Gestiones» (escenario S3-A, modelo viejo)", () => {
  let r: RepartoE2E;
  let central: Awaited<ReturnType<typeof cierreS3>>;
  let satelite: Awaited<ReturnType<typeof cierreS3>>;

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierres-rediseno-s3-a", { tarifa: TARIFA_S3, tarifaMensajero: PAGO_A });
    central = await cierreS3(r, "central");
    satelite = await cierreS3(r, "satelite");
  });

  test("central A: filtros con conteo, señales, tarjetas, cálculo, acciones, «Descargar» con «Señales» y la URL intacta", async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirPendiente(page, central.m, "Ver / decidir");
    await detalle.getByRole("tab", { name: "Gestiones (3)" }).click();

    // R84, R89: sin buscador, los 7 filtros con su conteo y «Todas» activa.
    await expect(detalle.getByRole("searchbox")).toHaveCount(0);
    await expect(filtros(detalle).getByRole("button")).toHaveText(FILTROS_S3_A);
    await expect(filtros(detalle).getByRole("button", { name: "Todas 3" })).toHaveAttribute("aria-pressed", "true");
    await expect(ordenesDe(detalle).locator("[data-gestion]")).toHaveCount(3);

    // R84: filtrar no cambia la URL de /cierres-admin.
    const url = page.url();
    await filtros(detalle).getByRole("button", { name: "Con señales 1" }).click();
    await expect(ordenesDe(detalle).locator("[data-gestion]")).toHaveCount(1);
    await expect(filaDe(detalle, central.rechazo).getByText("Vuelve a bodega", { exact: true })).toBeVisible();
    await filtros(detalle).getByRole("button", { name: "Entregado 2" }).click();
    await expect(ordenesDe(detalle).locator("[data-gestion]")).toHaveCount(2);
    expect(page.url()).toBe(url);

    // R86: la fila cerrada de la entrega de 70.000.
    const fila = filaDe(detalle, central.entrega);
    await expect(fila.getByText(importe(70000, { solo: true }))).toBeVisible();
    await expect(fila.getByText(importe(3051, { solo: true }))).toBeVisible();
    await expect(fila.getByText(importe(1500, { solo: true }))).toBeVisible();

    // R25, R27, R30, R93: las cuatro tarjetas de la central.
    await desplegarFila(detalle, central.entrega);
    expect(await lineasDe(tarjeta(fila, "Recibió el mensajero", central.entrega))).toEqual([
      ["Efectivo", "₡70.000"],
      ["Recibió", "₡70.000"],
    ]);
    const cobro = tarjeta(fila, "Se le cobra a la tienda", central.entrega);
    expect(await lineasDe(cobro)).toEqual([
      ["Flete por entregado + IVA", "₡2.260"],
      ["+ Comisión COD + IVA", "₡791"],
      ["Se le cobra", "₡3.051"],
    ]);
    await expect(cobro.locator("[data-aparte]")).toHaveText("de eso, IVA (no es de la empresa)₡351");
    const pago = tarjeta(fila, "Se le paga al mensajero", central.entrega);
    expect(await lineasDe(pago)).toEqual([["Se le paga", "₡1.500"]]);
    expect(await lineasDe(tarjeta(fila, "Fulfillment · se cobró al crear la orden", central.entrega))).toEqual([
      ["Fulfillment", "₡300"],
      ["Se cobró", "₡300"],
    ]);
    await expect(tarjeta(fila, "Fulfillment · se cobró al crear la orden", central.entrega)).toContainText(
      "No depende de esta gestión ni de este cierre.",
    );

    // R28, R29: «Ver cómo se calculó» del viejo, con la columna GAM.
    await cobro.getByRole("button", { name: "Ver cómo se calculó" }).click();
    const calculo = fila.getByRole("region", { name: "Cómo se calculó el cobro a la tienda" });
    expect(await lineasDe(tarjeta(calculo, "Flete por entregado", central.entrega))).toEqual([
      ["tarifa GAM", "₡2.000"],
      ["+ IVA flete (13 % de ₡2.000)", "₡260"],
      ["Flete por entregado", "₡2.260"],
    ]);
    expect(await lineasDe(tarjeta(calculo, "Comisión COD", central.entrega))).toEqual([
      ["Comisión COD (1 % de ₡70.000)", "₡700"],
      ["+ IVA comisión (13 % de ₡700)", "₡91"],
      ["Comisión COD", "₡791"],
    ]);
    await expect(calculo.getByText(/^Tarifas tal como estaban al crear el cierre \(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\)\. Si después cambian, aquí no cambia nada\.$/)).toBeVisible();
    await cobro.getByRole("button", { name: "Ocultar cómo se calculó" }).click();
    await expect(calculo).toHaveCount(0);

    // R26, R89: las tres acciones de la central, con los nombres de hoy.
    await expect(fila.getByRole("button", { name: `Corregir métodos de pago ${deLa(central.entrega)}` })).toBeVisible();
    await expect(fila.getByRole("button", { name: `Ajustar pago al mensajero ${deLa(central.entrega)}` })).toBeVisible();
    await expect(fila.getByRole("button", { name: `Corregir el resultado ${deLa(central.entrega)}` })).toBeVisible();

    // La devolución: su cobro y su señal.
    await filtros(detalle).getByRole("button", { name: "Devolución a origen por rechazo 1" }).click();
    const filaRechazo = await desplegarFila(detalle, central.rechazo);
    expect(await lineasDe(tarjeta(filaRechazo, "Se le cobra a la tienda", central.rechazo))).toEqual([
      ["Flete por devolución a origen + IVA", "₡2.260"],
      ["Se le cobra", "₡2.260"],
    ]);
    expect(page.url()).toBe(url);

    // R91: «Descargar» con «Señales», una fila por gestión aunque el filtro deje una sola.
    const [descarga] = await Promise.all([
      page.waitForEvent("download"),
      detalle.getByRole("button", { name: /^Descargar Gestiones del cierre / }).click(),
    ]);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.readFile(await descarga.path());
    const filasXlsx: string[][] = [];
    libro.worksheets[0].eachRow((f) => filasXlsx.push((f.values as unknown[]).slice(1).map((v) => String(v ?? ""))));
    const cabecera = filasXlsx.findIndex((f) => f[0] === "Nº Guía");
    expect(filasXlsx[cabecera]).toEqual(COLUMNAS_R82);
    const datos = filasXlsx.slice(cabecera + 1);
    expect(datos).toHaveLength(3);
    // La fila de cada orden por su guía; una celda vacía al final de la fila no viene en `values` (ExcelJS).
    const filaXlsx = (o: OrdenE2E) => datos.find((f) => f[0] === String(o.numGuia));
    expect(filaXlsx(central.rechazo)?.[7]).toBe("Vuelve a bodega");
    expect(filaXlsx(central.entrega)).toBeDefined();
    expect(filaXlsx(central.entrega)?.[7] ?? "").toBe("");
  });

  test("satélite A: las mismas cifras de la fila, columna no GAM, sin Fulfillment y solo «Ajustar pago»", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirPendiente(page, satelite.m, "Ver / decidir");
    await detalle.getByRole("tab", { name: "Gestiones (3)" }).click();
    await expect(filtros(detalle).getByRole("button")).toHaveText(FILTROS_S3_A);

    const fila = await desplegarFila(detalle, satelite.entrega);
    const cobro = tarjeta(fila, "Se le cobra a la tienda", satelite.entrega);
    expect(await lineasDe(cobro)).toEqual([
      ["Flete por entregado + IVA", "₡2.260"],
      ["+ Comisión COD + IVA", "₡791"],
      ["Se le cobra", "₡3.051"],
    ]);
    await expect(cobro.locator("[data-aparte]")).toHaveText("de eso, IVA (no es de la empresa)₡351");
    expect(await lineasDe(tarjeta(fila, "Se le paga al mensajero", satelite.entrega))).toEqual([["Se le paga", "₡1.500"]]);
    // R25, R30 (ficha 481): la satélite no ve el fulfillment.
    await expect(fila.getByText("Fulfillment · se cobró al crear la orden", { exact: true })).toHaveCount(0);
    // R29: la satélite (zona no GAM) aplica la columna no GAM.
    await cobro.getByRole("button", { name: "Ver cómo se calculó" }).click();
    const calculo = fila.getByRole("region", { name: "Cómo se calculó el cobro a la tienda" });
    expect(await lineasDe(tarjeta(calculo, "Flete por entregado", satelite.entrega))).toEqual([
      ["tarifa no GAM", "₡2.000"],
      ["+ IVA flete (13 % de ₡2.000)", "₡260"],
      ["Flete por entregado", "₡2.260"],
    ]);
    // R26: solo «Ajustar pago».
    await expect(fila.getByRole("button", { name: `Ajustar pago al mensajero ${deLa(satelite.entrega)}` })).toBeVisible();
    await expect(fila.getByRole("button", { name: /^Corregir métodos de pago/ })).toHaveCount(0);
    await expect(fila.getByRole("button", { name: /^Corregir el resultado/ })).toHaveCount(0);
  });
});

test.describe.serial("SLT-100 — la central ve un cierre del modelo nuevo (escenario B)", () => {
  let r: RepartoE2E;
  let m: MensajeroE2E;
  let entregaB: OrdenE2E;

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
    entregaB = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entregaB, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10000 }] });
    await solicitarCierre(r, m);
  });

  // SLT-101 (T6.1, R64-R66, R77, R97, R98) — la fila de la entrega del modelo nuevo, con las cifras que emite el
  // servidor desde T1. Derivación (T0.3): flete por entregado 3.100 (monto fijo, valor base de la zona central) +
  // IVA 13 % 403 = 3.503 = se le cobra; de eso, IVA 403. Pago congelado del mensajero 2.200 (valor base de la zona),
  // sin ajuste: «Por tarifa» 2.200 y «Se le paga» 2.200. Sin concepto de fulfillment digitado: el congelado del
  // nuevo da 0 (sin % de IVA), así que «Fulfillment» 0 y «Se cobró» 0.
  test("central B: la fila del modelo nuevo con «Tarifa:», «Por tarifa» y el IVA incluido", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirPendiente(page, m, "Ver / decidir");
    await detalle.getByRole("tab", { name: "Gestiones (1)" }).click();
    const fila = await desplegarFila(detalle, entregaB);
    const cobro = tarjeta(fila, "Se le cobra a la tienda", entregaB);
    expect(await lineasDe(cobro)).toEqual([
      ["Flete por entregado + IVA", "₡3.503"],
      ["Se le cobra", "₡3.503"],
    ]);
    await expect(cobro.locator("[data-aparte]")).toHaveText("de eso, IVA (no es de la empresa)₡403");
    const zona = r.zonaCentral.nombre;
    expect(await lineasDe(tarjeta(fila, "Se le paga al mensajero", entregaB))).toEqual([
      [`Por tarifa · valor base de la zona ${zona}`, "₡2.200"],
      ["Se le paga", "₡2.200"],
    ]);
    expect(await lineasDe(tarjeta(fila, "Fulfillment · se cobró al crear la orden", entregaB))).toEqual([
      ["Fulfillment", "₡0"],
      ["Se cobró", "₡0"],
    ]);
    await cobro.getByRole("button", { name: "Ver cómo se calculó" }).click();
    const calculo = fila.getByRole("region", { name: "Cómo se calculó el cobro a la tienda" });
    const flete = tarjeta(calculo, "Flete por entregado", entregaB);
    await expect(flete.getByText(`Tarifa: valor base de la zona ${zona}`, { exact: true })).toBeVisible();
    expect(await lineasDe(flete)).toEqual([
      ["Monto fijo", "₡3.100"],
      ["+ IVA 13 %", "₡403"],
      ["Flete por entregado", "₡3.503"],
    ]);
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
