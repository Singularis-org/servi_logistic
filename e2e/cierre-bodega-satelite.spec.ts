import { expect, test, type Locator, type Page } from "@playwright/test";

import { movimientosCajaDe } from "./_escenarios/caja";
import { aprobarCierre, filaDeMensajeros, importe, montoDeCuenta, solicitarCierre } from "./_escenarios/cierres";
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
 *  3. Como la marca ya entró a la caja, el detalle NO ofrece «Desmarcar» (SLT-76 R3/R4: antes se
 *     ofrecía y se rechazaba con el aviso de SLT-73 R14), y la consolidación sigue conciliada, en
 *     «Resueltos».
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
 *
 * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (T6.1; R40-R43, R77, R111-R114,
 * R117) — los pasos 2 y 3 leen el DETALLE ÚNICO (`DetalleCierre` tipo bodega) en lugar del modal de antes:
 * cuatro cifras arriba, pestañas «Dinero», «Gestiones (n)», «Mensajeros (n)» y «Conciliación», y
 * «Marcar recibido» en el pie. Literales ESCRITOS A MANO (`progress/impl_SLT-104.md > T0.3`; tienda por
 * defecto de la fábrica: flete 2.500, flete devuelto 1.250, comisión 0, IVA 0, sin fulfillment ni zona
 * especial — comprobado en la base de la corrida, ver la bitácora de T6):
 *   Recaudado ₡9.000 · Debe llegar a la central 9.000 − 1.500 − 500 = ₡7.000 · Pago a mensajeros ₡1.500
 *   Total facturado 2.500 + 1.250 = ₡3.750 · Le queda a la empresa 3.750 − 0 − 1.500 − 500 = ₡1.750
 *   Mensajeros: una fila (2 gestiones · ₡9.000 · ₡1.500 · ₡7.000 · «—»).
 *   Conciliación sin marca: ₡7.000 · «—» · ₡7.000; marcada por 7.000: ₡7.000 · ₡7.000 · ₡0.
 */

const CENTRAL = "Lo que va a la central";
const FACTURA = "Lo que se le factura a la tienda";
const QUEDA = "De lo facturado, le queda a la empresa";

const detalleDeBodega = (page: Page): Locator => page.getByRole("dialog", { name: "Detalle del cierre de bodega" });

async function irA(detalle: Locator, pestana: string | RegExp): Promise<void> {
  const tab = detalle.getByRole("tablist", { name: "Secciones del cierre" }).getByRole("tab", { name: pestana });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Las cuatro cifras y los totales de las cuentas de «Dinero», al céntimo (literales de T0.3). */
async function cifrasYDinero(detalle: Locator): Promise<void> {
  const cifra = (id: string) => detalle.locator(`[data-cifra="${id}"]`);
  await expect(cifra("recaudado")).toHaveText("₡9.000");
  await expect(cifra("paraCentral")).toHaveText("₡7.000");
  await expect(cifra("pago")).toHaveText("₡1.500");
  await expect(cifra("leQueda")).toHaveText("₡1.750");
  await irA(detalle, "Dinero");
  await expect(montoDeCuenta(detalle, CENTRAL, "Total general")).toHaveText("₡9.000");
  await expect(montoDeCuenta(detalle, CENTRAL, "− Pago a mensajeros")).toHaveText("₡1.500");
  await expect(montoDeCuenta(detalle, CENTRAL, "− Gana la bodega satélite")).toHaveText("₡500");
  await expect(montoDeCuenta(detalle, FACTURA, "Total facturado")).toHaveText("₡3.750");
  await expect(montoDeCuenta(detalle, QUEDA, "− Gana la bodega satélite")).toHaveText("₡500");
  await expect(montoDeCuenta(detalle, QUEDA, "Le queda a la empresa")).toHaveText("₡1.750");
}

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

  test("2 — el maestro abre el detalle único, ve las cifras, los mensajeros, la evidencia y marca recibido", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await pestanaBodega(page);
    const modulo = page.getByRole("region", { name: "Cierres de bodega satélite" });
    await modulo
      .getByRole("region", { name: "Cierres de bodega pendientes" })
      .getByRole("button", { name: `Ver / decidir el cierre de bodega de ${r.zonaSatelite.nombre}` })
      .click();
    const detalle = detalleDeBodega(page);
    await expect(detalle).toBeVisible();

    // SLT-104 (R40, R77): las cuatro cifras de arriba y las tres cuentas de «Dinero», literales de T0.3.
    await cifrasYDinero(detalle);
    await expect(montoDeCuenta(detalle, CENTRAL, "Debe llegar a la central")).toHaveText("₡7.000");

    // R42, R114: una fila por cierre del día, en «Mensajeros».
    await irA(detalle, "Mensajeros (1)");
    await expect(filaDeMensajeros(detalle, m.nombre).getByRole("cell")).toHaveText([
      m.nombre,
      "2",
      "₡9.000",
      "₡1.500",
      "₡7.000",
      "—",
      "Ver su cierre",
    ]);

    // R41: las gestiones de todos los cierres del día en UNA lista; la evidencia firmada del rechazo.
    await irA(detalle, /^Gestiones \(/);
    const ordenes = detalle.getByRole("region", { name: "Órdenes del cierre" });
    await detalle
      .getByRole("group", { name: "Filtrar por resultado" })
      .getByRole("button", { name: /^Devolución a origen por rechazo/ })
      .click();
    // La fila se busca por el botón que la despliega (su nombre lleva la remisión); el `has` va desde `page`.
    const desplegar = page.getByRole("button", { name: new RegExp(`^(Desglose de ingreso|Detalle) de la orden ${rechazada.numRemision} · `) });
    const fila = ordenes.locator("[data-gestion]").filter({ has: desplegar });
    await fila.getByRole("button", { name: new RegExp(`^(Desglose de ingreso|Detalle) de la orden ${rechazada.numRemision} · `) }).click();
    await fila.getByRole("button", { name: /^Ver evidencia/ }).click();
    const visor = page.getByRole("dialog", { name: "Evidencia de la gestión" });
    const foto = visor.getByRole("img");
    await expect(foto).toBeVisible();
    await expect.poll(() => foto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await visor.getByRole("button", { name: "Cerrar" }).first().click();

    // R43, R117: sin marca, «− Recibido» dice «—» (no ₡0) y nadie ha marcado.
    await irA(detalle, "Conciliación");
    await expect(montoDeCuenta(detalle, "Conciliación", "Debe llegar a la central")).toHaveText("₡7.000");
    await expect(montoDeCuenta(detalle, "Conciliación", "− Recibido")).toHaveText("—");
    await expect(montoDeCuenta(detalle, "Conciliación", "Falta por recibir")).toHaveText("₡7.000");
    await expect(detalle.getByRole("region", { name: "Conciliación", exact: true })).toContainText("Marcó: Aún nadie");

    // SLT-73 (R1): aprobar el cierre del día de la satélite no escribió nada en la caja.
    const delCierre = async () => (await movimientosCajaDe(r)).filter((mv) => mv.origenTipo === "cierre_dia");
    expect(await delCierre()).toEqual([]);

    // R112: «Marcar recibido» en el pie del detalle único.
    await detalle.locator("footer").getByRole("button", { name: /^Marcar recibido la consolidación de / }).click();
    const marcar = page.getByRole("dialog", { name: "Marcar recibido" });
    // SLT-73 (R8): la precarga es `paraLaCentral` = 9.000 − 1.500 − 500 = 7.000 (cuenta en la cabecera).
    await expect(marcar.getByLabel("Monto recibido")).toHaveValue(/^7000(\.00)?$/);
    await marcar.getByRole("button", { name: "Marcar recibido" }).click();
    await expect(page.getByText(/^Marcada como recibida por /)).toContainText(importe(7000));
    // R112: marcar cierra el detalle y relee las listas.
    await expect(detalle).toHaveCount(0);

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

  test("3 — ya marcada: «Conciliación» con lo recibido, sin «Desmarcar» y sigue en resueltos", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await pestanaBodega(page);
    const modulo = page.getByRole("region", { name: "Cierres de bodega satélite" });
    await modulo.getByRole("group", { name: "Cierres de bodega por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await modulo.getByRole("button", { name: `Ver el cierre de bodega resuelto de ${r.zonaSatelite.nombre}` }).click();
    const detalle = detalleDeBodega(page);
    // Control: el detalle está cargado (con sus cifras) antes de afirmar una ausencia. Las cifras no cambian al marcar.
    await cifrasYDinero(detalle);

    // R43, R117: marcada por 7.000 → recibido 7.000, falta 0, y quién marcó.
    await irA(detalle, "Conciliación");
    await expect(montoDeCuenta(detalle, "Conciliación", "Debe llegar a la central")).toHaveText("₡7.000");
    await expect(montoDeCuenta(detalle, "Conciliación", "− Recibido")).toHaveText("₡7.000");
    await expect(montoDeCuenta(detalle, "Conciliación", "Falta por recibir")).toHaveText("₡0");
    await expect(detalle.getByRole("region", { name: "Conciliación", exact: true })).toContainText(
      `Marcó: ${r.empresa.maestro.nombre} · `,
    );

    const antes = await movimientosCajaDe(r);
    // SLT-76 (R3/R4): la marca asentó el dinero (paso 2), así que el servidor la da por NO
    // desmarcable y la pantalla no ofrece una acción que se iba a rechazar con `con_asientos`.
    // Recibida por lo esperado (7.000 de 7.000): tampoco «Corregir» ni «Marcar recibido» (R111: solo lectura).
    await expect(detalle.getByRole("button", { name: /^Desmarcar la consolidación de / })).toHaveCount(0);
    await expect(detalle.getByRole("button", { name: /^(Corregir el monto recibido|Marcar recibido la consolidación) / })).toHaveCount(0);
    expect(await detalle.locator("footer").getByRole("button").allTextContents()).toEqual(["Cerrar"]);

    // Ni la marca ni ningún libro cambian.
    const [c] = await consolidacionDeLaZona();
    expect([c.estado, String(c.montoRecibido)]).toEqual(["aprobado", "7000"]);
    expect(c.conciliadoAt).not.toBeNull();
    expect(await movimientosCajaDe(r)).toEqual(antes);
    await page.keyboard.press("Escape");
    await modulo.getByRole("group", { name: "Cierres de bodega por estado" }).getByRole("button", { name: /^Resueltos/ }).click();
    await expect(
      modulo.getByRole("button", { name: `Ver el cierre de bodega resuelto de ${r.zonaSatelite.nombre}` }),
    ).toBeVisible();
  });
});
