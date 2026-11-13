import ExcelJS from "exceljs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import {
  ajustarPagoMensajero,
  aprobarCierre,
  cierresDe,
  filaDeCola,
  filaDeMensajeros,
  importe,
  montoDeCuenta,
  pestanaDeCola,
  solicitarCierre,
  solicitarCierreBodega,
} from "./_escenarios/cierres";
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
  // SLT-102: la fila de la cola única (antes, el comprobante del cierre).
  const fila = filaDeCola(page.getByRole("region", { name: "Pendientes de decisión" }), m.nombre);
  await fila.getByRole("button", { name: boton }).click();
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

/**
 * SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (T3.2, R59, R77, R150) — el mensajero
 * abre SU cierre desde «Cierres solicitados» de `/cierre-dia` y lo lee en el detalle único. Desde
 * SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» es la cola, con un «Ver» por fila.
 */
async function abrirMiCierre(page: Page): Promise<Locator> {
  await page.goto("/cierre-dia");
  await page
    .getByRole("region", { name: "Cierres solicitados" })
    .getByRole("button", { name: /^Ver del cierre del / })
    .click();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre · Tu cierre del día" });
  await expect(detalle).toBeVisible();
  return detalle;
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

    // SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T6.1, R263, R266, R267): el reparto
    // del servidor, a mano: 94.350 / 100.000 = 94,35 y 5.650 / 100.000 = 5,65 → 94 + 5 = 99; el punto que
    // falta va al mayor resto (0,65) → [94, 6].
    await expect(detalle.getByRole("region", { name: "Reparto de lo recaudado" }).getByRole("listitem")).toHaveText([
      "Se le paga hoy a la tienda ₡94.350 (94 %)",
      "Sale de lo recaudado ₡5.650 (6 %)",
    ]);

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
    // SLT-123 «Pago al mensajero independiente del efectivo» (R315, R321): el efectivo (70.000) ya no
    // da por pagado al mensajero; se ofrece pagarle P = 2 × 1.500 = 3.000. Se deja para después.
    const oferta = page.getByRole("dialog", { name: `Registrar pago a ${central.m.nombre}` });
    await expect(oferta.getByText("Disponible:")).toContainText(importe(3000));
    await oferta.getByRole("button", { name: "Ahora no" }).click();
    expect((await cierresDe(central.m)).map((c) => [c.id, c.estado])).toEqual([[central.cierreId, "aprobado"]]);

    // Reabierto: solo lectura, quién lo aprobó (R80) y la pestaña de pago (R18).
    await pestanaDeCola(page, "Resueltos").click();
    await filaDeCola(page.getByRole("region", { name: "Histórico" }), central.m.nombre)
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

  // SLT-108 (R59, R77, R150): el mismo cierre A, ya aprobado, visto por SU mensajero desde /cierre-dia.
  // Literales de la cabecera de arriba: Recaudado 100.000 (70.000 efectivo + 30.000 SINPE, sin
  // Transferencia), 3 gestiones, ganancia 2 × 1.500 = 3.000. Ni «Le queda a la empresa» (3.500) ni
  // «Cobro a la tienda».
  test("mensajero A: su cierre en el detalle único, con sus tres cifras y sin el dinero de la empresa", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, central.m);
    const detalle = await abrirMiCierre(page);

    await expect(cifra(detalle, "recaudado")).toHaveText(importe(100000, { solo: true }));
    await expect(cifra(detalle, "gestiones")).toHaveText("3");
    await expect(cifra(detalle, "tuGanancia")).toHaveText(importe(3000, { solo: true }));
    const metodos = detalle.getByRole("group", { name: "Cifras del cierre" }).getByLabel("Métodos de pago de lo recaudado");
    await expect(metodos.getByText("Efectivo", { exact: true }).locator("..")).toContainText(importe(70000));
    await expect(metodos.getByText("SINPE", { exact: true }).locator("..")).toContainText(importe(30000));
    await expect(metodos.getByText("Transferencia", { exact: true })).toHaveCount(0);

    await expect(detalle.getByRole("tab", { name: "Gestiones (3)" })).toHaveAttribute("aria-selected", "true");
    await expect(detalle.getByRole("tab", { name: "Rechazados por la tienda (0)" })).toBeVisible();
    await expect(detalle.getByRole("tab", { name: "Dinero" })).toHaveCount(0);
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await expect(ordenes.getByText(importe(1500, { solo: true }))).toHaveCount(2);

    await expect(detalle.getByText(importe(3500, { solo: true }))).toHaveCount(0);
    await expect(detalle.getByText("Le queda a la empresa")).toHaveCount(0);
    await expect(detalle.getByText("Cobro a la tienda")).toHaveCount(0);
    await expect(detalle.getByText("Los montos son los que quedaron congelados al solicitar el cierre.")).toBeVisible();
    expect(await pie(detalle)).toEqual(["Cerrar"]);
  });

  // SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» (T3.1; R60, R157, R181). Literales
  // derivados a mano de la cabecera:
  //   central A, aprobado: ganancia P = 2 × 1.500 = 3.000; efectivo del cierre E = 70.000. Desde
  //   SLT-123 «Pago al mensajero independiente del efectivo» (R315, R320) lo que el cierre deja por
  //   pagar es P = 3.000 (antes P − min(P, E) = 0, «Liquidado»), sin pagos ni premios → «Pendiente de
  //   pago». Recaudado 100.000, Ganancia 3.000. Un solo cierre.
  //   satélite A, rechazado con «Faltan paquetes» → «Motivo: «Faltan paquetes»».
  test("mensajero A: su cola con la pestaña, «Pago» de un aprobado y de un rechazado, y «Ver» abre el detalle", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, central.m);
    await page.goto("/cierre-dia");
    await expect(page.getByRole("tablist", { name: "Tus cierres" }).getByRole("tab")).toHaveText(["Cierres solicitados 1"]);
    const cola = page.getByRole("region", { name: "Cierres solicitados" });
    const cabeceras = (await cola.getByRole("columnheader").allTextContents()).map((t) => t.trim());
    expect(cabeceras).toEqual(["Folio", "Solicitado", "Destino", "Estado", "Recaudado", "Ganancia", "Pago", "Acciones"]);
    const fila = cola.getByRole("row").nth(1);
    const celda = (col: string) => fila.getByRole("cell").nth(cabeceras.indexOf(col));
    await expect(celda("Folio")).toHaveText(`#${central.cierreId.slice(-8).toUpperCase()}`);
    await expect(celda("Destino")).toHaveText("Bodega central");
    await expect(celda("Estado")).toHaveText("Aprobado");
    await expect(celda("Recaudado")).toHaveText(importe(100000, { solo: true }));
    await expect(celda("Ganancia")).toHaveText(importe(3000, { solo: true }));
    await expect(celda("Pago")).toHaveText("Pendiente de pago");

    await fila.getByRole("button", { name: /^Ver del cierre del / }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre · Tu cierre del día" });
    await expect(cifra(detalle, "tuGanancia")).toHaveText(importe(3000, { solo: true }));

    const paginaSat = await paginaDe(browser, satelite.m);
    await paginaSat.goto("/cierre-dia");
    const filaSat = paginaSat.getByRole("region", { name: "Cierres solicitados" }).getByRole("row").nth(1);
    await expect(filaSat.getByRole("cell").nth(cabeceras.indexOf("Pago"))).toHaveText("Motivo: «Faltan paquetes»");
  });

  // SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» (T2.4; R175, R176, R178). El folio
  // se LEE de la fila, como lo ve el mensajero. 4 caracteres en minúscula (el servidor los pasa a
  // mayúsculas) → su fila; «ZZ» no puede estar en un folio (solo 0-9 y A-F) → vacío filtrado y 0.
  test("mensajero A: busca por folio, ve el vacío filtrado y «Limpiar todo» devuelve su cierre", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, central.m);
    await page.goto("/cierre-dia");
    const pestana = page.getByRole("tablist", { name: "Tus cierres" }).getByRole("tab");
    await expect(pestana).toHaveText(["Cierres solicitados 1"]);
    const cola = page.getByRole("region", { name: "Cierres solicitados" });
    const folio = ((await cola.getByRole("row").nth(1).getByRole("cell").first().textContent()) ?? "").trim();
    expect(folio).toMatch(/^#[0-9A-F]{8}$/);

    const barra = page.getByRole("region", { name: "Filtros de tus cierres" });
    const campo = barra.getByRole("searchbox", { name: "Buscar" });
    await expect(campo).toHaveAttribute("placeholder", "Busca por folio");

    await campo.fill(folio.slice(3, 7).toLowerCase());
    await expect(pestana).toHaveText(["Cierres solicitados 1"]);
    await expect(cola.getByRole("row").nth(1).getByRole("cell").first()).toHaveText(folio);

    await campo.fill("ZZ");
    await expect(cola.getByText("Ningún cierre coincide con los filtros.", { exact: true })).toBeVisible();
    await expect(pestana).toHaveText(["Cierres solicitados 0"]);

    await barra.getByRole("button", { name: "Limpiar todo" }).click();
    await expect(campo).toHaveValue("");
    await expect(pestana).toHaveText(["Cierres solicitados 1"]);
    await expect(cola.getByRole("row").nth(1).getByRole("cell").first()).toHaveText(folio);
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

  // SLT-108 (R77, R150): el mismo cierre B visto por su mensajero. Recaudado 10.000, 1 gestión, ganancia
  // 2.200 (el pago congelado del modelo nuevo). Ni «le queda» 900 ni el cobro 3.503.
  test("mensajero B: su cierre del modelo nuevo en el detalle único, sin el dinero de la empresa", async ({ browser }) => {
    const page = await paginaDe(browser, m);
    const detalle = await abrirMiCierre(page);
    await expect(cifra(detalle, "recaudado")).toHaveText(importe(10000, { solo: true }));
    await expect(cifra(detalle, "gestiones")).toHaveText("1");
    await expect(cifra(detalle, "tuGanancia")).toHaveText(importe(2200, { solo: true }));
    await expect(detalle.getByText(importe(900, { solo: true }))).toHaveCount(0);
    await expect(detalle.getByText(importe(3503, { solo: true }))).toHaveCount(0);
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

/**
 * SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T6.1; R33, R34, R36, R101, R103, R110) —
 * la FILA de la cola, con los literales ESCRITOS A MANO (derivación en `progress/impl_SLT-102.md > T6.1`).
 *
 * ESCENARIO S4 (decisión del leader sobre ABIERTO-1 y ABIERTO-2 de T0.3). Tarifa y pago del escenario A
 * (mensajero 1.500 por entrega; incidente y rechazo no pagan, feature 39 R5-R7).
 *   Central: entregas de 21.000 y 10.000 por SINPE (efectivo 0), un incidente (orden de 8.000, no recauda),
 *   un rechazo (vuelve a bodega) y el pago de la primera entrega ajustado de 1.500 a 2.000 (SLT-56).
 *     Recaudado 21.000 + 10.000 = 31.000 → «₡31.000» · Pago al mensajero 2.000 + 1.500 + 0 + 0 = 3.500 → «₡3.500»
 *     Señales (R110, en este orden): «1 incidente sin indemnizar · 1 pago ajustado · 1 vuelve a bodega»
 *     Aprobado (con indemnización: el incidente deja de estar «sin indemnizar»): P 3.500, E 0 →
 *     3.500 − min(3.500, 0) = 3.500 → «Pendiente ₡3.500» y «Registrar pago»; registrado → «Liquidado».
 *   Satélite: una entrega de 30.000 por SINPE y un rechazo.
 *     Recaudado «₡30.000» · Pago al mensajero «₡1.500» · «1 vuelve a bodega». Aprobado, su pendiente es
 *     1.500 > 0, y aun así la satélite no ve «Pago entregado» ni «Registrar pago» (R34).
 */
const FOLIO = /^#[0-9A-F]{8}$/;
const FECHA = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const COLUMNAS_PENDIENTES = ["Folio", "Mensajero", "Solicitado", "Estado", "Recaudado", "Pago al mensajero", "Señales", "Acciones"];
const COLUMNAS_RESUELTOS_CENTRAL = [
  "Folio",
  "Mensajero",
  "Resuelto",
  "Estado",
  "Recaudado",
  "Pago al mensajero",
  "Pago entregado",
  "Señales",
  "Acciones",
];
const COLUMNAS_RESUELTOS_SATELITE = ["Folio", "Mensajero", "Resuelto", "Estado", "Recaudado", "Pago al mensajero", "Señales", "Acciones"];

const pendientes = (page: Page): Locator => page.getByRole("region", { name: "Pendientes de decisión" });
const historico = (page: Page): Locator => page.getByRole("region", { name: "Histórico" });

/**
 * SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» (T6.1; R358, R360): las dos
 * tarjetas de «Cierres solicitados» en /cierre-dia, leídas en una carga nueva. Cada caja = [rótulo,
 * importe, nota], en el orden del spec.
 */
async function tarjetasGananciaDe(browser: Browser, m: MensajeroE2E): Promise<Locator[]> {
  const page = await paginaDe(browser, m);
  await page.goto("/cierre-dia");
  const grupo = page.getByRole("group", { name: "Ganancia de tus cierres" });
  return [
    grupo.getByRole("group", { name: "Ganancia pendiente de pago" }).locator("span"),
    grupo.getByRole("group", { name: "Ganancia pagada este mes" }).locator("span"),
  ];
}

test.describe.serial("SLT-102 — la fila de la cola única (escenario S4)", () => {
  let r: RepartoE2E;
  let central: { m: MensajeroE2E; rechazo: OrdenE2E; cierreId: string };
  let satelite: { m: MensajeroE2E; cierreId: string };

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierres-cola-s4", { tarifa: TARIFA_A, tarifaMensajero: PAGO_A });

    const m = await crearMensajero(r, "central");
    const e1 = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 21000 }), "en_reparto", { mensajero: m });
    const g1 = await gestionar(r, e1, m, { resultado: "entregado", pagos: [{ metodo: "SINPE", monto: 21000 }] });
    const e2 = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
    await gestionar(r, e2, m, { resultado: "entregado", pagos: [{ metodo: "SINPE", monto: 10000 }] });
    const inc = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 8000 }), "en_reparto", { mensajero: m });
    await gestionar(r, inc, m, { resultado: "incidente", causa: "perdido" });
    const rechazo = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 15000 }), "en_reparto", { mensajero: m });
    await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    const cierreId = await solicitarCierre(r, m);
    await ajustarPagoMensajero(r, g1, { anterior: "1500.00", nuevo: "2000.00", motivo: "Ruta larga, SLT-102 S4" });
    central = { m, rechazo, cierreId };

    const ms = await crearMensajero(r, "satelite");
    const es = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 30000 }), "en_reparto", { mensajero: ms });
    await gestionar(r, es, ms, { resultado: "entregado", pagos: [{ metodo: "SINPE", monto: 30000 }] });
    const rs = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 15000 }), "en_reparto", { mensajero: ms });
    await gestionar(r, rs, ms, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    satelite = { m: ms, cierreId: await solicitarCierre(r, ms) };
  });

  test("central: la fila con las tres señales, aprueba, «Pendiente ₡3.500» y «Registrar pago» → «Liquidado»", async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");

    // R33: las columnas de Pendientes, y la fila con los literales (F3, F4, F5).
    await expect(pestanaDeCola(page, "Pendientes")).toHaveAttribute("aria-selected", "true");
    await expect(pendientes(page).getByRole("columnheader")).toHaveText(COLUMNAS_PENDIENTES);
    const fila = filaDeCola(pendientes(page), central.m.nombre);
    await expect(fila.getByRole("cell")).toHaveText([
      FOLIO,
      central.m.nombre,
      FECHA,
      "Solicitado",
      "₡31.000",
      "₡3.500",
      "1 incidente sin indemnizar · 1 pago ajustado · 1 vuelve a bodega",
      "Ver / decidir",
    ]);

    // R36: «Ver / decidir» abre el detalle en modo decidir; se aprueba con la confirmación física y la
    // indemnización de hoy.
    await fila.getByRole("button", { name: "Ver / decidir" }).click();
    const detalle = detalleDe(page, central.m);
    await detalle.getByRole("button", { name: "Revisar paquetes y aprobar", exact: true }).click();
    const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
    const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
    await lector.getByLabel("Número de guía").fill(String(central.rechazo.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await confirmar.getByRole("button", { name: "Continuar", exact: true }).click();
    const indemnizar = page.getByRole("dialog", { name: "Indemnizar los incidentes del cierre" });
    await indemnizar.getByLabel("Monto de la indemnización").fill("5000");
    await indemnizar.getByRole("button", { name: "Aprobar e indemnizar" }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    await page.getByRole("dialog", { name: `Registrar pago a ${central.m.nombre}` }).getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await cierresDe(central.m)).map((c) => [c.id, c.estado])).toEqual([[central.cierreId, "aprobado"]]);

    // SLT-112 (R358): ANTES del pago el mensajero ve P 3.500 pendiente en un cierre y nada pagado este mes.
    const [pendienteAntes, pagadaAntes] = await tarjetasGananciaDe(browser, central.m);
    await expect(pendienteAntes).toHaveText(["Ganancia pendiente de pago", "₡3.500", "1 cierre aprobado sin liquidar"]);
    await expect(pagadaAntes).toHaveText(["Ganancia pagada este mes", "₡0", "Ningún pago este mes"]);

    // R103: en Resueltos, «Pago entregado» y «Registrar pago»; el incidente ya está indemnizado.
    await pestanaDeCola(page, "Resueltos").click();
    await expect(historico(page).getByRole("columnheader")).toHaveText(COLUMNAS_RESUELTOS_CENTRAL);
    const resuelta = filaDeCola(historico(page), central.m.nombre);
    await expect(resuelta.getByRole("cell")).toHaveText([
      FOLIO,
      central.m.nombre,
      FECHA,
      "Aprobado",
      "₡31.000",
      "₡3.500",
      "Pendiente ₡3.500",
      "1 pago ajustado · 1 vuelve a bodega",
      "VerRegistrar pago",
    ]);

    // R103: el diálogo de hoy, sin «Ahora no»; registrar relee la lista y la fila queda «Liquidado».
    await resuelta.getByRole("button", { name: `Registrar pago del cierre de ${central.m.nombre}` }).click();
    const pago = page.getByRole("dialog", { name: `Registrar pago a ${central.m.nombre}` });
    // El negativo, con el diálogo ya abierto: si no, pasaría en vacío.
    await expect(pago).toBeVisible();
    await expect(pago.getByRole("button", { name: "Registrar pago", exact: true })).toBeVisible();
    await expect(pago.getByRole("button", { name: "Ahora no" })).toHaveCount(0);
    await pago.getByRole("button", { name: "Registrar pago", exact: true }).click();
    await expect(pago).toHaveCount(0);
    await expect(resuelta.getByRole("cell").nth(6)).toHaveText("Liquidado");
    await expect(resuelta.getByRole("button", { name: `Registrar pago del cierre de ${central.m.nombre}` })).toHaveCount(0);

    // SLT-112 (R358, R360): la carga siguiente del mensajero ya trae el pago: nada pendiente y un pago
    // de 3.500 este mes.
    const [pendienteDespues, pagadaDespues] = await tarjetasGananciaDe(browser, central.m);
    await expect(pendienteDespues).toHaveText(["Ganancia pendiente de pago", "₡0", "Ningún cierre aprobado sin liquidar"]);
    await expect(pagadaDespues).toHaveText(["Ganancia pagada este mes", "₡3.500", "1 pago"]);
  });

  test("satélite: su fila sin «Pago entregado» ni «Registrar pago», aunque le quede pendiente", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, r.adminSatelite);
    await page.goto("/cierres-admin");

    await expect(pendientes(page).getByRole("columnheader")).toHaveText(COLUMNAS_PENDIENTES);
    await expect(filaDeCola(pendientes(page), satelite.m.nombre).getByRole("cell")).toHaveText([
      FOLIO,
      satelite.m.nombre,
      FECHA,
      "Solicitado",
      "₡30.000",
      "₡1.500",
      "1 vuelve a bodega",
      "Ver / decidir",
    ]);

    await aprobarCierre(r, satelite.cierreId);
    await page.reload();
    await pestanaDeCola(page, "Resueltos").click();
    await expect(historico(page).getByRole("columnheader")).toHaveText(COLUMNAS_RESUELTOS_SATELITE);
    const resuelta = filaDeCola(historico(page), satelite.m.nombre);
    await expect(resuelta.getByRole("cell")).toHaveText([FOLIO, satelite.m.nombre, FECHA, "Aprobado", "₡30.000", "₡1.500", "1 vuelve a bodega", "Ver"]);
    await expect(resuelta.getByRole("button", { name: `Registrar pago del cierre de ${satelite.m.nombre}` })).toHaveCount(0);
    await expect(page.getByText(/^Pendiente ₡/)).toHaveCount(0);
  });
});

// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura» (T4.3; R77, R51) — la satélite abre SU
// cierre de bodega desde «Solicitados» y lee las MISMAS cifras que la central, al céntimo y contra el literal escrito
// a mano; sin fulfillment ni acciones (solo «Cerrar»).
const CENTRAL_CUENTA = "Lo que va a la central";

/** Lo que se compara entre audiencias: las cuatro cifras y la cuenta «Lo que va a la central». */
async function lecturaDeBodega(detalle: Locator): Promise<string[]> {
  const textos: string[] = [];
  for (const id of ["recaudado", "paraCentral", "pago", "leQueda"]) {
    textos.push((await cifra(detalle, id).textContent()) ?? "");
  }
  await detalle.getByRole("tab", { name: "Dinero" }).click();
  for (const rotulo of ["Total general", "− Pago a mensajeros", "− Gana la bodega satélite", "Debe llegar a la central"]) {
    textos.push((await montoDeCuenta(detalle, CENTRAL_CUENTA, rotulo).textContent()) ?? "");
  }
  return textos;
}

async function bodegaDeCierres(page: Page): Promise<void> {
  await page.goto("/cierres-admin");
  await page.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
}

async function abrirBodegaComoCentral(page: Page, r: RepartoE2E): Promise<Locator> {
  await bodegaDeCierres(page);
  await page
    .getByRole("region", { name: "Cierres de bodega por conciliar" })
    .getByRole("button", { name: `Ver / conciliar el cierre de bodega de ${r.zonaSatelite.nombre}` })
    .click();
  const detalle = page.getByRole("dialog", { name: `Detalle del cierre de bodega · Cierre de bodega · ${r.zonaSatelite.nombre}` });
  await expect(detalle).toBeVisible();
  return detalle;
}

async function abrirBodegaComoSatelite(page: Page, r: RepartoE2E): Promise<Locator> {
  await bodegaDeCierres(page);
  const bodega = page.getByRole("region", { name: "Cierre de bodega" });
  await bodega.getByRole("tablist", { name: "Cierre de bodega por etapa" }).getByRole("tab", { name: /^Solicitados/ }).click();
  await bodega
    .getByRole("region", { name: "Cierres de bodega solicitados" })
    .getByRole("button", { name: /^Ver el cierre de bodega #/ })
    .click();
  const detalle = page.getByRole("dialog", { name: `Detalle del cierre de bodega · Cierre de bodega · ${r.zonaSatelite.nombre}` });
  await expect(detalle).toBeVisible();
  return detalle;
}

/** R51: «Gestiones» desplegada sin fulfillment y sin ninguna escritura; el pie, solo «Cerrar». */
async function sateliteSoloLee(detalle: Locator): Promise<void> {
  expect(await pie(detalle)).toEqual(["Cerrar"]);
  await detalle.getByRole("tab", { name: /^Gestiones \(/ }).click();
  const desplegar = detalle.getByRole("button", { name: /^(Desglose de ingreso|Detalle) de la orden / }).first();
  await desplegar.click();
  await expect(desplegar).toHaveAttribute("aria-expanded", "true");
  await expect(detalle.getByRole("region", { name: /^Fulfillment/ })).toHaveCount(0);
  await expect(detalle.getByText(/Fulfillment/)).toHaveCount(0);
  await expect(
    detalle.getByRole("button", { name: /Marcar recibido|Desmarcar|Corregir|Ajustar pago|Aprobar|Rechazar/ }),
  ).toHaveCount(0);
}

// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T6.2; R77, R40-R43, R114, R115, R116) — un
// cierre de bodega del MODELO NUEVO, como lo ve la central. Escenario B6: las tarifas del escenario B digitadas y
// activadas en la zona SATÉLITE (un cierre de central no se consolida), más «Pago a la satélite» por entregado 120
// para que «Gana la bodega satélite» no sea cero. Una entrega de 10.000 en efectivo, aprobada por la satélite y
// consolidada por su adminSatelite (`solicitarCierreBodega`, servicio). Cifras, a mano:
//   Recaudado ₡10.000 · Pago a mensajeros ₡2.200 · Gana la bodega satélite ₡120
//   Debe llegar a la central 10.000 − 2.200 − 120 = ₡7.680
//   Total facturado 3.100 + 13 % (403) = ₡3.503 · IVA ₡403 · Le queda 3.503 − 403 − 2.200 − 120 = ₡780
//   Mensajeros: una fila (1 gestión · ₡10.000 · ₡2.200 · ₡7.680 · «—»)
//   Conciliación sin marca: ₡7.680 · «—» · ₡7.680, «Marcó: Aún nadie».
const PAGO_SATELITE_B6: readonly Digitado[] = [{ concepto: "Por entregado", valor: "120" }];

test.describe.serial("SLT-104 — la central ve un cierre de bodega del modelo nuevo (escenario B6)", () => {
  let r: RepartoE2E;
  let m: MensajeroE2E;
  let cierreDiaId: string;
  let entregaB6: OrdenE2E;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("cierres-rediseno-b6");
    const page = await paginaDe(browser, r.empresa.maestro);
    await abrirTarifas(page);
    await irAZona(page, r.zonaSatelite.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_B);
    await digitarYGuardar(page, "Pago al mensajero", PAGO_B);
    await digitarYGuardar(page, "Pago a la satélite", PAGO_SATELITE_B6);
    await activarConFaltantes(page);
    await page.context().close();

    m = await crearMensajero(r, "satelite");
    const entrega = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
    entregaB6 = entrega;
    await gestionar(r, entrega, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10000 }] });
    cierreDiaId = await solicitarCierre(r, m);
    await aprobarCierre(r, cierreDiaId);
    await solicitarCierreBodega(r);
  });

  test("central, B6: cuatro cifras, «Dinero», «Mensajeros» y «Conciliación» al céntimo; «Ver su cierre» en solo lectura", async ({
    browser,
  }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");
    await page.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
    await page
      .getByRole("region", { name: "Cierres de bodega por conciliar" })
      .getByRole("button", { name: `Ver / conciliar el cierre de bodega de ${r.zonaSatelite.nombre}` })
      .click();
    const detalle = page.getByRole("dialog", { name: `Detalle del cierre de bodega · Cierre de bodega · ${r.zonaSatelite.nombre}` });
    await expect(detalle).toBeVisible();

    // R77: las cuatro cifras de bodega.
    await expect(cifra(detalle, "recaudado")).toHaveText("₡10.000");
    await expect(cifra(detalle, "paraCentral")).toHaveText("₡7.680");
    await expect(cifra(detalle, "pago")).toHaveText("₡2.200");
    await expect(cifra(detalle, "leQueda")).toHaveText("₡780");

    // «Dinero»: las tres cuentas.
    const CENTRAL = "Lo que va a la central";
    await expect(montoDeCuenta(detalle, CENTRAL, "Total general")).toHaveText("₡10.000");
    await expect(montoDeCuenta(detalle, CENTRAL, "− Pago a mensajeros")).toHaveText("₡2.200");
    await expect(montoDeCuenta(detalle, CENTRAL, "− Gana la bodega satélite")).toHaveText("₡120");
    await expect(montoDeCuenta(detalle, CENTRAL, "Debe llegar a la central")).toHaveText("₡7.680");
    await expect(montoDeCuenta(detalle, FACTURA, "Total facturado")).toHaveText("₡3.503");
    await expect(montoDeCuenta(detalle, QUEDA, "− IVA (no es de la empresa)")).toHaveText("₡403");
    await expect(montoDeCuenta(detalle, QUEDA, "− Pago a mensajeros")).toHaveText("₡2.200");
    await expect(montoDeCuenta(detalle, QUEDA, "− Gana la bodega satélite")).toHaveText("₡120");
    await expect(montoDeCuenta(detalle, QUEDA, "Le queda a la empresa")).toHaveText("₡780");

    // SLT-111 «Cifras del servidor: reparto en % y señales de la cola» (T6.1, R264, R266, R267): a mano,
    // 7.680 / 10.000 = 76,8 · 2.200 / 10.000 = 22 · 120 / 10.000 = 1,2 → 76 + 22 + 1 = 99; el punto que
    // falta va al mayor resto (0,8) → [77, 22, 1].
    await expect(detalle.getByRole("region", { name: "Reparto de lo recaudado" }).getByRole("listitem")).toHaveText([
      "Debe llegar a la central ₡7.680 (77 %)",
      "Pago a mensajeros ₡2.200 (22 %)",
      "Gana la bodega satélite ₡120 (1 %)",
    ]);

    // R42, R114, R121: una fila por cierre del día.
    await detalle.getByRole("tab", { name: "Mensajeros (1)" }).click();
    const fila = filaDeMensajeros(detalle, m.nombre);
    await expect(fila.getByRole("cell")).toHaveText([m.nombre, "1", "₡10.000", "₡2.200", "₡7.680", "—", "Ver su cierre"]);

    // R43, R117: sin marca, «− Recibido» dice «—».
    await detalle.getByRole("tab", { name: "Conciliación" }).click();
    await expect(montoDeCuenta(detalle, "Conciliación", "Debe llegar a la central")).toHaveText("₡7.680");
    await expect(montoDeCuenta(detalle, "Conciliación", "− Recibido")).toHaveText("—");
    await expect(montoDeCuenta(detalle, "Conciliación", "Falta por recibir")).toHaveText("₡7.680");
    await expect(detalle.getByRole("region", { name: "Conciliación", exact: true })).toContainText("Marcó: Aún nadie");

    // R115, R116 (PA1): «Ver su cierre» cierra el detalle de bodega y abre el del cierre del día en SOLO LECTURA.
    await detalle.getByRole("tab", { name: "Mensajeros (1)" }).click();
    await fila.getByRole("link", { name: `Ver el cierre de ${m.nombre}` }).click();
    await expect(detalle).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`[?&]cierre=${cierreDiaId}(&|$)`));
    const suCierre = detalleDe(page, m);
    await expect(suCierre).toBeVisible();
    // Control: el detalle está cargado (con sus cifras) antes de afirmar ausencias.
    await expect(cifra(suCierre, "recaudado")).toHaveText("₡10.000");
    await expect(cifra(suCierre, "pago")).toHaveText("₡2.200");
    // Ninguna escritura: ni aprobar, rechazar, destrabar, corregir, ajustar ni pagar. Solo «Cerrar» en el pie.
    expect(await pie(suCierre)).toEqual(["Cerrar"]);
    const escrituras = /Aprobar|Rechazar|Destrabar|Corregir|Ajustar pago|Registrar pago|Marcar recibido/;
    await expect(suCierre.getByRole("button", { name: escrituras })).toHaveCount(0);
    await expect(suCierre.getByRole("tab", { name: /^(Pago al mensajero|Corregir)$/ })).toHaveCount(0);
    await suCierre.getByRole("tab", { name: /^Gestiones \(/ }).click();
    const ordenes = ordenesDe(suCierre);
    const desplegar = ordenes.getByRole("button", { name: /^(Desglose de ingreso|Detalle) de la orden / }).first();
    await desplegar.click();
    await expect(desplegar).toHaveAttribute("aria-expanded", "true");
    await expect(suCierre.getByRole("button", { name: escrituras })).toHaveCount(0);
    // Y la base no cambió: el cierre del día sigue aprobado tal cual.
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, String(c.totalPagoMensajero)])).toEqual([[cierreDiaId, "aprobado", "2200"]]);
  });

  // SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» (T5.1; R64-R66) — la fila de la
  // entrega en «Gestiones» del detalle de bodega lleva las cifras del servidor por el mismo mapper que el detalle
  // de mensajeros. A mano: flete por entregado 3.100 (monto fijo, valor base de la zona satélite) + IVA 13 % 403;
  // de eso, IVA ₡403. Pago congelado del mensajero 2.200 sin ajuste: «Por tarifa» ₡2.200 y «Se le paga» ₡2.200.
  test("central, B6: la fila de bodega con el IVA incluido, la tarjeta del flete y «Por tarifa»", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");
    await page.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
    await page
      .getByRole("region", { name: "Cierres de bodega por conciliar" })
      .getByRole("button", { name: `Ver / conciliar el cierre de bodega de ${r.zonaSatelite.nombre}` })
      .click();
    const detalle = page.getByRole("dialog", { name: `Detalle del cierre de bodega · Cierre de bodega · ${r.zonaSatelite.nombre}` });
    await expect(detalle).toBeVisible();
    await detalle.getByRole("tab", { name: "Gestiones (1)" }).click();

    const fila = await desplegarFila(detalle, entregaB6);
    const cobro = tarjeta(fila, "Se le cobra a la tienda", entregaB6);
    await expect(cobro.locator("[data-aparte]")).toHaveText("de eso, IVA (no es de la empresa)₡403");
    // R66: «Por tarifa» y «Se le paga», sin línea de ajuste entre medias.
    const zona = r.zonaSatelite.nombre;
    expect(await lineasDe(tarjeta(fila, "Se le paga al mensajero", entregaB6))).toEqual([
      [`Por tarifa · valor base de la zona ${zona}`, "₡2.200"],
      ["Se le paga", "₡2.200"],
    ]);
    // R64: la tarjeta del flete en «Ver cómo se calculó», con su rótulo vigente.
    await cobro.getByRole("button", { name: "Ver cómo se calculó" }).click();
    const calculo = fila.getByRole("region", { name: "Cómo se calculó el cobro a la tienda" });
    const flete = tarjeta(calculo, "Flete por entregado", entregaB6);
    await expect(flete.getByText(`Tarifa: valor base de la zona ${zona}`, { exact: true })).toBeVisible();
    expect(await lineasDe(flete)).toEqual([
      ["Monto fijo", "₡3.100"],
      ["+ IVA 13 %", "₡403"],
      ["Flete por entregado", "₡3.503"],
    ]);
  });

  // SLT-107 (T4.3; R77, R51): la satélite abre el MISMO cierre de bodega del modelo nuevo desde «Solicitados».
  test("satélite, B6: las mismas cifras que la central, al céntimo, sin fulfillment y solo «Cerrar»", async ({ browser }) => {
    const central = await paginaDe(browser, r.empresa.maestro);
    const loQueVeLaCentral = await lecturaDeBodega(await abrirBodegaComoCentral(central, r));
    await central.context().close();

    const page = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirBodegaComoSatelite(page, r);
    const LITERALES = ["₡10.000", "₡7.680", "₡2.200", "₡780", "₡10.000", "₡2.200", "₡120", "₡7.680"];
    expect(await lecturaDeBodega(detalle)).toEqual(LITERALES);
    expect(loQueVeLaCentral).toEqual(LITERALES);
    await sateliteSoloLee(detalle);
  });
});

// SLT-107 (T4.3; R77, R51) — un cierre de bodega del MODELO VIEJO (tarifa por mensajero 1.500 por entregado, 500 por
// rechazo; tienda por defecto de la fábrica: flete 2.500, flete devuelto 1.250, sin IVA ni comisión). Una entrega de
// 9.000 y un rechazo. Cifras, a mano (las de `e2e/cierre-bodega-satelite.spec.ts`):
//   Recaudado ₡9.000 · Pago a mensajeros ₡1.500 · Gana la bodega satélite ₡500
//   Debe llegar a la central 9.000 − 1.500 − 500 = ₡7.000 · Le queda 3.750 − 1.500 − 500 = ₡1.750
test.describe.serial("SLT-107 — la satélite lee su cierre de bodega del modelo viejo igual que la central", () => {
  let r: RepartoE2E;

  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierres-rediseno-bodega-viejo", {
      tarifaMensajero: { cobroEntregado: 1500, cobroRechazado: 500 },
    });
    const m = await crearMensajero(r, "satelite");
    const entrega = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 9000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entrega, m, { resultado: "entregado" });
    const rechazo = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero: m });
    await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo" });
    await aprobarCierre(r, await solicitarCierre(r, m));
    await solicitarCierreBodega(r);
  });

  test("central y satélite: las mismas cifras al céntimo; la satélite sin fulfillment y solo «Cerrar»", async ({ browser }) => {
    const LITERALES = ["₡9.000", "₡7.000", "₡1.500", "₡1.750", "₡9.000", "₡1.500", "₡500", "₡7.000"];
    const central = await paginaDe(browser, r.empresa.maestro);
    expect(await lecturaDeBodega(await abrirBodegaComoCentral(central, r))).toEqual(LITERALES);
    await central.context().close();

    const page = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirBodegaComoSatelite(page, r);
    expect(await lecturaDeBodega(detalle)).toEqual(LITERALES);
    await sateliteSoloLee(detalle);
  });
});
