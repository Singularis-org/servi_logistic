import { expect, test, type Page } from "@playwright/test";

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
import {
  ALTO_MOVIL,
  ANCHOS_MOVIL,
  DESTINATARIO_LARGO,
  IMPORTE_LARGO,
  sinDesborde,
  sinElipsis,
  sinSolapes,
  tactil,
} from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-165 «PWA del mensajero: Cierre del día en tarjetas» (rebanada D de SLT-156 «PWA de los
 * mensajeros: tablas usables en el móvil», D7; R501, R523, R526, R527, R530, R531, R533-R535, R537).
 *
 *  (a) R501, R523, R526, R527, R530, R531, R534: `/cierre-dia` a 360 y 414 px con 30 gestiones (una con
 *      el destinatario más largo y otra con el importe más ancho): «Gestiones» son tarjetas sin «…» ni
 *      datos montados, de 25 en 25 con `Pagination`; la barra de búsqueda queda arriba al bajar; nada
 *      desborda; el pie es una barra fija abajo con «Solicitar cierre del día 30 gestiones» (≥ 44 px)
 *      y el flotante «Reportar un problema» va encima de ella, sin solaparse.
 *  (b) R533, R535, R537: a 360 px, «Cancelar» del diálogo no envía; luego se solicita, el cierre sale
 *      en «Cierres solicitados» como tarjeta con «Ver», y «Ver» abre el detalle a pantalla completa con
 *      «Volver» de 44 px, que lo cierra.
 *
 *  SLT-191 «Cierre del día del mensajero según el canvas» (R810-R812, R818-R820, R822): en (a), la
 *  tarjeta de gestión pinta guía → destinatario → tienda y no muestra «Devolver a gestión» hasta
 *  desplegarla tocando su texto; en (b), el folio va en la fila, «Ver» solo tras desplegar (sin
 *  «Recaudado» ni «Pago») y la barra de la cola es `sticky` arriba. Con un solo cierre la cola no da
 *  para desplazar: la barra fija se comprueba por su estilo calculado, no por un desplazamiento.
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`), un mensajero por caso con SUS órdenes, gestionadas
 * por los servicios reales. El escenario solo deja fijar destinatario, remisión y monto
 * (`crearOrden`): la tienda, la dirección, el producto y el motivo de rechazo largos de
 * `design.md §12` y las listas «Rechazados por la tienda» y «Órdenes sin gestión» necesitan un
 * escenario que hoy no existe (lo cubren los tests de componente y la guardia). Sin datos, los
 * `expect` fallan: no se salta nada.
 */

let r: RepartoE2E;
let conTreinta: MensajeroE2E;

const DETALLE = "Detalle del cierre · Tu cierre del día";
const GESTIONES = "Órdenes del cierre";

async function entregada(m: MensajeroE2E, destinatario: string, monto: number): Promise<OrdenE2E> {
  const orden = await llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: monto, destinatario }), "en_reparto", {
    mensajero: m,
  });
  await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto }] });
  return orden;
}

/** La caja de un locator, que tiene que existir. */
async function caja(page: Page, nombre: string, l: ReturnType<Page["locator"]>) {
  const c = await l.boundingBox();
  expect(c, `sin caja para ${nombre}`).not.toBeNull();
  return c!;
}

test.describe("SLT-165 D — Cierre del día en tarjetas a 360 y 414 px", () => {
  test.beforeAll(async () => {
    test.setTimeout(600_000);
    r = await crearEscenarioReparto("pwa-mensajero-cierre-dia");
    conTreinta = await crearMensajero(r, "satelite");
    // El servidor da las gestiones de la más nueva a la más vieja (`CierreDiaRepository`,
    // `orderBy: { createdAt: "desc" }`): las dos de textos largos se crean AL FINAL para que caigan
    // en la página 1 de 25. Creadas primero, quedaban en la 2 y el test no las encontraba.
    for (let i = 0; i < 28; i++) await entregada(conTreinta, `Destinatario ${i + 3}`, 1000 + i);
    await entregada(conTreinta, "Beto Ruiz", IMPORTE_LARGO);
    await entregada(conTreinta, DESTINATARIO_LARGO, 2500);
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) R501, R523, R526, R527, R531, R534: /cierre-dia a ${ancho} px, tarjetas de 25 en 25 y barra fija`, async ({ browser }) => {
      const page = await paginaDe(browser, conTreinta, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto("/cierre-dia");

      // R523, R526: 25 tarjetas y la paginación.
      const lista = page.getByRole("region", { name: GESTIONES });
      await expect(lista.locator("[data-gestion]")).toHaveCount(25);
      const paginas = page.getByRole("navigation", { name: "Páginas de las gestiones" });
      await expect(paginas.getByText("1-25 de 30")).toBeVisible();

      // R490, R523: el destinatario largo, entero y visible; la ganancia en su columna.
      const larga = lista.locator("[data-gestion]").filter({ hasText: DESTINATARIO_LARGO });
      await expect(larga).toHaveCount(1);
      await expect(larga.getByText(DESTINATARIO_LARGO, { exact: true })).toBeVisible();
      await sinElipsis(lista);
      await sinSolapes(larga, "[data-columna]");
      // R523: la columna «Recibido» no se pinta en la tarjeta (va en el detalle desplegado).
      await expect(larga.locator('[data-columna="recibido"]')).toBeHidden();

      // SLT-191 (R810): la guía va encima del destinatario y este encima de la tienda; «Ganancia» a la derecha.
      const yDe = async (sel: string) => (await caja(page, sel, larga.locator(sel))).y;
      const [yGuia, yDest, yTienda] = [
        await yDe('[data-columna="guia"]'),
        await yDe('[data-columna="destinatario"]'),
        await yDe('[data-columna="tienda"]'),
      ];
      expect(yGuia).toBeLessThan(yDest);
      expect(yDest).toBeLessThan(yTienda);
      await expect(larga.getByText("Ganancia", { exact: true })).toBeVisible();
      // SLT-191 (R811, R812): sin «Devolver a gestión» plegada; se despliega tocando el TEXTO de la
      // tarjeta (el toque cae en el disparador estirado) y entonces aparece al pie.
      const devolver = larga.getByRole("button", { name: new RegExp(`^Devolver a gestión la orden .* · ${DESTINATARIO_LARGO}$`) });
      await expect(devolver).toHaveCount(0);
      const disparador = larga.locator("button[aria-expanded]").first();
      await expect(disparador).toHaveAttribute("aria-expanded", "false");
      await tactil(disparador);
      // `page.mouse.click` no desplaza: con la tarjeta bajo el pliegue (780 px) o bajo el pie fijo, el
      // toque caía fuera de ella. Se centra el texto en la ventana y se comprueba qué recibe el punto.
      const texto = larga.getByText(DESTINATARIO_LARGO, { exact: true });
      await texto.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const cajaTexto = await caja(page, "destinatario", texto);
      const punto = { x: cajaTexto.x + 8, y: cajaTexto.y + Math.min(cajaTexto.height / 2, 10) };
      expect(
        await page.evaluate(
          ({ x, y }) => (document.elementFromPoint(x, y)?.closest("[data-tarjeta-mensajero] > button") ?? null) !== null,
          punto,
        ),
        "el punto del texto lo recibe el disparador estirado",
      ).toBe(true);
      await page.mouse.click(punto.x, punto.y);
      await expect(disparador).toHaveAttribute("aria-expanded", "true");
      await expect(devolver).toBeVisible();
      await tactil(devolver);
      // Y se pliega con otro toque en la tarjeta.
      await disparador.click({ position: { x: 8, y: 8 } });
      await expect(disparador).toHaveAttribute("aria-expanded", "false");
      await expect(devolver).toHaveCount(0);

      // R501, R530: nada desborda (pestañas, barra, tarjetas, paginación).
      await sinDesborde(page);
      await sinDesborde(page, '[role="tablist"]');

      // R531: barra fija abajo, con el botón negro de 52 px a todo el ancho y su contador.
      const solicitar = page.getByRole("region", { name: DETALLE }).getByRole("button", { name: "Solicitar cierre del día 30 gestiones" });
      await expect(solicitar).toBeVisible();
      await tactil(solicitar);
      const cajaBoton = await caja(page, "Solicitar", solicitar);
      expect(Math.round(cajaBoton.height)).toBe(52);
      const pie = page.locator("footer").filter({ has: page.getByRole("button", { name: "Solicitar cierre del día 30 gestiones" }) });
      const cajaPie = await caja(page, "pie", pie);
      expect(Math.round(cajaPie.y + cajaPie.height)).toBe(ALTO_MOVIL);
      expect(Math.round(cajaPie.width)).toBe(ancho);

      // R534: el flotante va por encima de la barra, sin solaparse.
      const bug = page.getByRole("button", { name: "Reportar un problema" });
      await expect(bug).toBeVisible();
      // La barra publica su alto al hidratar (`--alto-barra-inferior`): se espera a que el flotante suba.
      await expect
        .poll(async () => {
          const c = await bug.boundingBox();
          return c ? c.y + c.height - cajaPie.y : Number.POSITIVE_INFINITY;
        }, { message: "el flotante se monta sobre la barra fija" })
        .toBeLessThanOrEqual(0.5);

      // R527: al bajar, la barra de búsqueda queda arriba.
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
      const buscar = page.getByRole("searchbox", { name: "Buscar gestión" });
      await expect(buscar).toBeVisible();
      await expect.poll(async () => Math.round((await buscar.boundingBox())?.y ?? -1)).toBeLessThan(60);
      await tactil(buscar);

      // R526: la página 2 trae las 5 restantes.
      await paginas.getByRole("button", { name: "Página siguiente" }).click();
      await expect(lista.locator("[data-gestion]")).toHaveCount(5);
      await expect(paginas.getByText("26-30 de 30")).toBeVisible();

      // R527: busca por destinatario y vuelve a la página 1.
      await buscar.fill("Beto Ruiz");
      await expect(lista.locator("[data-gestion]")).toHaveCount(1);
      await expect(paginas).toHaveCount(0);
      await sinDesborde(page);
    });
  }

  // B3 de la review de SLT-165: entre 768 y 1023 px (tableta) la rejilla de escritorio de «Gestiones»
  // no puede quedar recortada por `SidebarInset` (`overflow-x-clip`) con la barra lateral abierta.
  for (const ancho of [768, 900]) {
    test(`(c) R490, R524: /cierre-dia a ${ancho} px con la barra lateral abierta, «Gestiones» sin recortar`, async ({ browser }) => {
      const page = await paginaDe(browser, conTreinta, { viewport: { width: ancho, height: 900 } });
      await page.goto("/cierre-dia");
      // La barra lateral de escritorio, abierta (es la que deja menos ancho).
      await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toHaveCount(1);
      const lista = page.getByRole("region", { name: GESTIONES });
      // R524: desde 768 px, la rejilla de hoy con su cabecera, las 30 filas y sin paginación.
      await expect(lista.getByText("Ganancia", { exact: true })).toBeVisible();
      await expect(lista.locator("[data-gestion]")).toHaveCount(30);
      await expect(page.getByRole("navigation", { name: "Páginas de las gestiones" })).toHaveCount(0);
      await sinElipsis(lista);
      // Lo que no cabe se desplaza dentro del panel (scroll propio); nada lo recorta el inset.
      await sinDesborde(page);
      // Y lo que se desplaza llega: la última celda de la fila (acciones) se alcanza dentro del panel.
      const acciones = lista.locator("[data-gestion]").first().getByRole("button", { name: /^(Detalle|Desglose de ingreso) de la orden/ });
      await acciones.scrollIntoViewIfNeeded();
      await expect(acciones).toBeInViewport();
    });
  }

  test("(b) R533, R535, R537: «Cancelar» no envía; «Ver» abre el detalle a pantalla completa con «Volver»", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await entregada(m, DESTINATARIO_LARGO, 3000);
    await entregada(m, "Carla Mora", 2000);

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto("/cierre-dia");

    const solicitar = page.getByRole("region", { name: DETALLE }).getByRole("button", { name: "Solicitar cierre del día 2 gestiones" });
    await solicitar.click();
    const dialogo = page.getByRole("dialog", { name: "Solicitar cierre del día" });
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialogo).toBeHidden();
    // Nada se envió: el cierre de hoy sigue por solicitar y la cola, vacía.
    await expect(solicitar).toBeEnabled();
    await expect(page.getByRole("tab", { name: "Cierres solicitados (0)" })).toBeVisible();

    await solicitar.click();
    await dialogo.getByRole("button", { name: "Solicitar cierre" }).click();
    await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();

    // R535: la cola en tarjetas de dos columnas. SLT-191 (R818, R819): el folio en la fila y «Ver»
    // solo tras desplegar, a todo el ancho; R820: sin «Recaudado» ni «Pago» en el desplegado.
    const cola = page.getByRole("region", { name: "Cierres solicitados" });
    await expect(page.getByRole("tab", { name: "Cierres solicitados (1)" })).toBeVisible();
    await expect(cola.getByRole("columnheader", { name: "Cierre" })).toBeVisible();
    await expect(cola.getByRole("columnheader", { name: "Ganancia" })).toBeVisible();
    await expect(cola.getByRole("columnheader", { name: "Folio" })).toHaveCount(0);
    await expect(cola.getByText(/^#[0-9A-F]{8}$/)).toBeVisible();
    await expect(cola.getByText(/^Solicitado \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)).toBeVisible();
    await expect(cola.getByText(/^Destino: /)).toBeVisible();
    const ver = cola.getByRole("button", { name: /^Ver del cierre del \d{4}-\d{2}-\d{2}$/ });
    await expect(ver).toHaveCount(0);
    const masDatos = cola.getByRole("button", { name: /^Más datos del cierre del \d{4}-\d{2}-\d{2}$/ });
    await masDatos.click();
    await expect(ver).toBeVisible();
    await tactil(ver);
    await expect(cola.getByText("Recaudado", { exact: true })).toHaveCount(0);
    await expect(cola.getByText("Pago", { exact: true })).toHaveCount(0);
    // R822: la barra de la cola (buscador, «Filtros» y «Descargar») es fija arriba y no desborda.
    const barraCola = page.locator("[data-barra-cola]").filter({ has: page.getByPlaceholder("Busca por folio") });
    await expect(barraCola).toHaveCSS("position", "sticky");
    await expect(barraCola).toHaveCSS("top", "0px");
    await expect(barraCola.getByRole("button", { name: "Descargar Cierres solicitados" })).toBeVisible();
    await sinDesborde(page);

    // R537: pantalla completa, «Volver» de 44 px arriba, sin la X.
    await ver.click();
    const detalle = page.getByRole("dialog");
    await expect(detalle).toBeVisible();
    const cajaDetalle = await caja(page, "detalle", detalle);
    expect(Math.round(cajaDetalle.width)).toBe(360);
    expect(Math.round(cajaDetalle.height)).toBe(ALTO_MOVIL);
    const volver = detalle.getByRole("button", { name: "Volver" });
    await tactil(volver);
    await expect(detalle.locator('[data-slot="dialog-close"]')).toHaveCount(0);
    // Las tarjetas de R523 dentro del detalle (la pestaña «Gestiones»).
    await detalle.getByRole("tab", { name: /^Gestiones \(2\)$/ }).click();
    await expect(detalle.getByRole("region", { name: GESTIONES }).locator("[data-gestion]")).toHaveCount(2);
    await sinElipsis(detalle.getByRole("region", { name: GESTIONES }));
    await volver.click();
    await expect(detalle).toBeHidden();
  });
});
