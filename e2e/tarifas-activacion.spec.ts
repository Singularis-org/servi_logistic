import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { crearUsuarioE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

import { aprobarCierre, importe, solicitarCierre } from "./_escenarios/cierres";
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
import {
  abrirTarifas,
  activacionesDe,
  activarConFaltantes,
  cifraAsentada,
  congeladoDelCierre,
  digitarYGuardar,
  elegirNivel,
  elegirOpcion,
  filaDe,
  irAPestana,
  irAZona,
  panelDe,
  valoresDe,
  zonasDe,
  type Digitado,
} from "./_tarifas-activacion-fixture";

/**
 * SLT-54 R67, R68, R40, R55 — digitar no cambia nada hasta activar, y activar solo cambia lo siguiente.
 *
 * DATOS: empresa nueva, por los servicios reales. Un mensajero de la zona satélite por cierre: una entrega de
 * 10.000 en efectivo y un rechazo. La satélite es la que deja ver los tres actores a la vez.
 *
 * CIFRAS, a mano:
 *                               Modelo viejo        Digitado
 *   Flete por entregado         2.500 + 13 %        3.100 + 13 %   → cobra 2.825 / 3.503
 *   Flete por devolución        1.250 + 13 %        1.400 + 13 %   → cobra 1.412,50 / 1.582
 *   Total de la empresa                                            → 4.237,50 / 5.085
 *   Pago al mensajero, entrega  1.700               2.200
 *   Pago a la satélite, entrega no paga             120
 *   Pago a la satélite, rechazo 300                 450            → satélite 300 / 570
 *
 * El viejo no paga a la satélite por una entrega y el nuevo sí: por eso el total de la satélite distingue los
 * dos modelos también por su composición, no solo por su importe.
 */

// La columna GAM igual: con otra, la referencia de «todas sus zonas» diría «Varía» (R23).
const TARIFA_VIEJA = { valorFlete: 2500, valorFleteGam: 2500, valorFleteDevuelto: 1250, valorFleteDevueltoGam: 1250, ivaFlete: 13 };
const PAGO_VIEJO = { cobroEntregado: 1700, cobroRechazado: 300 };

const COBRO_NUEVO: readonly Digitado[] = [
  { concepto: "Flete por entregado", valor: "3100", iva: "13" },
  { concepto: "Flete por devolución a origen", valor: "1400", iva: "13" },
];
const PAGO_NUEVO_MENSAJERO: readonly Digitado[] = [{ concepto: "Por entregado", valor: "2200" }];
const PAGO_NUEVO_SATELITE: readonly Digitado[] = [
  { concepto: "Por entregado", valor: "120" },
  { concepto: "Por devolución a origen", valor: "450" },
];

/** Un cierre con una entrega de 10.000 y un rechazo, aprobado por la satélite. */
async function cierreAprobado(r: RepartoE2E): Promise<{ m: MensajeroE2E; cierreId: string }> {
  const m = await crearMensajero(r, "satelite");
  const entrega = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
  await gestionar(r, entrega, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10000 }] });
  const rechazo = await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_reparto", { mensajero: m });
  await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
  const cierreId = await solicitarCierre(r, m);
  await aprobarCierre(r, cierreId);
  return { m, cierreId };
}

/** Abre un cierre ya resuelto, como lo ve la satélite que lo aprobó. */
async function abrirResuelto(page: Page, m: MensajeroE2E): Promise<Locator> {
  await page.goto("/cierres-admin");
  await page.getByRole("group", { name: "Cierres del día por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
  const comprobante = page.getByRole("region", { name: "Histórico" }).getByRole("region", { name: `Comprobante del cierre de ${m.nombre}` });
  await comprobante.getByRole("button", { name: `Ver el cierre resuelto de ${m.nombre}` }).click();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await expect(detalle).toBeVisible();
  return detalle;
}

/** La columna de una tarjeta de cierre, que vive detrás de su desplegable. */
async function ajustesDeLaTarjeta(comprobante: Locator, m: MensajeroE2E): Promise<Locator> {
  await comprobante.getByRole("button", { name: `Ver detalles del cierre de ${m.nombre}` }).click();
  const ajustes = comprobante.getByRole("region", { name: "Ajustes" });
  await expect(ajustes).toBeVisible();
  return ajustes;
}

/** Despliega la única gestión de esa pestaña y devuelve su sección de cobros. */
async function cobrosDeLaGestion(detalle: Locator, pestana: RegExp): Promise<Locator> {
  const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
  await ordenes.getByRole("tab", { name: pestana }).click();
  await ordenes.getByRole("button", { expanded: false }).first().click();
  const cobros = ordenes.getByRole("region", { name: "Cobros de esta gestión" });
  await expect(cobros).toBeVisible();
  return cobros;
}

const renglon = (seccion: Locator, rotulo: string): Locator =>
  seccion.getByText(rotulo, { exact: true }).locator("xpath=ancestor::div[1]");

/**
 * Un KPI de la cabecera del comprobante, ya asentado: cuenta desde 0 al montar. El rótulo sale también en los
 * renglones de más abajo, sin animar: el KPI es el primero del comprobante.
 */
async function kpi(detalle: Locator, rotulo: string): Promise<string> {
  const cifra = detalle
    .getByRole("region", { name: /^Comprobante detallado del cierre/ })
    .locator(`xpath=.//span[normalize-space()='${rotulo}']/following-sibling::span[1]`)
    .first();
  return cifraAsentada(cifra);
}

test.use({ actionTimeout: 30_000 });

test.describe.serial("Tarifas — digitar, activar y cierre (R67)", () => {
  let r: RepartoE2E;
  let page: Page;
  let cierreViejo: { m: MensajeroE2E; cierreId: string };
  let cierreNuevo: { m: MensajeroE2E; cierreId: string };
  let congeladoViejo: Awaited<ReturnType<typeof congeladoDelCierre>>;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    test.setTimeout(240_000);
    r = await crearEscenarioReparto("tarifas-r67", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    page = await paginaDe(browser, r.empresa.maestro);
  });

  test("el maestro digita: la referencia se ve sin copiarse y nada queda activado", async () => {
    test.setTimeout(180_000);
    await abrirTarifas(page);
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("Borrador: aún rigen las tarifas actuales");
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("0 de 2 zonas completas");
    await irAZona(page, r.zonaSatelite.nombre);

    // R20: el mensajero muestra lo de hoy al lado, con el campo vacío.
    await irAPestana(page, "Pago al mensajero");
    await expect(filaDe(page, "Por entregado")).toContainText(importe(1700));
    await expect(panelDe(page).getByRole("textbox", { name: "Valor de Por entregado", exact: true })).toHaveValue("");
    await expect(filaDe(page, "Por devolución a origen")).toContainText("No paga");
    await irAPestana(page, "Pago a la satélite");
    await expect(filaDe(page, "Por devolución a origen")).toContainText(importe(300));
    await expect(filaDe(page, "Por entregado")).toContainText("No paga");

    // La tarifa vieja del escenario es de la tienda: se ve en su nivel, y no en la zona.
    await irAPestana(page, "Cobro a la tienda");
    await elegirNivel(page, "Tienda con precio propio…");
    await elegirOpcion(page, page.locator("#tarifas-tienda"), r.tienda.nombre);
    await elegirOpcion(page, page.locator("#tarifas-alcance"), "Todas sus zonas");
    await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
    await expect(filaDe(page, "Flete por entregado")).toContainText("+ 13 % IVA");
    await expect(filaDe(page, "Flete por entregado")).toContainText(importe(2500));
    await expect(panelDe(page).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true })).toHaveValue("");
    await expect(panelDe(page).getByRole("textbox", { name: "IVA de Flete por entregado", exact: true })).toHaveValue("");
    await elegirNivel(page, "Toda la zona");

    await digitarYGuardar(page, "Cobro a la tienda", COBRO_NUEVO);
    await digitarYGuardar(page, "Pago al mensajero", PAGO_NUEVO_MENSAJERO);
    await digitarYGuardar(page, "Pago a la satélite", PAGO_NUEVO_SATELITE);

    // R17: la satélite tiene sus tres esenciales; la central, ninguno.
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("1 de 2 zonas completas");
    await expect(zonasDe(page).getByRole("button", { name: new RegExp(r.zonaSatelite.nombre) })).toContainText("Completa");
    await expect(zonasDe(page).getByRole("button", { name: new RegExp(r.zonaCentral.nombre) })).toContainText("Sin empezar");

    // Lo digitado sobrevive a recargar la página.
    await abrirTarifas(page);
    await irAZona(page, r.zonaSatelite.nombre);
    await expect(panelDe(page).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true })).toHaveValue("3100");
    await expect(panelDe(page).getByRole("textbox", { name: "IVA de Flete por entregado", exact: true })).toHaveValue("13");

    expect(await activacionesDe(r.empresa.organizacionId)).toBe(0);
    expect(await valoresDe(r.empresa.organizacionId)).toEqual([
      "mensajero_entregado=2200",
      "satelite_entregado=120",
      "satelite_rechazo=450",
      "tienda_flete_entregado=3100",
      "tienda_flete_rechazo=1400",
    ]);
  });

  test("con lo digitado y sin activar, el cierre cobra y paga con el modelo viejo", async ({ browser }) => {
    test.setTimeout(240_000);
    cierreViejo = await cierreAprobado(r);
    congeladoViejo = await congeladoDelCierre(cierreViejo.cierreId);

    expect(congeladoViejo).toMatchObject({
      estado: "aprobado",
      totalGeneral: "10000",
      totalPagoMensajero: "1700",
      totalIngresoBodegaRechazos: "300",
    });
    expect(congeladoViejo.detalle.map((d) => [d.tarifaModelo, d.tarifaValorFlete, d.tarifaValorFleteDevuelto, d.tarifaIvaFlete, d.conceptos])).toEqual([
      ["viejo", "2500", "1250", "13", []],
      ["viejo", "2500", "1250", "13", []],
    ]);
    expect(congeladoViejo.gestiones.map((g) => [g.resultado, g.pagoMensajero, g.ingresoBodegaRechazo, g.pagosCongelados])).toEqual([
      ["entregado", "1700", "0", []],
      ["devolucion_a_origen_por_rechazo", "0", "300", []],
    ]);

    const satelite = await paginaDe(browser, r.adminSatelite);
    const detalle = await abrirResuelto(satelite, cierreViejo.m);
    expect(await kpi(detalle, "Pago al mensajero")).toMatch(importe(1700, { solo: true }));
    expect(await kpi(detalle, "Total de la empresa")).toMatch(/^\D*4\.237,50$/);
    await expect(detalle.getByText("Ingreso de bodega por devoluciones a origen", { exact: true }).last().locator("..")).toContainText(importe(300));
    const entrega = await cobrosDeLaGestion(detalle, /Entregado/);
    await expect(renglon(entrega, "Total cobrado")).toContainText(importe(2825));
    await satelite.context().close();
  });

  test("activar con faltantes pide la casilla y deja la empresa en vigor", async () => {
    await abrirTarifas(page);
    await page.getByRole("button", { name: "Activar tarifas nuevas", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Activar tarifas nuevas" });
    await expect(dialogo).toContainText("Falta por definir en 1 zona");
    await expect(dialogo).toContainText("Lo que falta se cobra y se paga en 0.");
    const zonaIncompleta = dialogo.getByRole("listitem").filter({ hasText: r.zonaCentral.nombre });
    await expect(zonaIncompleta).toContainText("Sin flete por entregado, sin flete por devolución a origen y sin pago al mensajero por entregado");
    await expect(dialogo.getByRole("listitem").filter({ hasText: r.zonaSatelite.nombre })).toHaveCount(0);

    // Seguir digitando no activa nada.
    await dialogo.getByRole("button", { name: "Seguir digitando", exact: true }).click();
    await expect(dialogo).toHaveCount(0);
    expect(await activacionesDe(r.empresa.organizacionId)).toBe(0);

    await activarConFaltantes(page);
    expect(await activacionesDe(r.empresa.organizacionId)).toBe(1);

    // R40: sin banda ni «Hoy rige», y la pantalla sigue editable. R8: sin nada que vuelva atrás.
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: "Hoy rige", exact: true })).toHaveCount(0);
    await expect(page.getByText("Cada cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.")).toBeVisible();
    await expect(page.getByRole("button", { name: /desactivar|volver atr/i })).toHaveCount(0);
  });

  test("el siguiente cierre cobra y paga con lo digitado, y el anterior no cambia", async ({ browser }) => {
    test.setTimeout(240_000);
    cierreNuevo = await cierreAprobado(r);
    const nuevo = await congeladoDelCierre(cierreNuevo.cierreId);

    expect(nuevo).toMatchObject({
      estado: "aprobado",
      totalGeneral: "10000",
      totalPagoMensajero: "2200",
      totalIngresoBodegaRechazos: "570",
    });
    expect(nuevo.detalle.map((d) => [d.tarifaModelo, d.tarifaValorFlete, d.tarifaValorFleteDevuelto])).toEqual([
      ["nuevo", null, null],
      ["nuevo", null, null],
    ]);
    const conceptos = new Set(nuevo.detalle.flatMap((d) => d.conceptos.map((c) => `${c.concepto}=${c.valor}+${c.ivaPct}`)));
    expect([...conceptos].sort()).toEqual(["tienda_flete_entregado=3100+13", "tienda_flete_rechazo=1400+13"]);
    expect(nuevo.gestiones.map((g) => [g.resultado, g.pagoMensajero, g.ingresoBodegaRechazo])).toEqual([
      ["entregado", "2200", "120"],
      ["devolucion_a_origen_por_rechazo", "0", "450"],
    ]);

    // El cierre de antes de activar sigue igual, fila a fila, en la base y en pantalla.
    expect(await congeladoDelCierre(cierreViejo.cierreId)).toEqual(congeladoViejo);

    const satelite = await paginaDe(browser, r.adminSatelite);
    const detalleNuevo = await abrirResuelto(satelite, cierreNuevo.m);
    expect(await kpi(detalleNuevo, "Pago al mensajero")).toMatch(importe(2200, { solo: true }));
    expect(await kpi(detalleNuevo, "Total de la empresa")).toMatch(importe(5085, { solo: true }));
    const entregaNueva = await cobrosDeLaGestion(detalleNuevo, /Entregado/);
    await expect(renglon(entregaNueva, "Total cobrado")).toContainText(importe(3503));
    await expect(entregaNueva).not.toContainText("no tenía tarifa");
    // R71: el total nombra lo que suma, sin partirlo por origen, y las filas llegan a él: 120 + 450 = 570.
    await expect(detalleNuevo.getByText("Ingreso de bodega", { exact: true }).last().locator("..")).toContainText(importe(570));
    await expect(detalleNuevo.getByText("Ingreso de bodega por devoluciones a origen", { exact: true })).toHaveCount(0);
    await expect(detalleNuevo.getByText("Automático (por plazo vencido)", { exact: true })).toHaveCount(0);
    await expect(detalleNuevo.getByText("Manual (mensajero)", { exact: true })).toHaveCount(0);
    const ingresoDeFila = detalleNuevo.getByRole("region", { name: "Órdenes del cierre" }).getByText("Ingreso de bodega:", { exact: true }).locator("..");
    await expect(ingresoDeFila).toContainText(importe(120));
    await cobrosDeLaGestion(detalleNuevo, /Devoluci/);
    await expect(ingresoDeFila).toContainText(importe(450));
    await detalleNuevo.getByRole("button", { name: "Cerrar", exact: true }).last().click();
    await expect(detalleNuevo).toHaveCount(0);

    const detalleViejo = await abrirResuelto(satelite, cierreViejo.m);
    expect(await kpi(detalleViejo, "Pago al mensajero")).toMatch(importe(1700, { solo: true }));
    expect(await kpi(detalleViejo, "Total de la empresa")).toMatch(/^\D*4\.237,50$/);
    const entregaVieja = await cobrosDeLaGestion(detalleViejo, /Entregado/);
    await expect(renglon(entregaVieja, "Total cobrado")).toContainText(importe(2825));
    // R71: el cierre de antes de activar se sigue leyendo con su rótulo y sus sublíneas.
    await expect(detalleViejo.getByText("Ingreso de bodega por devoluciones a origen", { exact: true }).last().locator("..")).toContainText(importe(300));
    await expect(detalleViejo.getByText("Ingreso de bodega", { exact: true })).toHaveCount(0);
    await expect(detalleViejo.getByText("Manual (mensajero)", { exact: true })).toBeVisible();
    await expect(detalleViejo.getByRole("region", { name: "Órdenes del cierre" }).getByText("Ingreso de bodega:", { exact: true })).toHaveCount(0);
    await detalleViejo.getByRole("button", { name: "Cerrar", exact: true }).last().click();
    await expect(detalleViejo).toHaveCount(0);

    // R71: la tarjeta del listado dice lo mismo que su detalle, cada una con su cierre.
    const historico = satelite.getByRole("region", { name: "Histórico" });
    const tarjetaNueva = await ajustesDeLaTarjeta(historico.getByRole("region", { name: `Comprobante del cierre de ${cierreNuevo.m.nombre}` }), cierreNuevo.m);
    await expect(tarjetaNueva.getByText("Ingreso de bodega", { exact: true }).locator("..")).toContainText(importe(570));
    await expect(tarjetaNueva).not.toContainText("devoluciones a origen");
    const tarjetaVieja = await ajustesDeLaTarjeta(historico.getByRole("region", { name: `Comprobante del cierre de ${cierreViejo.m.nombre}` }), cierreViejo.m);
    await expect(tarjetaVieja.getByText("Ingreso de bodega por devoluciones a origen", { exact: true }).locator("..")).toContainText(importe(300));

    // R71: la consolidación junta los dos cierres, así que el total se lee como nuevo sobre 300 + 570.
    await satelite.goto("/cierres-admin");
    await satelite.getByRole("group", { name: "Tipo de cierre" }).getByRole("button", { name: "Bodega" }).click();
    const bodega = satelite.getByRole("region", { name: "Cierre de bodega" });
    await expect(bodega.getByRole("region", { name: "Ingreso de bodega a consolidar", exact: true })).toContainText(importe(870));
    await expect(bodega.getByRole("region", { name: "Ingreso de bodega por devoluciones a origen a consolidar" })).toHaveCount(0);
    const aConsolidar = bodega.getByRole("region", { name: "Cierres del día a consolidar" });
    const consolidableNuevo = await ajustesDeLaTarjeta(aConsolidar.getByRole("region", { name: `Comprobante del cierre de ${cierreNuevo.m.nombre}` }), cierreNuevo.m);
    await expect(consolidableNuevo.getByText("Ingreso de bodega", { exact: true })).toBeVisible();
    const consolidableViejo = await ajustesDeLaTarjeta(aConsolidar.getByRole("region", { name: `Comprobante del cierre de ${cierreViejo.m.nombre}` }), cierreViejo.m);
    await expect(consolidableViejo.getByText("Ingreso de bodega por devoluciones a origen", { exact: true })).toBeVisible();
    await satelite.context().close();
  });

  test("corregir tras activar avisa de que aplica al siguiente cierre y no mueve los hechos", async () => {
    await abrirTarifas(page);
    await irAZona(page, r.zonaSatelite.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por entregado", valor: "3300" }], "Guardar cambios");
    await expect(page.getByText("Guardado. El cambio aplica desde el siguiente cierre; los cierres ya hechos no cambian.")).toBeVisible();
    expect(await congeladoDelCierre(cierreViejo.cierreId)).toEqual(congeladoViejo);
    expect((await congeladoDelCierre(cierreNuevo.cierreId)).totalPagoMensajero).toBe("2200");
    expect(await activacionesDe(r.empresa.organizacionId)).toBe(1);
  });

  // R71, D38: el flete de un reprogramado cae en la categoría de la devolución, y no hubo devolución alguna. En la
  // zona central, porque el cierre de una satélite no entra en esos libros hasta consolidarse.
  test("un reprogramado del modelo nuevo no se lee como devolución, ni en la tienda ni en la caja", async ({ browser }) => {
    test.setTimeout(300_000);
    await abrirTarifas(page);
    await irAZona(page, r.zonaCentral.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por reprogramado", valor: "250", iva: "13" }], "Guardar cambios");
    const m = await crearMensajero(r, "central");
    const orden = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
    await gestionar(r, orden, m, { resultado: "reprogramado" });
    await aprobarCierre(r, await solicitarCierre(r, m));

    const tienda = await paginaDe(browser, r.tienda);
    await tienda.goto("/mi-wallet");
    const cuenta = tienda.getByRole("table", { name: `Estado de cuenta de ${r.tienda.nombre}` });
    await expect(cuenta.getByRole("row").filter({ hasText: "La empresa te cobró el flete de gestiones no entregadas" })).toContainText(importe(250));
    await expect(cuenta.getByRole("row").filter({ hasText: "La empresa te cobró el IVA del flete de gestiones no entregadas" })).toContainText("32,50");
    await expect(cuenta).not.toContainText("devolución a origen");
    await tienda.context().close();

    await page.goto("/wallet");
    const libro = page.getByRole("table", { name: "Libro de movimientos" });
    await expect(libro.getByRole("row").filter({ hasText: "Flete de gestiones no entregadas cobrado a la tienda" }).filter({ hasNotText: "IVA del" })).toContainText(importe(250));
    await expect(libro.getByRole("row").filter({ hasText: "IVA del flete de gestiones no entregadas cobrado a la tienda" })).toContainText("32,50");
    await expect(libro).not.toContainText("devolución a origen");
  });
});

test.describe.serial("Tarifas — dos empresas y permisos (R68, R55)", () => {
  let a: RepartoE2E;
  let b: RepartoE2E;
  let adminDeA: UsuarioE2E;
  const GRUPO_DE_A = "Grupo solo de A";

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    a = await crearEscenarioReparto("tarifas-r68-a", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    b = await crearEscenarioReparto("tarifas-r68-b", { tarifa: { ...TARIFA_VIEJA, valorFlete: 2600 }, tarifaMensajero: PAGO_VIEJO });
    adminDeA = await crearUsuarioE2E(a.empresa, "admin");
  });

  /** Lo que ve el maestro de B: nada de A, con la empresa sin activar. */
  async function bNoVeNadaDeA(browser: Browser): Promise<void> {
    const page = await paginaDe(browser, b.empresa.maestro);
    await abrirTarifas(page);
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("Borrador: aún rigen las tarifas actuales");
    await expect(page.getByRole("button", { name: "Activar tarifas nuevas", exact: true })).toBeEnabled();
    await expect(zonasDe(page).getByRole("listitem")).toHaveCount(2);
    await expect(zonasDe(page)).not.toContainText(a.zonaSatelite.nombre);
    await irAZona(page, b.zonaSatelite.nombre);
    await expect(panelDe(page).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true })).toHaveValue("");
    await expect(page.getByText(GRUPO_DE_A)).toHaveCount(0);
    await page.locator("#tarifas-nivel").click();
    await expect(page.getByRole("option")).toHaveText(["Toda la zona", "Tienda con precio propio…"]);
    await page.keyboard.press("Escape");
    await page.context().close();
  }

  async function adminLeeSinEscribir(browser: Browser, activada: boolean): Promise<void> {
    const page = await paginaDe(browser, adminDeA);
    await abrirTarifas(page);
    await irAZona(page, a.zonaSatelite.nombre);
    const panel = panelDe(page);

    // Lee lo mismo que el maestro: el importe digitado, como texto.
    await expect(filaDe(page, "Flete por entregado").getByRole("cell").nth(2)).toHaveText(importe(3100, { solo: true }));
    await expect(page.getByRole("region", { name: /Grupos de .* de la zona/ })).toContainText(GRUPO_DE_A);

    // Ni un control de escritura en toda la pantalla.
    await expect(panel.getByRole("textbox")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^Guardar/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Activar tarifas nuevas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crear grupo", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Añadir precio de tienda", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: new RegExp(`^Borrar ${GRUPO_DE_A}$`) })).toHaveCount(0);
    await irAPestana(page, "Pago al mensajero");
    await expect(panel.getByRole("checkbox", { name: "Pagar distinto por vehículo" })).toHaveCount(0);

    if (activada) await expect(page.getByText(/^En vigor desde el /)).toBeVisible();
    else await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("Borrador");
    await page.context().close();
  }

  test("A digita y crea un grupo: B no lo ve, y el admin de A lo lee sin poder escribir", async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await paginaDe(browser, a.empresa.maestro);
    await abrirTarifas(page);
    await irAZona(page, a.zonaSatelite.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_NUEVO);

    const grupos = page.getByRole("region", { name: /Grupos de .* de la zona/ });
    await grupos.getByRole("button", { name: "Crear grupo", exact: true }).click();
    const dialogo = page.getByRole("dialog", { name: "Crear grupo" });
    await dialogo.getByRole("textbox").fill(GRUPO_DE_A);
    await dialogo.getByRole("checkbox", { name: a.zonaSatelite.geo.distrito }).click();
    await dialogo.getByRole("button", { name: "Guardar", exact: true }).click();
    // SLT-89 (R22): toda escritura de grupos pasa por el antes → después del mismo modal.
    const confirmacion = page.getByRole("dialog", { name: `¿Crear el grupo ${GRUPO_DE_A}?` });
    await confirmacion.getByRole("button", { name: "Sí, guardar", exact: true }).click();
    await expect(confirmacion).toHaveCount(0);
    await expect(grupos).toContainText(GRUPO_DE_A);
    await page.context().close();

    await bNoVeNadaDeA(browser);
    await adminLeeSinEscribir(browser, false);
  });

  test("A activa: B sigue sin activar y calculando con el viejo", async ({ browser }) => {
    test.setTimeout(300_000);
    const page = await paginaDe(browser, a.empresa.maestro);
    await abrirTarifas(page);
    await activarConFaltantes(page);
    await page.context().close();

    expect(await activacionesDe(a.empresa.organizacionId)).toBe(1);
    expect(await activacionesDe(b.empresa.organizacionId)).toBe(0);
    expect(await valoresDe(b.empresa.organizacionId)).toEqual([]);

    await bNoVeNadaDeA(browser);
    await adminLeeSinEscribir(browser, true);

    const { cierreId } = await cierreAprobado(b);
    const congelado = await congeladoDelCierre(cierreId);
    expect(congelado.detalle.map((d) => [d.tarifaModelo, d.tarifaValorFlete])).toEqual([
      ["viejo", "2600"],
      ["viejo", "2600"],
    ]);
    expect(congelado.totalPagoMensajero).toBe("1700");
  });

  test("otro rol ve solo el aviso de permiso, sin datos", async ({ browser }) => {
    const page = await paginaDe(browser, a.tienda);
    await page.goto("/configuracion/tarifas");
    await expect(page.getByRole("alert").filter({ hasText: "No tienes permiso para acceder a esta sección." })).toBeVisible();
    await expect(page.getByTestId("tarifas-panel")).toHaveCount(0);
    await expect(page.getByText(a.zonaSatelite.nombre)).toHaveCount(0);
    await page.context().close();
  });
});
