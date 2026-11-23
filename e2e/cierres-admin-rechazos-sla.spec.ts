import { expect, test } from "@playwright/test";

import {
  anclarDevolucionHaceDias,
  aprobarCierre,
  cierresDe,
  filaDeCola,
  importe,
  solicitarCierre,
} from "./_escenarios/cierres";
import { correrCron } from "./_escenarios/crons";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  gestionesDe,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — El ingreso de la bodega por devoluciones a origen, partido por su ORIGEN (features 56, 99
 * y 102; SL-44 T6.1, R18).
 *
 * El maestro abre un cierre cuyas rechazadas vienen de los dos orígenes —una escalada por el cron
 * del SLA de devoluciones (`procesar-devueltas-sla`) y dos rechazos del mensajero— y ve:
 *  - la tarjeta «Ingreso de bodega por devoluciones a origen» con el total y sus dos subtotales,
 *    «Automático (por plazo vencido)» y «Manual (mensajero)» (R8 de la 102);
 *  - cada fila rechazada marcada con su origen: «Automático» la del cron, «Manual» las otras (R9).
 *
 * DATOS (R7, R8): empresa nueva, zona central, tarifa del mensajero 900 por rechazo. Una orden se
 * devuelve con causa «dirección equivocada» (gestión `novedad`) y su cierre se APRUEBA (la orden
 * queda en `novedad`, anclada); el cron real la escala a «Devolución a origen por rechazo» con una
 * gestión sintética del mensajero. Después el mensajero rechaza otras dos órdenes y solicita el
 * cierre (`CierreDiaService`). Cifras a mano: SLA 1 × 900 = 900; manual 2 × 900 = 1.800; total 2.700.
 *
 * ⚠️ EXCEPCIÓN DE R8 (design D4): el plazo de 5 días de una `wrong_*` no se puede esperar ni lo fija
 * ningún servicio, así que `anclarDevolucionHaceDias` mueve 6 días al pasado la fecha de la fila
 * `anclaje_devolucion` que escribió la aprobación. Solo esa fecha; el escalado lo hace el cron.
 */

const TARIFA_MENSAJERO = { cobroEntregado: 1500, cobroRechazado: 900 };

let r: RepartoE2E;
let m: MensajeroE2E;
let sla: OrdenE2E;
const manuales: OrdenE2E[] = [];
let cierreId: string;

test.describe("Cierres del día — el ingreso por rechazos separa SLA y manual", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("rechazos-sla", { tarifaMensajero: TARIFA_MENSAJERO });
    m = await crearMensajero(r, "central");

    // 1) La devolución anclada que el cron escala.
    sla = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, sla, m, { resultado: "novedad", causa: "wrong_address", motivo: "La dirección no existe" });
    await aprobarCierre(r, await solicitarCierre(r, m));
    expect(await estadoDe(sla)).toBe("novedad");
    await anclarDevolucionHaceDias(r, sla, 6);
    await correrCron("procesar-devueltas-sla");
    expect(await estadoDe(sla)).toBe("devolucion_a_origen_por_rechazo");
    const sintetica = (await gestionesDe(sla)).filter((g) => g.resultado === "devolucion_a_origen_por_rechazo");
    expect(sintetica.map((g) => g.cierreId)).toEqual([null]);

    // 2) Dos rechazos del mensajero, en el mismo día.
    for (let i = 1; i <= 2; i++) {
      const o = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
      await gestionar(r, o, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: `Rechazo manual ${i}` });
      manuales.push(o);
    }
    cierreId = await solicitarCierre(r, m);
  });

  test("R8/R9: subtotal automático 900 y manual 1.800 de 2.700, y cada fila con su origen", async ({ browser }) => {
    const [, segundo] = await cierresDe(m);
    expect([segundo.id, segundo.estado, String(segundo.totalIngresoBodegaRechazos)]).toEqual([cierreId, "solicitado", "2700"]);

    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/cierres-admin");
    const comprobante = filaDeCola(page.getByRole("region", { name: "Pendientes de decisión" }), m.nombre);
    await comprobante.getByRole("button", { name: "Ver / decidir" }).click();
    const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });

    // SLT-100 (R81): la tarjeta pasó a la línea «− pago a la bodega» de la cuenta del detalle único, con el
    // desglose por origen como nota debajo. Mismos importes.
    const ingreso = detalle
      .getByRole("region", { name: "De lo facturado, le queda a la empresa" })
      .locator("[data-signo]")
      .filter({ hasText: "− Ingreso de bodega por devoluciones a origen" });
    await expect(ingreso.locator("[data-monto]")).toHaveText(importe(2700, { solo: true }));
    await expect(ingreso).toContainText(/Automático \(por plazo vencido\) ₡900 · Manual \(mensajero\) ₡1\.800/);

    await detalle.getByRole("tab", { name: /^Gestiones \(/ }).click();
    // SLT-101 «Fila de gestión única y lista con filtros» (R84): la pestaña por resultado pasa a ser el filtro
    // «Filtrar por resultado», y la región por resultado, la lista «Órdenes del cierre».
    await detalle
      .getByRole("group", { name: "Filtrar por resultado" })
      .getByRole("button", { name: /^Devolución a origen por rechazo \(\d+\)$/ })
      .click();
    const rechazadas = detalle.getByRole("region", { name: "Órdenes del cierre" });
    // El `has` se busca DENTRO de cada fila: va desde `page`, no desde la región.
    const boton = (o: OrdenE2E) =>
      page.getByRole("button", { name: new RegExp(`^(Desglose de ingreso|Detalle) de la orden ${o.numRemision} · `) });
    // La fila entera (cerrada y, si se despliega, su bloque) es el contenedor `data-gestion` de su botón.
    const fila = (o: OrdenE2E) => rechazadas.locator("[data-gestion]").filter({ has: boton(o) });
    await expect(rechazadas.locator("[data-gestion]")).toHaveCount(3);
    // SLT-101 (R24, R85): ANTES cada fila desplegada traía el badge «Automático» o «Manual»; AHORA el origen es
    // la SEÑAL de la fila cerrada, como dibuja el canvas: «Rechazo automático» en la del cron y ninguna marca de
    // origen en las del mensajero (las tres vuelven a bodega).
    await expect(fila(sla).getByText("Vuelve a bodega · Rechazo automático", { exact: true })).toBeVisible();
    for (const o of manuales) {
      await expect(fila(o).getByText("Vuelve a bodega", { exact: true })).toBeVisible();
      await expect(fila(o).getByText(/Rechazo automático/)).toHaveCount(0);
    }
  });
});
