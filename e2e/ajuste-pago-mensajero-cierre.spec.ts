import { expect, test, type Locator, type Page } from "@playwright/test";

import { cierresDe, filaDeCola, filaDeMensajeros, importe, montoDeCuenta, solicitarCierre } from "./_escenarios/cierres";
import { navegarCon } from "./_escenarios/pulsar";
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
 * E2E — SLT-56 «Ajustar en el cierre lo que ganó el mensajero» (T9; R1, R2, R11, R13, R14, R19,
 * R20).
 *
 *  1. CENTRAL. El maestro abre un cierre `solicitado`, ajusta el pago de un RECHAZO de 0 a 700 con
 *     motivo y, sin recargar, ve el pago nuevo de la orden con su marca «Ajustado» (y el historial al
 *     pulsarla), el «Pago al mensajero» del cierre y lo que le queda a la empresa recalculados.
 *     Aprueba (confirmando la guía del paquete que vuelve): el pendiente que se le ofrece pagar, el
 *     estado de cuenta del mensajero y el cierre en base salen del total AJUSTADO (R13).
 *  2. SATÉLITE. El adminSatelite ajusta la entrega de un cierre de su bodega de 1.500 a 1.800 y lo
 *     aprueba él solo (sin la central, R2); solicita el cierre de bodega; el maestro abre la
 *     consolidación (detalle único desde SLT-104) y ve la fila del mensajero en «Mensajeros» con
 *     «1 pago ajustado», la orden «Ajustado» con su historial en «Gestiones», y el pago a mensajeros y
 *     «Debe llegar a la central» sobre el total ajustado (R14, R20).
 *
 * DATOS (R7, R8 de SL-44): empresa nueva, tarifa por defecto del escenario (1.500 la entrega; un
 * rechazo no paga al mensajero). Gestiones por `MisAsignacionesService`, cierres por
 * `CierreDiaService.solicitarCierre`; el ajuste, la aprobación y la consolidación, por la PANTALLA.
 *
 * CIFRAS, a mano:
 *  (1) entrega de 2.000 en efectivo + un rechazo. Pago antes 1.500 + 0 = 1.500; el rechazo pasa a
 *      700 → 2.200. Al aprobar: devengo 2.200, pagado del efectivo mín(2.200, 2.000) = 2.000,
 *      pendiente 200. Sin el ajuste el efectivo lo cubría todo y no quedaba nada pendiente.
 *  (2) entrega de 9.000 en efectivo. Pago 1.500 → 1.800. Para la central = 9.000 − 1.800 − 0 =
 *      7.200 (sin el ajuste serían 7.500).
 */

const MOTIVO_CENTRAL = "Volvió dos veces a la dirección: se le reconoce el viaje";
const MOTIVO_SATELITE = "Entrega en zona de difícil acceso";

let r: RepartoE2E;

/** Un importe tal como lo pinta la pantalla («₡1.234», «-₡416,47») → céntimos, sin coma flotante. */
function aCentimos(texto: string): bigint {
  const negativo = texto.includes("-");
  const limpio = texto.replace(/[^\d,]/g, "");
  const [entero, cola = ""] = limpio.split(",");
  const centimos = BigInt(entero || "0") * BigInt(100) + BigInt((cola + "00").slice(0, 2));
  return negativo ? -centimos : centimos;
}

/** «anterior → nuevo» del historial de ajustes, con el símbolo de la moneda delante de cada cifra. */
function deA(anterior: number, nuevo: number): RegExp {
  return new RegExp(`${importe(anterior).source}\\s*→\\s*[^\\d\\s]{0,3}${importe(nuevo).source}`);
}

async function abrirDetalle(page: Page, m: MensajeroE2E): Promise<Locator> {
  await page.goto("/cierres-admin");
  const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
  const comprobante = filaDeCola(pendientes, m.nombre);
  await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
  await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await expect(detalle).toBeVisible();
  return detalle;
}

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»: la cascada «Lo que le queda a la empresa»
 * del modal anterior es la cuenta «De lo facturado, le queda a la empresa» del detalle único, y su neto es «Le
 * queda a la empresa». La cuenta vive en la pestaña «Dinero» y las órdenes, en «Gestiones».
 */
function lineaCuenta(detalle: Locator, rotulo: string): Locator {
  return detalle
    .getByRole("region", { name: "De lo facturado, le queda a la empresa" })
    .locator("[data-signo]")
    .filter({ has: detalle.page().locator("[data-rotulo]", { hasText: new RegExp(`^${rotulo}$`) }) })
    .locator("[data-monto]");
}

async function irA(detalle: Locator, pestana: "Dinero" | "Gestiones"): Promise<void> {
  await detalle.getByRole("tab", { name: pestana === "Dinero" ? "Dinero" : /^Gestiones \(/ }).click();
}

/**
 * SLT-101 «Fila de gestión única y lista con filtros» (R84): las pestañas por resultado de la lista pasan a ser
 * el filtro «Filtrar por resultado» («<resultado> <n>»), encima de «Órdenes del cierre».
 */
const filtro = (detalle: Locator, resultado: RegExp) =>
  detalle.getByRole("group", { name: "Filtrar por resultado" }).getByRole("button", { name: resultado });

/** SLT-101 (R98): el total «Se le paga» de la tarjeta del pago de la orden, en la fila desplegada. */
function seLePaga(ordenes: Locator, o: OrdenE2E): Locator {
  return ordenes
    .getByRole("region", { name: `Se le paga al mensajero de la orden ${o.numRemision} · ${o.destinatario}` })
    .locator("[data-tipo='total'] [data-monto]");
}

/** Despliega la fila de la orden dentro de `ordenes` (si está plegada) y la devuelve. */
async function desplegar(ordenes: Locator, o: OrdenE2E): Promise<void> {
  const fila = ordenes.getByRole("button", { name: new RegExp(o.numRemision) }).first();
  if ((await fila.getAttribute("aria-expanded")) !== "true") await fila.click();
  await expect(fila).toHaveAttribute("aria-expanded", "true");
}

/** Ajusta el pago de la orden desde su fila: valor nuevo + motivo; devuelve el diálogo hecho. */
async function ajustar(page: Page, o: OrdenE2E, valor: string, motivo: string): Promise<Locator> {
  await page.getByRole("button", { name: `Ajustar pago al mensajero de la orden ${o.numRemision} · ${o.destinatario}` }).click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar el pago al mensajero" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Valor nuevo").fill(valor);
  await dialogo.getByLabel("Motivo del ajuste").fill(motivo);
  await dialogo.getByRole("button", { name: "Guardar ajuste" }).click();
  await expect(dialogo.getByText("Listo. Así quedó el pago, según el servidor:")).toBeVisible();
  return dialogo;
}

/** Abre la marca «Ajustado» y devuelve la lista del historial de ajustes. */
async function verHistorial(page: Page, donde: Locator): Promise<Locator> {
  const marca = donde.getByRole("button", { name: "Pago ajustado: ver el ajuste" });
  await expect(marca).toHaveText("Ajustado");
  await marca.click();
  const lista = page.getByRole("list", { name: "Ajustes del pago al mensajero" });
  await expect(lista).toBeVisible();
  return lista;
}

test.describe("Ajuste del pago al mensajero al revisar el cierre", () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000);
    r = await crearEscenarioReparto("ajuste-pago-56");
  });

  test("central — el maestro ajusta un rechazo de 0 a 700, ve la marca y los totales al momento, y el devengo sale ajustado", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const m = await crearMensajero(r, "central");
    const entrega = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 2000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entrega, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 2000 }] });
    const rechazada = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, rechazada, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    const cierreId = await solicitarCierre(r, m);

    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirDetalle(page, m);

    // ANTES: 1.500 de pago al mensajero (la entrega), y lo que le queda a la empresa con él.
    await expect(lineaCuenta(detalle, "− Pago al mensajero")).toContainText(importe(1500));
    const lineaNeto = lineaCuenta(detalle, "Le queda a la empresa");
    const netoAntes = aCentimos(await lineaNeto.innerText());

    await irA(detalle, "Gestiones");
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await filtro(detalle, /^Devolución a origen por rechazo \d+$/).click();
    await desplegar(ordenes, rechazada);
    // El rechazo no paga (pago vigente 0) y todavía no tiene marca.
    await expect(ordenes.getByRole("button", { name: /^Pago ajustado/ })).toHaveCount(0);

    // R1/R11 — el ajuste, y las cifras que devuelve el servidor.
    const hecho = await ajustar(page, rechazada, "700", MOTIVO_CENTRAL);
    await expect(hecho.getByText("Pago de esta orden").locator("xpath=..")).toContainText(importe(700));
    await expect(hecho.getByText("Total de pago al mensajero del cierre").locator("xpath=..")).toContainText(importe(2200));
    await hecho.getByRole("button", { name: "Cerrar" }).click();
    await expect(hecho).toHaveCount(0);

    // R11 — sin recargar: el pago al mensajero del cierre pasa a 2.200 y lo que le queda a la
    // empresa baja exactamente los 700 del ajuste (lo demás del cierre no cambió).
    await expect(detalle).toBeVisible();
    await irA(detalle, "Dinero");
    await expect(lineaCuenta(detalle, "− Pago al mensajero")).toContainText(importe(2200));
    await expect.poll(async () => aCentimos(await lineaNeto.innerText())).toBe(netoAntes - BigInt(70000));
    // Volver a «Gestiones» la monta de nuevo: arranca en su primera sección con órdenes.
    await irA(detalle, "Gestiones");
    await filtro(detalle, /^Devolución a origen por rechazo \d+$/).click();

    // R19 — la orden con su pago nuevo, marcada «Ajustado»; al pulsar, quién, de cuánto a cuánto y por qué.
    await desplegar(ordenes, rechazada);
    // SLT-101 (R85, R98): la señal de la fila y la tarjeta del pago en cascada. Modelo viejo: sin «Por tarifa»
    // (no hay pago congelado que leer, R95); «Se le paga» 700, el motivo y quién ajustó.
    await expect(ordenes.getByText("Pago ajustado · Vuelve a bodega", { exact: true })).toBeVisible();
    await expect(seLePaga(ordenes, rechazada)).toHaveText(importe(700, { solo: true }));
    const tarjetaPago = ordenes.getByRole("region", { name: `Se le paga al mensajero de la orden ${rechazada.numRemision} · ${rechazada.destinatario}` });
    await expect(tarjetaPago.getByText(/^Por tarifa/)).toHaveCount(0);
    await expect(tarjetaPago.getByText(`Motivo: «${MOTIVO_CENTRAL}»`, { exact: true })).toBeVisible();
    await expect(tarjetaPago.getByText(new RegExp(`^Ajustó ${r.empresa.maestro.nombre} · \\d{2}/\\d{2} \\d{2}:\\d{2}$`))).toBeVisible();
    const historial = await verHistorial(page, ordenes);
    await expect(historial.getByRole("listitem")).toHaveCount(1);
    const ajuste = historial.getByRole("listitem").first();
    await expect(ajuste).toContainText(`${r.empresa.maestro.nombre} (Maestro)`);
    await expect(ajuste).toContainText(deA(0, 700));
    await expect(ajuste).toContainText(`Motivo: ${MOTIVO_CENTRAL}`);
    await page.keyboard.press("Escape");

    // R13 — aprobar (confirmando la guía del rechazo, feature 238). SLT-100: con un paquete que vuelve, el pie
    // del detalle único dice «Revisar paquetes y aprobar».
    await detalle.getByRole("button", { name: "Revisar paquetes y aprobar", exact: true }).click();
    const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
    const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
    await lector.getByLabel("Número de guía").fill(String(rechazada.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await confirmar.getByRole("button", { name: "Confirmar y aprobar" }).click();
    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();

    // Con el total ajustado el efectivo (2.000) ya no cubre el devengo (2.200): queda 200 por pagar.
    const oferta = page.getByRole("dialog", { name: `Registrar pago a ${m.nombre}` });
    await expect(oferta.getByText("Disponible:")).toContainText(importe(200));
    await oferta.getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    expect((await cierresDe(m)).map((c) => [c.id, c.estado, String(c.totalPagoMensajero)])).toEqual([
      [cierreId, "aprobado", "2200"],
    ]);

    // R13 — el estado de cuenta del mensajero: devengo 2.200, pagado del efectivo 2.000, debe 200.
    await page.goto("/wallet/mensajeros");
    await navegarCon(
      page,
      page.getByRole("link", { name: `Ver estado de cuenta de ${m.nombre}` }),
      new RegExp(`/wallet/mensajeros/${m.id}$`),
    );
    const libro = page.getByRole("table", { name: `Estado de cuenta de ${m.nombre}` });
    const devengo = libro.getByRole("row").filter({ hasText: "Pago devengado" });
    const pagado = libro.getByRole("row").filter({ hasText: "Pago del efectivo" });
    await expect(devengo).toHaveCount(1);
    await expect(pagado).toHaveCount(1);
    await expect(devengo).toContainText(importe(2200));
    await expect(pagado).toContainText(importe(2000));
    const tarjeta = page.getByRole("region", { name: `Saldo de ${m.nombre}` });
    await expect(tarjeta.getByText("La empresa le debe")).toContainText(importe(200));
  });

  test("satélite — el adminSatelite ajusta y aprueba solo; la central ve «1 pago ajustado» en «Mensajeros» y el total ajustado", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const m = await crearMensajero(r, "satelite");
    const entrega = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 9000 }), "en_reparto", { mensajero: m });
    await gestionar(r, entrega, m, { resultado: "entregado" });
    const cierreId = await solicitarCierre(r, m);

    // R2 — el adminSatelite ajusta la entrega de 1.500 a 1.800 y aprueba, sin pasar por la central.
    const sat = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirDetalle(sat, m);
    await irA(detalle, "Gestiones");
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await desplegar(ordenes, entrega);
    const hecho = await ajustar(sat, entrega, "1800", MOTIVO_SATELITE);
    await expect(hecho.getByText("Pago de esta orden").locator("xpath=..")).toContainText(importe(1800));
    await expect(hecho.getByText("Total de pago al mensajero del cierre").locator("xpath=..")).toContainText(importe(1800));
    await hecho.getByRole("button", { name: "Cerrar" }).click();
    await desplegar(ordenes, entrega);
    await expect(ordenes.getByRole("button", { name: "Pago ajustado: ver el ajuste" })).toHaveText("Ajustado");
    // SLT-101 (R85, R98): «Pago ajustado» en la fila y «Se le paga» 1.800 en la tarjeta del pago.
    await expect(ordenes.getByText("Pago ajustado", { exact: true })).toBeVisible();
    await expect(seLePaga(ordenes, entrega)).toHaveText(importe(1800, { solo: true }));

    await detalle.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(sat.getByText("Cierre aprobado correctamente.")).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, String(c.totalPagoMensajero)])).toEqual([
      [cierreId, "aprobado", "1800"],
    ]);

    // R14 — la consolidación de la bodega, sobre el total ajustado.
    await sat.goto("/cierres-admin");
    await sat.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
    const bodega = sat.getByRole("region", { name: "Cierre de bodega" });
    // SLT-106 «Bodega satélite: A consolidar con la cola única» (R192): la fila de la cola lleva la señal
    // del ajuste y el pago ya ajustado; el botón vive en el pie de la cola, no en una región propia.
    const fila = filaDeCola(bodega.getByRole("region", { name: "Cierres del día a consolidar" }), m.nombre);
    await expect(fila.getByRole("cell").nth(4)).toHaveText("₡1.800");
    await expect(fila.getByRole("cell").nth(7)).toHaveText("1 pago ajustado");
    await bodega.getByRole("button", { name: "Solicitar cierre de bodega" }).click();
    await sat.getByRole("dialog", { name: "Solicitar cierre de bodega" }).getByRole("button", { name: "Solicitar cierre de bodega" }).click();
    await expect(sat.getByText("Cierre de bodega solicitado correctamente.")).toBeVisible();

    const consolidaciones = await baseReparto().cierreBodega.findMany({
      where: { zonaId: r.zonaSatelite.id },
      select: { estado: true, totalGeneral: true, totalPagoMensajero: true },
    });
    expect(consolidaciones.map((c) => [c.estado, String(c.totalGeneral), String(c.totalPagoMensajero)])).toEqual([
      ["solicitado", "9000", "1800"],
    ]);

    // R20 — la central abre la consolidación pendiente.
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");
    await page.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
    await page
      .getByRole("region", { name: "Cierres de bodega satélite" })
      .getByRole("region", { name: "Cierres de bodega por conciliar" })
      .getByRole("button", { name: `Ver / conciliar el cierre de bodega de ${r.zonaSatelite.nombre}` })
      .click();
    const det = page.getByRole("dialog", { name: "Detalle del cierre de bodega" });
    await expect(det).toBeVisible();

    // SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T6.1; R31, R42, R114): el detalle
    // único. AGREGADO en «Dinero» («Lo que va a la central») y en las cifras; POR MENSAJERO, la fila de
    // «Mensajeros». Literales a mano (`impl_SLT-104.md > T0.3`): pago 1.800; a la central 9.000 − 1.800 − 0
    // = 7.200; total facturado 2.500 (flete de la entrega; sin fulfillment ni zona especial, comprobado en la
    // base de la corrida); le queda 2.500 − 0 − 1.800 − 0 = 700.
    await expect(det.locator('[data-cifra="recaudado"]')).toHaveText("₡9.000");
    await expect(det.locator('[data-cifra="paraCentral"]')).toHaveText("₡7.200");
    await expect(det.locator('[data-cifra="pago"]')).toHaveText("₡1.800");
    await expect(det.locator('[data-cifra="leQueda"]')).toHaveText("₡700");
    const CENTRAL = "Lo que va a la central";
    await expect(montoDeCuenta(det, CENTRAL, "Total general")).toHaveText("₡9.000");
    await expect(montoDeCuenta(det, CENTRAL, "− Pago a mensajeros")).toHaveText("₡1.800");
    await expect(montoDeCuenta(det, CENTRAL, "Debe llegar a la central")).toHaveText("₡7.200");
    await expect(montoDeCuenta(det, "Lo que se le factura a la tienda", "Total facturado")).toHaveText("₡2.500");
    await expect(montoDeCuenta(det, "De lo facturado, le queda a la empresa", "Le queda a la empresa")).toHaveText("₡700");

    await det.getByRole("tab", { name: "Mensajeros (1)" }).click();
    await expect(filaDeMensajeros(det, m.nombre).getByRole("cell")).toHaveText([
      m.nombre,
      "1",
      "₡9.000",
      "₡1.800",
      "₡7.200",
      "1 pago ajustado",
      "Ver su cierre",
    ]);

    // La gestión, en «Gestiones»: «Ajustado» con su historial, y solo lectura (R31: sin «Ajustar pago»).
    await irA(det, "Gestiones");
    const ordenesBodega = det.getByRole("region", { name: "Órdenes del cierre" });
    await desplegar(ordenesBodega, entrega);
    await expect(ordenesBodega.getByRole("button", { name: /^Ajustar pago/ })).toHaveCount(0);
    const historial = await verHistorial(page, ordenesBodega);
    await expect(historial.getByRole("listitem")).toHaveCount(1);
    const ajuste = historial.getByRole("listitem").first();
    await expect(ajuste).toContainText(`${r.adminSatelite.nombre} (Admin satélite)`);
    await expect(ajuste).toContainText(deA(1500, 1800));
    await expect(ajuste).toContainText(`Motivo: ${MOTIVO_SATELITE}`);
  });
});
