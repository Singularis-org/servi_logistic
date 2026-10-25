import path from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  llevarA,
  mananaDeLaApp,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — «Mis asignaciones», el portal del mensajero (features 36, 96, 98, 113, 213; SL-44 T5.2, R18).
 *
 * Reescrito contra la UI ACTUAL:
 *  - RECOGER es por número de guía (o escáner) desde «Recoger paquete» en `/mis-asignaciones/recoger`
 *    (feature 96; ya no hay «Recoger» por fila ni modal de confirmación);
 *  - GESTIONAR es un panel EN LÍNEA en `/mis-asignaciones/reparto` (feature 113): «Gestionar esta
 *    orden» abre la verificación de la guía (feature 98), y el resultado se elige con BOTONES
 *    («Entregar», «Rechazar», «Reprogramar»), no con un select;
 *  - el cobro es un desglose por líneas (feature 213): «Método de pago línea N» + «Monto línea N».
 *
 * Casos:
 *  (a) recoger → Entregar, un método (el monto viene puesto) + foto → gestión `entregado`;
 *  (b) recoger → Rechazar + foto + motivo → gestión `devolucion_a_origen_por_rechazo`;
 *  (c) recoger → Reprogramar (mañana) + motivo → gestión `reprogramado`;
 *  (d) recoger → Entregar MIXTO, 8.000 = 5.000 efectivo + 3.000 transferencia → en `/cierre-dia`
 *      «Totales del día» dice Efectivo 5.000 y Transferencia 3.000 (feature 213/R35: lo capturado
 *      aquí ES la `E` del `min(P, E)` con que se paga al mensajero).
 *
 * Desde la ficha 454 la gestión NO cambia el estado de la orden (lo cambia la aprobación del
 * cierre): la orden sigue `en_reparto` con su gestión pendiente, y eso también se comprueba.
 *
 * DATOS (R7, R8): empresa nueva; cada caso con SU mensajero y SU orden, llevada hasta
 * `mensajero_recogiendo_en_bodega` por los servicios reales. La foto es `e2e/fixtures/evidencia.jpg`
 * y la recibe el doble de Storage (D2). Los importes son los de la orden que crea cada caso.
 */

const EVIDENCIA = path.join(__dirname, "fixtures", "evidencia.jpg");
// El panel pide la ubicación al guardar (feature 193): el mensajero la concede.
const CONTEXTO_MENSAJERO = { geolocation: { latitude: 9.9281, longitude: -84.0907 }, permissions: ["geolocation"] };
// El símbolo y los separadores salen de configuración (`lib/config/moneda.ts`): separador tolerante.
const monto = (miles: number): RegExp => new RegExp(`${miles}[.,\\s\\u00a0\\u202f]?000(?!\\d)`);

let r: RepartoE2E;

async function prepararCaso(montoCobrar: number): Promise<{ m: MensajeroE2E; orden: OrdenE2E }> {
  const m = await crearMensajero(r, "satelite");
  const orden = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar }), "mensajero_recogiendo_en_bodega", {
    mensajero: m,
  });
  return { m, orden };
}

/** Recoge la orden por su guía y abre su gestión en el panel en línea, ya verificada. */
async function recogerYAbrirGestion(browser: Browser, m: MensajeroE2E, orden: OrdenE2E): Promise<{ page: Page; panel: ReturnType<Page["getByRole"]> }> {
  const page = await paginaDe(browser, m, CONTEXTO_MENSAJERO);
  await page.goto("/mis-asignaciones/recoger");
  await expect(page.getByRole("region", { name: "Recoger en bodega" }).getByText(orden.numRemision).first()).toBeVisible();
  await page.getByRole("button", { name: "Recoger paquete" }).click();
  const tarjeta = page.getByRole("region", { name: "Recoger por número de guía o escaneo" });
  await tarjeta.getByLabel("Número de guía").fill(String(orden.numGuia));
  await tarjeta.getByRole("button", { name: "Recoger", exact: true }).click();
  await expect(page.getByText(`Guía ${orden.numGuia} recogida.`, { exact: true })).toBeVisible();
  await expect.poll(() => estadoDe(orden)).toBe("en_reparto");

  await page.goto("/mis-asignaciones/reparto");
  const panel = page.getByRole("region", { name: "Detalle de la orden" });
  await expect(panel.getByText(`Guía ${orden.numGuia}`).first()).toBeVisible();
  await panel.getByRole("button", { name: "Gestionar esta orden" }).click();
  const gate = panel.getByRole("region", { name: "Verificar la guía del paquete antes de gestionar" });
  await gate.getByLabel("Número de guía").fill(String(orden.numGuia));
  await gate.getByRole("button", { name: "Gestionar", exact: true }).click();
  await expect(panel.getByText("¿Cómo terminó la gestión?")).toBeVisible();
  return { page, panel };
}

async function elegir(page: Page, combobox: string, opcion: string): Promise<void> {
  await page.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

async function gestionVigente(orden: OrdenE2E) {
  return baseReparto().gestionOrden.findFirst({
    where: { ordenId: orden.id, anuladaAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      resultado: true,
      motivo: true,
      fechaReprogramacion: true,
      montoRecibido: true,
      evidencias: { select: { contentType: true } },
      pagos: { select: { metodo: true, monto: true } },
    },
  });
}

test.describe("Mis asignaciones — recoger y gestionar", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("mis-asignaciones");
  });

  test("(a) recoger por guía → Entregar con un método y foto", async ({ browser }) => {
    const { m, orden } = await prepararCaso(4000);
    const { page, panel } = await recogerYAbrirGestion(browser, m, orden);

    await panel.getByRole("button", { name: "Entregar", exact: true }).click();
    // Una línea, con el monto a cobrar ya puesto: solo se elige el método.
    await expect(page.getByLabel("Monto línea 1")).toHaveValue("4000");
    await elegir(page, "Método de pago línea 1", "Efectivo");
    await page.getByLabel("Foto de evidencia de entrega", { exact: true }).setInputFiles(EVIDENCIA);
    await panel.getByRole("button", { name: "Guardar gestión" }).click();

    await expect(page.getByText(`Orden ${orden.numRemision}: Entregado.`)).toBeVisible();
    const g = await gestionVigente(orden);
    expect(g?.resultado).toBe("entregado");
    expect(g?.montoRecibido?.toString()).toBe("4000");
    expect(g?.pagos.map((p) => [p.metodo, p.monto.toString()])).toEqual([["efectivo", "4000"]]);
    expect(g?.evidencias).toEqual([{ contentType: "image/jpeg" }]);
    // 454: la orden espera al cierre en reparto, con la gestión pendiente.
    expect(await estadoDe(orden)).toBe("en_reparto");
  });

  test("(b) recoger por guía → Rechazar con foto y motivo", async ({ browser }) => {
    const { m, orden } = await prepararCaso(0);
    const { page, panel } = await recogerYAbrirGestion(browser, m, orden);

    await panel.getByRole("button", { name: "Rechazar", exact: true }).click();
    await page.getByLabel("Foto de evidencia del rechazo", { exact: true }).setInputFiles(EVIDENCIA);
    await panel.getByLabel("Motivo").fill("Dirección inexistente");
    await panel.getByRole("button", { name: "Guardar gestión" }).click();

    await expect(page.getByText(`Orden ${orden.numRemision}: Devolución a origen por rechazo.`)).toBeVisible();
    const g = await gestionVigente(orden);
    expect(g?.resultado).toBe("devolucion_a_origen_por_rechazo");
    expect(g?.motivo).toBe("Dirección inexistente");
    expect(g?.evidencias).toEqual([{ contentType: "image/jpeg" }]);
    expect(await estadoDe(orden)).toBe("en_reparto");
  });

  test("(c) recoger por guía → Reprogramar para mañana con motivo", async ({ browser }) => {
    const { m, orden } = await prepararCaso(0);
    const { page, panel } = await recogerYAbrirGestion(browser, m, orden);

    await panel.getByRole("button", { name: "Reprogramar", exact: true }).click();
    const fecha = panel.getByLabel("Nueva fecha de reprogramación");
    await fecha.fill(mananaDeLaApp());
    await panel.getByLabel("Motivo").fill("Cliente ausente");
    await panel.getByRole("button", { name: "Guardar gestión" }).click();

    await expect(page.getByText(`Orden ${orden.numRemision}: Reprogramado.`)).toBeVisible();
    const g = await gestionVigente(orden);
    expect(g?.resultado).toBe("reprogramado");
    expect(g?.motivo).toBe("Cliente ausente");
    expect(g?.fechaReprogramacion?.toISOString().slice(0, 10)).toBe(mananaDeLaApp());
    expect(await estadoDe(orden)).toBe("en_reparto");
  });

  test("(d) entrega MIXTA 8.000 = 5.000 efectivo + 3.000 transferencia → totales del cierre", async ({ browser }) => {
    const { m, orden } = await prepararCaso(8000);
    const { page, panel } = await recogerYAbrirGestion(browser, m, orden);

    await panel.getByRole("button", { name: "Entregar", exact: true }).click();
    // La línea 1 nace con los 8.000; el caso mixto es corregirla a lo que se pagó en efectivo.
    await elegir(page, "Método de pago línea 1", "Efectivo");
    await page.getByLabel("Monto línea 1").fill("5000");
    // La línea nueva nace con lo PENDIENTE (3.000); se teclea igual para no depender del prefill.
    await panel.getByRole("button", { name: "Añadir método" }).click();
    await elegir(page, "Método de pago línea 2", "Transferencia");
    await page.getByLabel("Monto línea 2").fill("3000");

    const resumen = panel.getByLabel("Resumen del cobro");
    await expect(resumen).toContainText(monto(8));

    await page.getByLabel("Foto de evidencia de entrega", { exact: true }).setInputFiles(EVIDENCIA);
    await panel.getByRole("button", { name: "Guardar gestión" }).click();
    await expect(page.getByText(`Orden ${orden.numRemision}: Entregado.`)).toBeVisible();

    // R35: los totales del día no se recalculan aquí, los ALIMENTA lo capturado arriba.
    await page.goto("/cierre-dia");
    const totales = page.getByRole("region", { name: "Totales del día" });
    await expect(totales).toBeVisible();
    // Cada total es una pareja rótulo/importe (`TotalItem`): el contenedor del rótulo exacto.
    const efectivo = totales.getByText("Efectivo", { exact: true }).locator("..");
    const transferencia = totales.getByText("Transferencia", { exact: true }).locator("..");
    await expect(efectivo).toContainText(monto(5));
    await expect(efectivo).not.toContainText(monto(8));
    await expect(transferencia).toContainText(monto(3));
  });
});
