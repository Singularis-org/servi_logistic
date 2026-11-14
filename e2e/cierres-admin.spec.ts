import { expect, test, type Locator, type Page } from "@playwright/test";

import { cierresDe, filaDeCola, importe, pestanaDeCola, solicitarCierre } from "./_escenarios/cierres";
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
 * E2E — «Cierres del día» del admin de la bodega (features 38 y 238; SL-44 T6.1, R18).
 *
 * El maestro decide los cierres de los mensajeros de la bodega central:
 *  (a) APROBAR: abre el detalle de un cierre solicitado, lee los totales del snapshot, abre la
 *      evidencia firmada de la orden rechazada (sale del doble de Storage, D2), pulsa «Aprobar»,
 *      confirma físicamente el paquete que vuelve (su guía) y el cierre pasa a «Resueltos» como
 *      «Aprobado».
 *  (b) RECHAZAR: el motivo es obligatorio; con motivo, el cierre pasa a «Resueltos» como
 *      «Rechazado» y el motivo queda guardado.
 *
 * DATOS (R7, R8): empresa nueva; cada caso con SU mensajero de la zona central. Las gestiones, por
 * `MisAsignacionesService` (con la foto subida al doble de Storage); el cierre, por
 * `CierreDiaService.solicitarCierre`. Cifras a mano:
 *  (a) entrega de 6.000 en efectivo + un rechazo → Efectivo 6.000, Total general 6.000.
 *  (b) entrega de 2.500 en efectivo.
 */

let r: RepartoE2E;

async function conCierreSolicitado(
  entregas: number[],
  rechazos: number,
): Promise<{ m: MensajeroE2E; rechazadas: OrdenE2E[]; cierreId: string }> {
  const m = await crearMensajero(r, "central");
  for (const monto of entregas) {
    const o = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: monto }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto }] });
  }
  const rechazadas: OrdenE2E[] = [];
  for (let i = 0; i < rechazos; i++) {
    const o = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, o, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
    rechazadas.push(o);
  }
  return { m, rechazadas, cierreId: await solicitarCierre(r, m) };
}

async function abrirDetalle(page: Page, m: MensajeroE2E) {
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
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»: el detalle es el único de SLT-95. «Totales
 * del cierre» pasó a las cifras de arriba (`Recaudado` con sus métodos) y las órdenes, a la pestaña «Gestiones».
 */
const recaudado = (detalle: Locator) => detalle.locator('[data-cifra="recaudado"]');
const metodo = (detalle: Locator, nombre: string) =>
  detalle.getByLabel("Métodos de pago de lo recaudado").getByText(nombre, { exact: true }).locator("..");
async function ordenesDe(detalle: Locator): Promise<Locator> {
  await detalle.getByRole("tab", { name: /^Gestiones \(/ }).click();
  return detalle.getByRole("region", { name: "Órdenes del cierre" });
}

/**
 * SLT-101 «Fila de gestión única y lista con filtros» (R84, R89): las pestañas por resultado de la lista pasan
 * a ser el filtro «Filtrar por resultado» («<resultado> <n>»), encima de «Órdenes del cierre».
 */
const filtro = (detalle: Locator, resultado: RegExp) =>
  detalle.getByRole("group", { name: "Filtrar por resultado" }).getByRole("button", { name: resultado });

async function verResueltos(page: Page, m: MensajeroE2E) {
  await pestanaDeCola(page, "Resueltos").click();
  return filaDeCola(page.getByRole("region", { name: "Histórico" }), m.nombre);
}

test.describe("Cierres del día — el admin aprueba o rechaza", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("cierres-admin");
  });

  test("(a) detalle con totales y evidencia → Aprobar con la guía confirmada → «Aprobado»", async ({ browser }) => {
    const { m, rechazadas, cierreId } = await conCierreSolicitado([6000], 1);
    const [rechazada] = rechazadas;
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirDetalle(page, m);

    await expect(metodo(detalle, "Efectivo")).toContainText(importe(6000));
    await expect(recaudado(detalle)).toHaveText(importe(6000, { solo: true }));

    // R7 de la 38: la evidencia de la rechazada abre por URL firmada y la imagen CARGA (bytes del doble).
    // SLT-101: las gestiones van en la lista única con su filtro por resultado; la fila se despliega.
    const ordenes = await ordenesDe(detalle);
    await filtro(detalle, /^Devolución a origen por rechazo \(\d+\)$/).click();
    await ordenes.getByRole("button", { name: new RegExp(rechazada.numRemision), expanded: false }).click();
    await detalle.getByRole("button", { name: `Ver evidencia de la orden ${rechazada.numRemision} · ${rechazada.destinatario}` }).click();
    const visor = page.getByRole("dialog", { name: "Evidencia de la gestión" });
    const foto = visor.getByRole("img", { name: "Evidencia fotográfica de la gestión" });
    await expect(foto).toBeVisible();
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await visor.getByRole("button", { name: "Cerrar" }).click();

    // SLT-100: con un paquete que vuelve, el pie del detalle único lo dice en el rótulo (R12 de SLT-95).
    await detalle.getByRole("button", { name: "Revisar paquetes y aprobar", exact: true }).click();
    // Feature 238: el paquete que vuelve se confirma con su guía antes de aprobar.
    const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
    const aprobar = confirmar.getByRole("button", { name: "Confirmar y aprobar" });
    await expect(aprobar).toBeDisabled();
    const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
    await lector.getByLabel("Número de guía").fill(String(rechazada.numGuia));
    await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(aprobar).toBeEnabled();
    await aprobar.click();

    await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
    // El detalle se cierra. Hasta SLT-123 el efectivo (6.000) cubría la ganancia del mensajero y no se
    // ofrecía registrar un pago (feature 172/R16). Desde SLT-123 «Pago al mensajero independiente del
    // efectivo» (R315, R321) el pago no sale del efectivo: se ofrece pagar la ganancia entera, 1.500
    // (la entrega a la tarifa por defecto del escenario; el rechazo no paga).
    const oferta = page.getByRole("dialog", { name: `Registrar pago a ${m.nombre}` });
    await expect(oferta.getByText("Disponible:")).toContainText(importe(1500));
    await oferta.getByRole("button", { name: "Ahora no" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const resuelto = await verResueltos(page, m);
    await expect(resuelto.getByText("Aprobado", { exact: true })).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado])).toEqual([[cierreId, "aprobado"]]);
  });

  test("(b) Rechazar exige motivo → con motivo pasa a «Rechazado» con el motivo guardado", async ({ browser }) => {
    const { m, cierreId } = await conCierreSolicitado([2500], 0);
    const page = await paginaDe(browser, r.empresa.maestro);
    const detalle = await abrirDetalle(page, m);
    await expect(recaudado(detalle)).toHaveText(importe(2500, { solo: true }));

    await detalle.getByRole("button", { name: "Rechazar", exact: true }).click();
    const rechazo = page.getByRole("dialog", { name: "Rechazar cierre" });
    await rechazo.getByRole("button", { name: "Rechazar cierre" }).click();
    await expect(rechazo.getByText("El motivo de rechazo es obligatorio.")).toBeVisible();
    expect((await cierresDe(m))[0].estado).toBe("solicitado");

    await rechazo.getByLabel("Motivo del rechazo").fill("Los montos no cuadran");
    await rechazo.getByRole("button", { name: "Rechazar cierre" }).click();
    await expect(page.getByText("Cierre rechazado correctamente.")).toBeVisible();

    const resuelto = await verResueltos(page, m);
    await expect(resuelto.getByText("Rechazado", { exact: true })).toBeVisible();
    expect((await cierresDe(m)).map((c) => [c.id, c.estado, c.motivoRechazo])).toEqual([
      [cierreId, "rechazado", "Los montos no cuadran"],
    ]);
  });
});

/**
 * SLT-64 (B2 de la revisión) — CORREGIR EL RESULTADO DE UNA ENTREGA, con la respuesta de la acción que
 * ahora trae la página renderizada (`{ expire: 0 }`). Empresa propia: las cifras de Analítica son
 * exactas y los casos de arriba no entran en ellas. La primera visita a `/analitica` deja la entrada
 * en la caché, y la segunda es la primera lectura tras invalidar.
 */
test.describe("Cierres del día — corregir el resultado mueve Analítica en la primera lectura", () => {
  let propio: RepartoE2E;

  test.beforeAll(async () => {
    propio = await crearEscenarioReparto("cierres-corregir");
  });

  async function verCifras(page: Page, entregado: string, cerradas: string) {
    await page.goto("/analitica");
    // La frase de desenlaces y no la tarjeta: la cifra de la tarjeta se anima desde 0, así que al
    // subir a 2 pasa por el 1 y esta espera daría por buena la cifra vieja (medido con `"max"`).
    await expect(page.locator("p", { hasText: new RegExp(`^Entregado: ${entregado}( ·|$)`) })).toBeVisible();
    await expect(page.getByText(`(${cerradas} órdenes cerradas)`, { exact: false })).toBeVisible();
  }

  test("(c) el diálogo y el detalle siguen vivos tras la respuesta, y «Entregado» baja a la primera", async ({ browser }) => {
    const m = await crearMensajero(propio, "central");
    const queda = await llevarA(propio, await crearOrden(propio, { zona: "central", montoCobrar: 6000 }), "en_reparto", { mensajero: m });
    const corregida = await llevarA(propio, await crearOrden(propio, { zona: "central", montoCobrar: 2500 }), "en_reparto", { mensajero: m });
    await gestionar(propio, queda, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 6000 }] });
    await gestionar(propio, corregida, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 2500 }] });
    await solicitarCierre(propio, m);

    const page = await paginaDe(browser, propio.empresa.maestro);
    await verCifras(page, "2", "2");

    const detalle = await abrirDetalle(page, m);
    await expect(recaudado(detalle)).toHaveText(importe(8500, { solo: true }));
    const ordenes = await ordenesDe(detalle);
    await filtro(detalle, /^Entregado \(\d+\)$/).click();
    await ordenes.getByRole("button", { name: new RegExp(corregida.numRemision), expanded: false }).click();
    await detalle.getByRole("button", { name: `Corregir el resultado de la orden ${corregida.numRemision} · ${corregida.destinatario}` }).click();

    const dialogo = page.getByRole("dialog", { name: "Corregir el resultado de la entrega" });
    await dialogo.getByLabel("Motivo de la corrección").fill("La entrega nunca ocurrió");
    await dialogo.getByRole("button", { name: /^Marcar como / }).click();

    // El diálogo no se cierra: enseña los totales que devolvió el servidor, ya sin los 2.500.
    await expect(page.getByText(/^Resultado corregido: la entrega pasó a /)).toBeVisible();
    const tras = dialogo.getByRole("region", { name: "Totales del cierre tras la corrección" });
    await expect(tras.getByText("Total general", { exact: true }).locator("xpath=ancestor::div[1]")).toContainText(importe(6000));
    await dialogo.getByRole("button", { name: "Cerrar" }).last().click();
    await expect(dialogo).toHaveCount(0);

    // Y el detalle de detrás sigue abierto, releído del servidor.
    await expect(detalle).toBeVisible();
    await expect(recaudado(detalle)).toHaveText(importe(6000, { solo: true }));
    await filtro(detalle, /^Devolución a origen por rechazo \(\d+\)$/).click();
    await expect(ordenes.getByRole("button", { name: new RegExp(corregida.numRemision) })).toBeVisible();

    // R13: la primera lectura tras responder trae la cifra nueva. R8: sigue cerrada, así que el rótulo no baja.
    await verCifras(page, "1", "2");
  });
});
