import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { crearUsuarioE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

import { aprobarCierre, cierresDe, filaDeCola, importe, solicitarCierre } from "./_escenarios/cierres";
import { abrirCon, navegarCon } from "./_escenarios/pulsar";
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
import {
  abrirTarifas,
  activacionesDe,
  activarConFaltantes,
  cifraAsentada,
  congeladoDelCierre,
  digitarValorPropio,
  digitarYGuardar,
  editarValorPropio,
  irAZona,
  mensajerosDe,
  movimientosDelCierre,
  zonasDe,
  type Digitado,
  type ValorPropioDigitado,
} from "./_tarifas-activacion-fixture";

/**
 * SLT-55 R40 — el valor propio del mensajero, de la sección de Tarifas al cierre aprobado.
 *
 * DATOS: empresa nueva, por los servicios reales. M1 y M2, de la zona central: el cierre de una satélite no
 * entra en las wallets hasta consolidarse, y R24 las mira. Cada cierre: una entrega de 10.000 en efectivo y un
 * rechazo. Los 10.000 cubren el pago, así que aprobar no deja nada que liquidar.
 *
 * CIFRAS, a mano:
 *                            Modelo viejo    Zona digitada   Propio de M1
 *   Flete por entregado      2.500 + 13 %    3.100 + 13 %    —
 *   Flete por devolución     1.250 + 13 %    1.400 + 13 %    —
 *   Pago por entregado       1.700           2.200           2.900 (monto)
 *   Pago por devolución      No paga         sin valor       15 % de 1.400 = 210
 *
 * Cierres de M1, en orden:
 *   viejo                sin activar                                   1.700 + 0   = 1.700
 *   conPropio            activada, propio 2.900 y 15 %                 2.900 + 210 = 3.110
 *   congeladoAntes       congelado a 3.110, aprobado tras cambiar      2.900 + 210 = 3.110
 *   conCambio            propio de entregado a 3.000                   3.000 + 210 = 3.210
 *   sinPropio            propio quitado                                2.200 + 0   = 2.200
 * M2, de la misma zona: 2.200 + 0.
 */

const TARIFA_VIEJA = { valorFlete: 2500, valorFleteGam: 2500, valorFleteDevuelto: 1250, valorFleteDevueltoGam: 1250, ivaFlete: 13 };
const PAGO_VIEJO = { cobroEntregado: 1700, cobroRechazado: 300 };

const COBRO_ZONA: readonly Digitado[] = [
  { concepto: "Flete por entregado", valor: "3100", iva: "13" },
  { concepto: "Flete por devolución a origen", valor: "1400", iva: "13" },
];
const PAGO_ZONA: readonly Digitado[] = [{ concepto: "Por entregado", valor: "2200" }];

const PROPIO_DE_M1: readonly ValorPropioDigitado[] = [
  { concepto: "Por entregado", valor: "2900", modo: "Monto" },
  { concepto: "Por devolución a origen", valor: "15", modo: "%" },
];

const COL_ENTREGADO = 1;
const COL_DEVOLUCION = 2;
const COL_REPROGRAMADO = 3;

/** Una entrega de 10.000 y un rechazo de `m`, sin cerrar. Devuelve el rechazo: su guía es la que se confirma al aprobar. */
async function gestionesDelDia(r: RepartoE2E, m: MensajeroE2E): Promise<OrdenE2E> {
  const entrega = await llevarA(r, await crearOrden(r, { zona: "central", montoCobrar: 10000 }), "en_reparto", { mensajero: m });
  await gestionar(r, entrega, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto: 10000 }] });
  const rechazo = await llevarA(r, await crearOrden(r, { zona: "central" }), "en_reparto", { mensajero: m });
  await gestionar(r, rechazo, m, { resultado: "devolucion_a_origen_por_rechazo", motivo: "No la quiere" });
  return rechazo;
}

/** Lo que el mensajero lee como su ganancia del día, antes de cerrar. */
async function abrirCierreDelDia(browser: Browser, m: MensajeroE2E): Promise<Page> {
  const page = await paginaDe(browser, m);
  await page.goto("/cierre-dia");
  // SLT-109 (R61): el cierre de hoy es el detalle único en página; sus cifras sustituyen a «Totales del día».
  await expect(page.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" })).toBeVisible();
  return page;
}

/** El mensajero solicita su cierre en pantalla, con su sesión. Devuelve el id del cierre que acaba de nacer. */
async function solicitarEnPantalla(page: Page, m: MensajeroE2E): Promise<string> {
  const previos = (await cierresDe(m)).length;
  const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
  await abrirCon(page.getByRole("region", { name: "Detalle del cierre · Tu cierre del día" }).getByRole("button", { name: "Solicitar cierre" }), dialogo);
  await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
  await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();
  const cierres = await cierresDe(m);
  expect(cierres).toHaveLength(previos + 1);
  return cierres[cierres.length - 1].id;
}

/**
 * SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)»: el KPI «Pago al mensajero» es la cifra del
 * mismo nombre del detalle único, y el KPI «Total de la empresa» es el «Total facturado» de la cuenta «Lo que se
 * le factura a la tienda» (mismo importe). Se espera a que el texto se asiente, como antes.
 */
async function kpi(detalle: Locator, rotulo: "Pago al mensajero" | "Total de la empresa"): Promise<string> {
  const valor =
    rotulo === "Pago al mensajero"
      ? detalle.locator('[data-cifra="pago"]')
      : detalle.getByRole("region", { name: "Lo que se le factura a la tienda" }).locator('[data-tipo="total"] [data-monto]');
  return cifraAsentada(valor);
}

/** La aprobación real: el maestro, con su sesión, por `/cierres-admin`, confirmando la guía que vuelve. */
async function aprobarEnPantalla(browser: Browser, r: RepartoE2E, m: MensajeroE2E, rechazo: OrdenE2E, pagoEsperado: number): Promise<void> {
  const page = await paginaDe(browser, r.empresa.maestro);
  await page.goto("/cierres-admin");
  const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
  const comprobante = filaDeCola(pendientes, m.nombre);
  await expect(comprobante.getByText("Solicitado", { exact: true })).toBeVisible();
  const detalle = page.getByRole("dialog", { name: "Detalle del cierre" });
  await abrirCon(comprobante.getByRole("button", { name: "Ver / decidir" }), detalle);
  expect(await kpi(detalle, "Pago al mensajero")).toMatch(importe(pagoEsperado, { solo: true }));

  const confirmar = page.getByRole("dialog", { name: "Confirmar los paquetes que vuelven" });
  await abrirCon(detalle.getByRole("button", { name: "Revisar paquetes y aprobar", exact: true }), confirmar);
  const lector = confirmar.getByRole("region", { name: "Confirmar por número de guía o escaneo" });
  await lector.getByLabel("Número de guía").fill(String(rechazo.numGuia));
  await lector.getByRole("button", { name: "Confirmar", exact: true }).click();
  const aprobar = confirmar.getByRole("button", { name: "Confirmar y aprobar" });
  await expect(aprobar).toBeEnabled();
  await aprobar.click();
  await expect(page.getByText("Cierre aprobado correctamente.")).toBeVisible();
  await page.context().close();
}

/** El par de valores congelados de M1 mientras su propio es 2.900 y 15 %. */
const PAGOS_CON_PROPIO = [
  [{ actor: "mensajero", concepto: "mensajero_entregado", modo: "monto", valor: "2900", nivel: "mensajero", base: null, importe: "2900" }],
  [{ actor: "mensajero", concepto: "mensajero_rechazo", modo: "porcentaje", valor: "15", nivel: "mensajero", base: "1400", importe: "210" }],
];

test.use({ actionTimeout: 30_000 });

test.describe.serial("Valor propio del mensajero — de la sección al cierre aprobado (R40)", () => {
  let r: RepartoE2E;
  let m1: MensajeroE2E;
  let m2: MensajeroE2E;
  let page: Page;
  let cierreViejo: string;
  let cierreConPropio: string;
  let congeladoConPropio: Awaited<ReturnType<typeof congeladoDelCierre>>;
  let movimientosConPropio: string[];
  let cierreCongeladoAntes: string;
  let cierreConCambio: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    r = await crearEscenarioReparto("tarifas-valor-propio", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    m1 = await crearMensajero(r, "central");
    m2 = await crearMensajero(r, "central");
    page = await paginaDe(browser, r.empresa.maestro);
  });

  test("R36, R27, R23: añadir el propio en la sección no mueve la cobertura de la zona", async () => {
    test.setTimeout(180_000);
    await abrirTarifas(page);
    const estado = page.getByRole("region", { name: "Estado de las tarifas" });
    await expect(mensajerosDe(page)).toContainText("Ningún mensajero tiene valor propio");
    await expect(mensajerosDe(page)).toContainText("Lo que digites aquí no cambia ningún pago hasta que actives las tarifas nuevas.");

    await irAZona(page, r.zonaCentral.nombre);
    await digitarYGuardar(page, "Cobro a la tienda", COBRO_ZONA);
    await digitarYGuardar(page, "Pago al mensajero", PAGO_ZONA);
    await expect(estado).toContainText("1 de 2 zonas completas");

    await digitarValorPropio(page, m1, PROPIO_DE_M1);
    // `.last()`: los guardados de la zona dejan el mismo aviso aún en pantalla.
    await expect(page.getByText("Borrador guardado. No cambia ningún cobro ni pago hasta que actives.").last()).toBeVisible();

    const fila = mensajerosDe(page).getByRole("row").filter({ hasText: m1.nombre });
    await expect(fila.getByRole("cell").nth(COL_ENTREGADO)).toHaveText(importe(2900, { solo: true }));
    await expect(fila.getByRole("cell").nth(COL_DEVOLUCION)).toHaveText("15 %");
    await expect(fila.getByRole("cell").nth(COL_REPROGRAMADO)).toHaveText("Usa la zona");

    // R23: el propio no cubre nada, ni recién guardado ni al volver a leerlo del servidor.
    await expect(estado).toContainText("1 de 2 zonas completas");
    await abrirTarifas(page);
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toContainText("1 de 2 zonas completas");
    await expect(zonasDe(page).getByRole("button", { name: new RegExp(r.zonaSatelite.nombre) })).toContainText("Sin empezar");
    await expect(mensajerosDe(page).getByRole("row").filter({ hasText: m1.nombre }).getByRole("cell").nth(COL_ENTREGADO)).toHaveText(
      importe(2900, { solo: true }),
    );

    // R1, R2: una fila por resultado, sin zona, grupo, tienda, vehículo ni IVA.
    const filas = await baseReparto().tarifaValor.findMany({
      where: { organizacionId: r.empresa.organizacionId, mensajeroId: m1.id },
      orderBy: { concepto: "asc" },
      select: { concepto: true, modo: true, valor: true, ivaPct: true, zonaId: true, grupoId: true, tiendaId: true, vehiculoId: true },
    });
    expect(JSON.parse(JSON.stringify(filas))).toEqual([
      { concepto: "mensajero_entregado", modo: "monto", valor: "2900", ivaPct: null, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null },
      { concepto: "mensajero_rechazo", modo: "porcentaje", valor: "15", ivaPct: null, zonaId: null, grupoId: null, tiendaId: null, vehiculoId: null },
    ]);
    expect(await activacionesDe(r.empresa.organizacionId)).toBe(0);
  });

  test("R21: sin activar, el cierre de M1 paga el modelo viejo aunque tenga propio", async ({ browser }) => {
    test.setTimeout(240_000);
    await gestionesDelDia(r, m1);
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(1700));
    await mensajero.context().close();

    cierreViejo = await solicitarCierre(r, m1);
    await aprobarCierre(r, cierreViejo);
    const viejo = await congeladoDelCierre(cierreViejo);
    expect(viejo).toMatchObject({ estado: "aprobado", totalGeneral: "10000", totalPagoMensajero: "1700" });
    expect(viejo.detalle.map((d) => d.tarifaModelo)).toEqual(["viejo", "viejo"]);
    expect(viejo.gestiones.map((g) => [g.resultado, g.pagoMensajero, g.pagosCongelados])).toEqual([
      ["entregado", "1700", []],
      ["devolucion_a_origen_por_rechazo", "0", []],
    ]);
  });

  test("R12, R17, R39: activa; M1 ve 3.110 en su cierre, y la aprobación real paga 3.110 con nivel `mensajero`", async ({ browser }) => {
    test.setTimeout(240_000);
    await abrirTarifas(page);
    // R23: la confirmación sigue pidiendo el pago de la otra zona, con M1 y su propio ya dentro.
    const dialogo = page.getByRole("dialog", { name: "Activar tarifas nuevas" });
    await abrirCon(page.getByRole("button", { name: "Activar tarifas nuevas", exact: true }), dialogo);
    await expect(dialogo).toContainText("Falta por definir en 1 zona");
    await expect(dialogo.getByRole("listitem").filter({ hasText: r.zonaSatelite.nombre })).toContainText("sin pago al mensajero por entregado");
    await dialogo.getByRole("button", { name: "Seguir digitando", exact: true }).click();
    await expect(dialogo).toHaveCount(0);
    await activarConFaltantes(page);
    await expect(mensajerosDe(page)).toContainText("Un cambio aplica desde el siguiente cierre. Los cierres ya hechos no cambian.");

    const rechazo = await gestionesDelDia(r, m1);
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(3110));
    cierreConPropio = await solicitarEnPantalla(mensajero, m1);
    await mensajero.context().close();

    await aprobarEnPantalla(browser, r, m1, rechazo, 3110);

    congeladoConPropio = await congeladoDelCierre(cierreConPropio);
    expect(congeladoConPropio).toMatchObject({ estado: "aprobado", totalGeneral: "10000", totalPagoMensajero: "3110" });
    expect(congeladoConPropio.gestiones.map((g) => [g.resultado, g.pagoMensajero])).toEqual([
      ["entregado", "2900"],
      ["devolucion_a_origen_por_rechazo", "210"],
    ]);
    expect(congeladoConPropio.gestiones.map((g) => g.pagosCongelados.filter((p) => p.actor === "mensajero"))).toEqual(PAGOS_CON_PROPIO);

    // Lo que la aprobación dejó en el libro del mensajero: devengó 3.110 y se los quedó del efectivo.
    movimientosConPropio = await movimientosDelCierre(cierreConPropio);
    expect(movimientosConPropio.filter((m) => m.startsWith("mensajero:"))).toEqual([
      "mensajero:devengo:pago_devengado=3110",
      "mensajero:pago:pago_efectivo=3110",
    ]);
  });

  test("R16: M2, de la misma zona, cobra el valor de la zona", async ({ browser }) => {
    test.setTimeout(240_000);
    await gestionesDelDia(r, m2);
    const mensajero = await abrirCierreDelDia(browser, m2);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(2200));
    await mensajero.context().close();

    const cierreId = await solicitarCierre(r, m2);
    await aprobarCierre(r, cierreId);
    const congelado = await congeladoDelCierre(cierreId);
    expect(congelado.totalPagoMensajero).toBe("2200");
    expect(congelado.gestiones.map((g) => [g.resultado, g.pagoMensajero])).toEqual([
      ["entregado", "2200"],
      ["devolucion_a_origen_por_rechazo", "0"],
    ]);
    const pagoEntrega = congelado.gestiones[0].pagosCongelados.find((p) => p.actor === "mensajero");
    expect(pagoEntrega).toMatchObject({ concepto: "mensajero_entregado", nivel: "zona", valor: "2200", importe: "2200" });
  });

  test("R24: cambiar el propio no mueve lo congelado, ni lo aprobado ni lo que aún se aprueba; el siguiente paga lo nuevo", async ({ browser }) => {
    test.setTimeout(240_000);
    // Congelado a 3.110 antes del cambio, y aprobado después: es la aprobación la que no debe recalcular.
    const rechazoCongelado = await gestionesDelDia(r, m1);
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(3110));
    cierreCongeladoAntes = await solicitarEnPantalla(mensajero, m1);
    await mensajero.context().close();

    await abrirTarifas(page);
    await editarValorPropio(page, m1, [{ concepto: "Por entregado", valor: "3000" }]);
    await expect(page.getByText("Guardado. El cambio aplica desde el siguiente cierre; los cierres ya hechos no cambian.")).toBeVisible();
    await expect(mensajerosDe(page).getByRole("row").filter({ hasText: m1.nombre }).getByRole("cell").nth(COL_ENTREGADO)).toHaveText(
      importe(3000, { solo: true }),
    );

    await aprobarEnPantalla(browser, r, m1, rechazoCongelado, 3110);
    const aprobadoDespues = await congeladoDelCierre(cierreCongeladoAntes);
    expect(aprobadoDespues).toMatchObject({ estado: "aprobado", totalPagoMensajero: "3110" });
    expect(aprobadoDespues.gestiones.map((g) => g.pagosCongelados.filter((p) => p.actor === "mensajero"))).toEqual(PAGOS_CON_PROPIO);
    expect((await movimientosDelCierre(cierreCongeladoAntes)).filter((m) => m.startsWith("mensajero:"))).toEqual([
      "mensajero:devengo:pago_devengado=3110",
      "mensajero:pago:pago_efectivo=3110",
    ]);

    // Lo ya aprobado, fila a fila.
    expect(await congeladoDelCierre(cierreConPropio)).toEqual(congeladoConPropio);
    expect(await movimientosDelCierre(cierreConPropio)).toEqual(movimientosConPropio);

    // El siguiente: 3.000 de entregado, y el 15 % de devolución sigue igual.
    await gestionesDelDia(r, m1);
    const siguiente = await abrirCierreDelDia(browser, m1);
    await expect(siguiente.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(3210));
    await siguiente.context().close();
    cierreConCambio = await solicitarCierre(r, m1);
    await aprobarCierre(r, cierreConCambio);
    const conCambio = await congeladoDelCierre(cierreConCambio);
    expect(conCambio.totalPagoMensajero).toBe("3210");
    expect(conCambio.gestiones.map((g) => g.pagoMensajero)).toEqual(["3000", "210"]);
  });

  test("R4, R33, R11: quitar el propio devuelve a M1 al valor de la zona, deja el historial y no mueve lo hecho", async ({ browser }) => {
    test.setTimeout(240_000);
    await abrirTarifas(page);
    const quitar = page.getByRole("dialog", { name: `Quitar el valor propio de ${m1.nombre}` });
    await abrirCon(mensajerosDe(page).getByRole("button", { name: `Quitar valor propio de ${m1.nombre}`, exact: true }), quitar);
    await expect(quitar).toContainText("Se quitan 2 valores. El mensajero pasa a usar el valor de la zona.");
    await quitar.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(quitar).toHaveCount(0);
    await expect(page.getByText("Valor propio quitado.")).toBeVisible();
    await expect(mensajerosDe(page)).toContainText("Ningún mensajero tiene valor propio");
    await expect(mensajerosDe(page)).not.toContainText(m1.nombre);

    await gestionesDelDia(r, m1);
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toContainText(importe(2200));
    await mensajero.context().close();
    const cierreId = await solicitarCierre(r, m1);
    await aprobarCierre(r, cierreId);
    const sinPropio = await congeladoDelCierre(cierreId);
    expect(sinPropio.totalPagoMensajero).toBe("2200");
    expect(sinPropio.gestiones.map((g) => g.pagoMensajero)).toEqual(["2200", "0"]);
    expect(sinPropio.gestiones[0].pagosCongelados.find((p) => p.actor === "mensajero")).toMatchObject({ nivel: "zona", importe: "2200" });

    // R24, al quitar: lo congelado conserva su importe y su nivel, aunque su valor de origen ya no exista.
    expect(await congeladoDelCierre(cierreConPropio)).toEqual(congeladoConPropio);
    expect(await movimientosDelCierre(cierreConPropio)).toEqual(movimientosConPropio);

    // El libro del mensajero, en pantalla: lo devengado por cada cierre, del viejo al de sin propio.
    await page.goto("/wallet/mensajeros");
    await navegarCon(
      page,
      page.getByRole("link", { name: `Ver estado de cuenta de ${m1.nombre}` }),
      new RegExp(`/wallet/mensajeros/${m1.id}$`),
    );
    const libro = page.getByRole("table", { name: `Estado de cuenta de ${m1.nombre}` });
    const devengos = libro.getByRole("row").filter({ hasText: "Pago devengado" });
    await expect(devengos).toHaveCount(5);
    for (const [i, monto] of [2200, 3210, 3110, 3110, 1700].entries()) {
      await expect(devengos.nth(i)).toContainText(importe(monto));
    }

    // R11, por detrás: cada fijación y cada quitada, con el concepto y el nombre de M1.
    const historial = await baseReparto().historialAccion.findMany({
      where: { entidadTipo: "tarifa_valor", entidadEtiqueta: { contains: m1.nombre } },
      orderBy: { createdAt: "asc" },
      select: { accion: true, entidadEtiqueta: true, valorAnterior: true, valorNuevo: true },
    });
    const conceptos = historial.map((h) => h.entidadEtiqueta.split(" · ")[0]);
    expect(historial.map((h, i) => [h.accion, conceptos[i], h.valorAnterior, h.valorNuevo]).sort()).toEqual(
      [
        ["tarifa_valor_fijado", "mensajero_entregado", null, "monto 2900.00"],
        ["tarifa_valor_fijado", "mensajero_rechazo", null, "porcentaje 15.00"],
        ["tarifa_valor_fijado", "mensajero_entregado", "monto 2900.00", "monto 3000.00"],
        ["tarifa_valor_quitado", "mensajero_entregado", "monto 3000.00", null],
        ["tarifa_valor_quitado", "mensajero_rechazo", "porcentaje 15.00", null],
      ].sort(),
    );
  });

  test("R39, R35: M1 no ve nada de esto en su portal, ni entra a Tarifas", async ({ browser }) => {
    const mensajero = await abrirCierreDelDia(browser, m1);
    await expect(mensajero.getByRole("group", { name: "Tu ganancia", exact: true })).toBeVisible();
    await expect(mensajero.locator("body")).not.toContainText(/valor propio/i);

    await mensajero.goto("/configuracion/tarifas");
    await expect(mensajero.getByRole("alert").filter({ hasText: "No tienes permiso para acceder a esta sección." })).toBeVisible();
    await expect(mensajerosDe(mensajero)).toHaveCount(0);
    await expect(mensajero.getByTestId("tarifas-panel")).toHaveCount(0);
    await mensajero.context().close();
  });
});

/** Una Server Action, repetida con la sesión de `page` como la mandaría su navegador. */
const VALOR_2900 = `"valor":"2900"`;

interface AccionCapturada {
  id: string;
  cuerpo: string;
}

async function reenviarAccion(page: Page, accion: AccionCapturada, cuerpo: string): Promise<{ status: number; texto: string }> {
  return page.evaluate(
    async ({ id, cuerpo: body }) => {
      const res = await fetch("/configuracion/tarifas", {
        method: "POST",
        headers: { "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component" },
        body,
      });
      return { status: res.status, texto: await res.text() };
    },
    { id: accion.id, cuerpo },
  );
}

test.describe.serial("Valor propio — dos empresas y `admin`, por la sesión real (R37, R35)", () => {
  let a: RepartoE2E;
  let b: RepartoE2E;
  let mA: MensajeroE2E;
  let mB: MensajeroE2E;
  let adminDeA: UsuarioE2E;
  let accion: AccionCapturada;

  const propiosDe = async (organizacionId: string): Promise<string[]> => {
    const filas = await baseReparto().tarifaValor.findMany({
      where: { organizacionId, mensajeroId: { not: null } },
      select: { mensajeroId: true, concepto: true, valor: true },
    });
    return filas.map((f) => `${f.mensajeroId}:${f.concepto}=${f.valor.toString()}`).sort();
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    a = await crearEscenarioReparto("tarifas-propio-a", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    b = await crearEscenarioReparto("tarifas-propio-b", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    mA = await crearMensajero(a, "satelite");
    mB = await crearMensajero(b, "satelite");
    adminDeA = await crearUsuarioE2E(a.empresa, "admin");
  });

  test("R37: el maestro de B no ve ni le ofrecen nada de A, y lo suyo queda en B", async ({ browser }) => {
    test.setTimeout(180_000);
    const pageA = await paginaDe(browser, a.empresa.maestro);
    await abrirTarifas(pageA);
    pageA.on("request", (req) => {
      const id = req.headers()["next-action"];
      const cuerpo = req.postData();
      // La acción que lleva el `mensajeroId`, y no las lecturas que la pantalla hace después.
      if (id !== undefined && cuerpo !== null && cuerpo.includes(mA.id)) accion = { id, cuerpo };
    });
    await digitarValorPropio(pageA, mA, [{ concepto: "Por entregado", valor: "2900", modo: "Monto" }]);
    await pageA.context().close();
    expect(accion?.cuerpo, "no se vio salir la acción de guardar").toContain(VALOR_2900);
    expect(await propiosDe(a.empresa.organizacionId)).toEqual([`${mA.id}:mensajero_entregado=2900`]);

    const pageB = await paginaDe(browser, b.empresa.maestro);
    await abrirTarifas(pageB);
    await expect(mensajerosDe(pageB)).toContainText("Ningún mensajero tiene valor propio");
    await expect(mensajerosDe(pageB)).not.toContainText(mA.nombre);

    // R31, R37: el selector ofrece solo a su mensajero.
    const dialogo = pageB.getByRole("dialog", { name: "Añadir mensajero con valor propio" });
    await abrirCon(mensajerosDe(pageB).getByRole("button", { name: "Añadir mensajero", exact: true }), dialogo);
    await abrirCon(dialogo.getByRole("combobox", { name: "Mensajero", exact: true }), pageB.getByRole("listbox"));
    await expect(pageB.getByRole("option")).toHaveText([mB.nombre]);
    await pageB.keyboard.press("Escape");
    await expect(pageB.getByRole("listbox")).toHaveCount(0);
    await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialogo).toHaveCount(0);

    await digitarValorPropio(pageB, mB, [{ concepto: "Por entregado", valor: "2500", modo: "Monto" }]);
    await pageB.context().close();
    expect(await propiosDe(b.empresa.organizacionId)).toEqual([`${mB.id}:mensajero_entregado=2500`]);
    expect(await propiosDe(a.empresa.organizacionId)).toEqual([`${mA.id}:mensajero_entregado=2900`]);
  });

  test("R7, R37: la sesión de B no puede ponerle valor a un mensajero de A, aunque mande su id", async ({ browser }) => {
    const pageB = await paginaDe(browser, b.empresa.maestro);
    await abrirTarifas(pageB);

    // La acción responde de verdad con la sesión de B: su propio mensajero, en otro resultado, se guarda.
    const propio = accion.cuerpo.replaceAll(mA.id, mB.id).replace(VALOR_2900, `"valor":"2700"`).replaceAll("mensajero_entregado", "mensajero_novedad");
    const bien = await reenviarAccion(pageB, accion, propio);
    expect(bien.status).toBe(200);
    expect(bien.texto).toContain('"status":"ok"');
    expect(bien.texto).not.toContain("validation_error");
    expect(await propiosDe(b.empresa.organizacionId)).toEqual([`${mB.id}:mensajero_entregado=2500`, `${mB.id}:mensajero_novedad=2700`].sort());

    // Lo mismo con el mensajero de A: `validation_error` en `mensajeroId`, y nada escrito en ninguna empresa.
    const ajena = await reenviarAccion(pageB, accion, accion.cuerpo.replaceAll("mensajero_entregado", "mensajero_reprogramado"));
    expect(ajena.status).toBe(200);
    expect(ajena.texto).toContain("validation_error");
    expect(ajena.texto).toContain("mensajeroId");
    expect(await propiosDe(a.empresa.organizacionId)).toEqual([`${mA.id}:mensajero_entregado=2900`]);
    expect(await propiosDe(b.empresa.organizacionId)).toEqual([`${mB.id}:mensajero_entregado=2500`, `${mB.id}:mensajero_novedad=2700`].sort());
    await pageB.context().close();
  });

  test("R35, R10: el `admin` de A lee lo mismo sin un control de escritura, y su sesión no puede escribir", async ({ browser }) => {
    const page = await paginaDe(browser, adminDeA);
    await abrirTarifas(page);
    const fila = mensajerosDe(page).getByRole("row").filter({ hasText: mA.nombre });
    await expect(fila.getByRole("cell").nth(COL_ENTREGADO)).toHaveText(importe(2900, { solo: true }));
    await expect(mensajerosDe(page).getByRole("button", { name: "Añadir mensajero", exact: true })).toHaveCount(0);
    await expect(mensajerosDe(page).getByRole("button", { name: `Editar valor propio de ${mA.nombre}`, exact: true })).toHaveCount(0);
    await expect(mensajerosDe(page).getByRole("button", { name: `Quitar valor propio de ${mA.nombre}`, exact: true })).toHaveCount(0);

    const prohibida = await reenviarAccion(page, accion, accion.cuerpo.replace(VALOR_2900, `"valor":"1"`));
    expect(prohibida.status).toBe(200);
    expect(prohibida.texto).toContain("forbidden");
    expect(await propiosDe(a.empresa.organizacionId)).toEqual([`${mA.id}:mensajero_entregado=2900`]);
    await page.context().close();
  });
});

test.describe.serial("Valor propio — a 390 px (R38)", () => {
  const MOVIL = { viewport: { width: 390, height: 844 } };
  let r: RepartoE2E;
  let m: MensajeroE2E;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    r = await crearEscenarioReparto("tarifas-propio-movil", { tarifa: TARIFA_VIEJA, tarifaMensajero: PAGO_VIEJO });
    m = await crearMensajero(r, "satelite");
    await crearMensajero(r, "satelite");
  });

  const anchoDePagina = (page: Page): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);

  /** El alto de cada botón y campo visible de `zona`. Un control más bajo que 44 sale con su nombre. */
  async function controlesBajos(zona: Locator): Promise<string[]> {
    return zona.evaluate((raiz) => {
      const controles = raiz.querySelectorAll<HTMLElement>("button, input, select, textarea, [role='combobox']");
      // Sin el `input` oculto de cada `Select` de Base UI: lleva el valor, no se ve ni se pulsa.
      const medidos = [...controles].filter(
        (c) => c.getClientRects().length > 0 && getComputedStyle(c).visibility !== "hidden" && c.closest("[aria-hidden='true']") === null,
      );
      if (medidos.length === 0) return ["ningún control medido"];
      return medidos
        .filter((c) => c.getBoundingClientRect().height < 44)
        .map((c) => `${c.getAttribute("aria-label") ?? c.textContent ?? c.tagName}: ${c.getBoundingClientRect().height}`);
    });
  }

  /**
   * Cada campo «Valor» de `dialogo`, tal como queda sin desplazar nada: `derecha` debe ser ≤ `finDialogo`, y su texto debe
   * caber. Sin esto, a 390 px un «2900» guardado se veía cortado aunque la página no diera scroll: el campo acababa en
   * x=391 y el diálogo en x=374.
   */
  async function camposValor(dialogo: Locator): Promise<{ nombre: string; derecha: number; finDialogo: number; textoCabe: boolean; desplazado: boolean }[]> {
    return dialogo.evaluate((raiz) => {
      const finDialogo = raiz.getBoundingClientRect().right;
      const campos = [...raiz.querySelectorAll<HTMLInputElement>("input[aria-label^='Valor de ']")];
      return campos.map((c) => {
        let desplazado = false;
        for (let padre = c.parentElement; padre !== null && padre !== raiz.parentElement; padre = padre.parentElement) {
          if (padre.scrollLeft !== 0 || padre.scrollWidth > padre.clientWidth) desplazado = true;
        }
        return {
          nombre: c.getAttribute("aria-label") ?? "",
          derecha: c.getBoundingClientRect().right,
          finDialogo,
          textoCabe: c.scrollWidth <= c.clientWidth,
          desplazado,
        };
      });
    });
  }

  function expectValorDentro(campos: Awaited<ReturnType<typeof camposValor>>): void {
    expect(campos.map((c) => c.nombre)).toEqual([
      "Valor de Por entregado",
      "Valor de Por devolución a origen",
      "Valor de Por reprogramado",
      "Valor de Por novedad",
      "Valor de Por incidente",
    ]);
    expect(campos.filter((c) => c.derecha > c.finDialogo || !c.textoCabe || c.desplazado)).toEqual([]);
  }

  test("la sección y su diálogo caben sin scroll de página, con controles de 44, y el `Select` del `Modal` se puede usar", async ({ browser }) => {
    test.setTimeout(180_000);
    const page = await paginaDe(browser, r.empresa.maestro, MOVIL);
    await abrirTarifas(page);
    await mensajerosDe(page).scrollIntoViewIfNeeded();
    expect(await anchoDePagina(page)).toBeLessThanOrEqual(390);
    expect(await controlesBajos(mensajerosDe(page))).toEqual([]);

    const dialogo = page.getByRole("dialog", { name: "Añadir mensajero con valor propio" });
    await abrirCon(mensajerosDe(page).getByRole("button", { name: "Añadir mensajero", exact: true }), dialogo);
    expect(await anchoDePagina(page)).toBeLessThanOrEqual(390);
    expect(await controlesBajos(dialogo)).toEqual([]);
    expectValorDentro(await camposValor(dialogo));

    // El selector de mensajero, en el `Modal`: su lista cabe en la pantalla y responde al puntero.
    const opcion = page.getByRole("option", { name: m.nombre, exact: true });
    await abrirCon(dialogo.getByRole("combobox", { name: "Mensajero", exact: true }), opcion);
    await expect(opcion).toBeInViewport({ ratio: 1 });
    await opcion.click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(dialogo.getByRole("combobox", { name: "Mensajero", exact: true })).toContainText(m.nombre);

    // El modo de la última fila, la más abajo: se alcanza, y el foco sigue en el diálogo.
    const porcentaje = page.getByRole("option", { name: /^%$/ });
    const modo = dialogo.getByRole("combobox", { name: "Modo de Por incidente", exact: true });
    await modo.scrollIntoViewIfNeeded();
    await abrirCon(modo, porcentaje);
    await expect(porcentaje).toBeInViewport({ ratio: 1 });
    await porcentaje.click();
    await expect(modo).toContainText("%");
    await dialogo.getByRole("textbox", { name: "Valor de Por incidente", exact: true }).fill("10");
    await dialogo.getByRole("textbox", { name: "Valor de Por entregado", exact: true }).fill("2900");

    const guardar = dialogo.getByRole("button", { name: "Guardar borrador", exact: true });
    await guardar.scrollIntoViewIfNeeded();
    await expect(guardar).toBeInViewport({ ratio: 1 });
    expect(await anchoDePagina(page)).toBeLessThanOrEqual(390);
    await guardar.click();
    await expect(dialogo).toHaveCount(0);

    // Con una fila en la tabla, la página sigue sin scroll y los botones de la fila miden lo mismo.
    const fila = mensajerosDe(page).getByRole("row").filter({ hasText: m.nombre });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText("10 %");
    expect(await anchoDePagina(page)).toBeLessThanOrEqual(390);
    expect(await controlesBajos(mensajerosDe(page))).toEqual([]);

    // El «2900» guardado se lee entero al volver a abrir, sin desplazar.
    const edicion = page.getByRole("dialog", { name: `Valor propio de ${m.nombre}` });
    await abrirCon(mensajerosDe(page).getByRole("button", { name: `Editar valor propio de ${m.nombre}`, exact: true }), edicion);
    await expect(edicion.getByRole("textbox", { name: "Valor de Por entregado", exact: true })).toHaveValue("2900");
    expectValorDentro(await camposValor(edicion));
    expect(await anchoDePagina(page)).toBeLessThanOrEqual(390);
    expect(await controlesBajos(edicion)).toEqual([]);
    await page.context().close();
  });
});
