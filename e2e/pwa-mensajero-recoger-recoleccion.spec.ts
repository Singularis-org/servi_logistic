import { expect, test, type Locator, type Page } from "@playwright/test";

import { conEmpresa } from "../lib/db/contexto-empresa";
import { crearTarifaSchema } from "../lib/types/tarifa";
import { crearUsuarioE2E } from "../tests/fabricas/e2e";
import { actorDe, exigirOk, servicios } from "../tests/fabricas/escenarios/reparto";
import {
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
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
  DIRECCION_LARGA,
  IMPORTE_LARGO,
  PRODUCTO_LARGO,
  TIENDA_LARGA,
  sinDesborde,
  sinElipsis,
  tactil,
} from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-164 «PWA del mensajero: Recoger en bodega y Recolección», rebanada C de SLT-156 «PWA de
 * los mensajeros: tablas usables en el móvil» (C3; R490, R492, R493, R496, R500, R501, R517-R522).
 *
 *  (a) Recoger en bodega a 360 y 414 px con la orden de datos más largos (destinatario de 80
 *      caracteres con una palabra de 40, dirección de 200, producto de 120, tienda de 60, ₡99 999 999):
 *      «Escanear o escribir guía» (44 px, a todo el ancho) → barra → pestañas (44 px) de arriba abajo;
 *      ni el documento ni ningún dato se sale; ninguna tarjeta recorta con «…», en Mosaico ni en
 *      Detalle (fila desplegada: dirección entera); el importe, en una línea.
 *  (b) Recolección a 360 y 414 px, igual de larga: el escáner recolecta (R522) dos guías seguidas con
 *      Enter sin cerrar el diálogo (SLT-168, R595: dos filas «Recogida en tienda») y, al cerrar, las órdenes
 *      pasan a «Recogidos en tienda hoy»; orden escáner → barra → «Por recolectar en
 *      tienda» → «Recogidos en tienda hoy»; sin desborde ni «…» en las dos listas, en Mosaico y en
 *      Detalle; importes en una línea; la búsqueda filtra las DOS listas (R520) y la que se queda sin
 *      coincidencias dice «Ninguna guía por recolectar coincide con la búsqueda.» (R521).
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`, tienda con bodega propia y nombre largo) y, para
 * Recolección, una SEGUNDA tienda de la misma empresa que se recoge en tienda (`seRecogeEnTienda`),
 * con su tarifa: sus órdenes nacen `por_recolectar_en_tienda` con guía y el maestro las asigna con
 * `asignarRecoleccion`, por los servicios reales. Cada caso, con SU mensajero. Sin datos, los
 * `expect` fallan: no se salta nada.
 */

let r: RepartoE2E;
/** El escenario con la tienda que se recoge en tienda como dueña de las órdenes nuevas. */
let rTiendaRecoge: RepartoE2E;

const RECOGER = "/mis-asignaciones/recoger";
const RECOLECCION = "/recoleccion";
const VACIO_BUSQUEDA_RECOLECCION = "Ninguna guía por recolectar coincide con la búsqueda.";

/** La barra fija de `BuscadorFiltros` (su raíz `sticky`), por su campo de búsqueda. */
function barra(page: Page): Locator {
  return page.locator(".sticky").filter({ has: page.getByRole("searchbox", { name: "Buscar guías" }) }).last();
}

/**
 * `scrollY` una vez asentado: espera a que dos frames seguidos lean el mismo valor (sin tiempos fijos).
 */
async function scrollAsentado(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolver) => {
        let previo = window.scrollY;
        const mirar = () => {
          requestAnimationFrame(() => {
            if (window.scrollY === previo) resolver(previo);
            else {
              previo = window.scrollY;
              mirar();
            }
          });
        };
        mirar();
      }),
  );
}

async function cajaDe(l: Locator) {
  const caja = await l.boundingBox();
  expect(caja, "sin caja (¿está visible?)").not.toBeNull();
  return caja!;
}

/** `true` si `a` empieza más arriba que `b` en la pantalla. */
async function encimaDe(a: Locator, b: Locator): Promise<boolean> {
  return (await cajaDe(a)).y < (await cajaDe(b)).y;
}

/**
 * Los importes visibles de la región (texto con «99» y separadores) que ocupan MÁS de una línea. Se
 * mide el texto con un `Range`: una línea = todas sus cajas a la misma altura.
 */
async function importesPartidos(region: Locator): Promise<string[]> {
  return region.evaluateAll((raices) => {
    const out: string[] = [];
    for (const raiz of raices) {
      const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let n = andador.nextNode(); n; n = andador.nextNode()) {
        const texto = (n.textContent ?? "").trim();
        if (!/99\D?999\D?999/.test(texto)) continue;
        const rango = document.createRange();
        rango.selectNodeContents(n);
        const cajas = Array.from(rango.getClientRects()).filter((c) => c.width > 0);
        if (cajas.length === 0) continue;
        if (new Set(cajas.map((c) => Math.round(c.top))).size > 1) out.push(texto);
      }
    }
    return out;
  });
}

/** Cuántos importes largos visibles hay (para que `importesPartidos` no salga verde vacío). */
async function importesVisibles(region: Locator): Promise<number> {
  return region.evaluateAll((raices) =>
    raices.reduce((total, raiz) => {
      const andador = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let n = 0;
      for (let t = andador.nextNode(); t; t = andador.nextNode()) {
        if (!/99\D?999\D?999/.test((t.textContent ?? "").trim())) continue;
        const rango = document.createRange();
        rango.selectNodeContents(t);
        if (Array.from(rango.getClientRects()).some((c) => c.width > 0)) n++;
      }
      return total + n;
    }, 0),
  );
}

async function importesEnUnaLinea(region: Locator): Promise<void> {
  expect(await importesVisibles(region), "no hay ningún importe largo a la vista").toBeGreaterThan(0);
  expect(await importesPartidos(region)).toEqual([]);
}

/** Pasa a Detalle por el primer conmutador y espera a que se vaya el carrusel `carrusel`. */
async function aDetalle(page: Page, carrusel: string): Promise<void> {
  const conmutador = page.getByRole("group", { name: "Vista de las órdenes" }).first();
  await conmutador.getByRole("button", { name: /Detalle/ }).click();
  await expect(conmutador.getByRole("button", { name: /Detalle/ })).toHaveAttribute("aria-pressed", "true");
  // El cambio de vista va animado: hasta que se va el carrusel, las tarjetas de Mosaico siguen ahí.
  await expect(page.getByRole("region", { name: carrusel })).toHaveCount(0);
}

/** Despliega la fila compacta de la tarjeta con `texto` y comprueba que la dirección se lee entera. */
async function desplegarFila(page: Page, texto: string): Promise<void> {
  const fila = page.locator("article").filter({ hasText: texto }).first();
  // La fila compacta es el botón hijo directo de la tarjeta (dentro hay otros desplegables).
  const disparador = fila.locator(":scope > button[aria-expanded]");
  await expect(disparador).toHaveAttribute("aria-expanded", "false");
  await tactil(disparador);
  await disparador.click();
  await expect(disparador).toHaveAttribute("aria-expanded", "true");
  await expect(fila.getByText(DIRECCION_LARGA).first()).toBeVisible();
}

function datosLargos() {
  return {
    destinatario: DESTINATARIO_LARGO,
    montoCobrar: IMPORTE_LARGO,
    direccion: DIRECCION_LARGA,
    producto: PRODUCTO_LARGO,
  };
}

/** Una orden de la tienda que se recoge en tienda, asignada a `m` para recolectar (`recolectando`). */
async function porRecolectar(
  m: MensajeroE2E,
  o: { destinatario: string; montoCobrar?: number; direccion?: string; producto?: string },
): Promise<OrdenE2E> {
  const orden = await crearOrden(rTiendaRecoge, { zona: "satelite", montoCobrar: 5000, ...o });
  expect(orden.numGuia, "la orden de una tienda que se recoge en tienda nace con guía").not.toBeNull();
  const s = servicios();
  exigirOk(
    "asignarRecoleccion",
    await conEmpresa(r.empresa.organizacionId, () =>
      s.guia.asignarRecoleccion({ ordenIds: [orden.id], mensajeroId: m.id }, r.actores.maestro),
    ),
  );
  return orden;
}

test.describe("SLT-164 — Recoger en bodega y Recolección en el móvil", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("pwa-mensajero-recoger-recoleccion", { nombreTienda: TIENDA_LARGA });
    // La segunda tienda, de la misma empresa: se recoge en tienda y lleva su propia tarifa.
    const tienda = await crearUsuarioE2E(r.empresa, "adminTienda", { nombre: TIENDA_LARGA, seRecogeEnTienda: true });
    const tarifa = crearTarifaSchema.parse({
      tiendaId: tienda.id,
      valorFlete: 2500,
      valorFleteDevuelto: 1250,
      valorFleteGam: 2000,
      valorFleteDevueltoGam: 1000,
      comisionCod: 0,
      ivaFlete: 0,
      ivaComisionCod: 0,
    });
    exigirOk(
      "TarifaService.crear",
      await conEmpresa(r.empresa.organizacionId, () => servicios().tarifa.crear(tarifa, r.actores.maestro)),
    );
    rTiendaRecoge = { ...r, tienda, actores: { ...r.actores, tienda: actorDe(r.empresa, tienda, "adminTienda", null) } };
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) Recoger en bodega a ${ancho} px: escáner → barra → pestañas, 44 px y ningún dato fuera ni con «…»`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      await llevarA(r, await crearOrden(r, { zona: "satelite", ...datosLargos() }), "mensajero_recogiendo_en_bodega", { mensajero: m });
      await llevarA(r, await crearOrden(r, { zona: "satelite", destinatario: "Beto Ruiz", montoCobrar: 4000 }), "mensajero_recogiendo_en_bodega", { mensajero: m });

      const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(RECOGER);

      // R500, R518: el disparador, bajo el encabezado y encima de la barra; la barra, encima de las pestañas.
      const escaner = page.getByRole("button", { name: "Escanear o escribir guía" });
      await expect(escaner).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const tablist = page.getByRole("tablist", { name: "Grupos de órdenes para recoger" });
      await expect(tablist).toBeVisible();
      expect(await encimaDe(escaner, barra(page))).toBe(true);
      expect(await encimaDe(barra(page), tablist)).toBe(true);
      // R493: el disparador, a todo el ancho de la barra; él y las pestañas, de 44 px.
      await tactil(escaner);
      expect(Math.abs((await cajaDe(escaner)).width - (await cajaDe(barra(page))).width)).toBeLessThanOrEqual(1);
      for (const pestana of await tablist.getByRole("tab").all()) await tactil(pestana);

      // R517: Mosaico de entrada; la tarjeta larga, entera.
      await expect(page.getByRole("region", { name: "Órdenes para recoger" })).toBeVisible();
      const tarjeta = page.locator("article").filter({ hasText: DESTINATARIO_LARGO }).first();
      await expect(tarjeta.getByText(DESTINATARIO_LARGO, { exact: true }).first()).toBeVisible();
      await expect(tarjeta.getByText(PRODUCTO_LARGO, { exact: true }).first()).toBeVisible();
      await sinDesborde(page);
      await sinElipsis(page.locator("article"));
      await importesEnUnaLinea(page.locator("article"));

      // R517: en Detalle, la fila compacta de Reparto; desplegada, la dirección entera.
      await aDetalle(page, "Órdenes para recoger");
      await desplegarFila(page, DESTINATARIO_LARGO);
      await sinDesborde(page);
      await sinElipsis(page.locator("article"));
      await importesEnUnaLinea(page.locator("article"));
    });
  }

  for (const ancho of ANCHOS_MOVIL) {
    test(`(b) Recolección a ${ancho} px: recolecta por el escáner, orden de arriba abajo, búsqueda en las dos listas, sin desborde ni «…»`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      await porRecolectar(m, datosLargos());
      await porRecolectar(m, { destinatario: "Beto Ruiz", montoCobrar: 4000 });
      const aRecolectar = await porRecolectar(m, { ...datosLargos(), destinatario: `Carla Mora ${DESTINATARIO_LARGO}` });
      // SLT-168 (R595): la segunda guía de la tanda seguida.
      const otraARecolectar = await porRecolectar(m, { destinatario: "Dora Soto", montoCobrar: 3000 });

      const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(RECOLECCION);

      const seccionPor = page.getByRole("region", { name: "Por recolectar en tienda", exact: true });
      const seccionHoy = page.getByRole("region", { name: "Recogidos en tienda hoy", exact: true });
      await expect(seccionPor.getByText("4 paquetes por recolectar en tienda.")).toBeVisible();

      // R522: el escáner recolecta con el mismo resultado. SLT-168 (R595, R596, R833): dos guías
      // seguidas con Enter, el diálogo sigue abierto con su título y cada una es una fila «Recogida en tienda».
      const escaner = page.getByRole("button", { name: "Escanear o escribir guía" });
      await tactil(escaner);
      await escaner.click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo.getByText("Recolectar en tienda", { exact: true })).toBeVisible();
      const campo = dialogo.getByRole("textbox");
      await campo.fill(String(aRecolectar.numGuia));
      await campo.press("Enter");
      await campo.fill(String(otraARecolectar.numGuia));
      await campo.press("Enter");
      const lecturas = dialogo.getByRole("log", { name: "Lecturas" });
      for (const orden of [aRecolectar, otraARecolectar]) {
        await expect(
          lecturas
            .getByRole("listitem")
            .filter({ hasText: String(orden.numGuia) })
            .getByText("Recogida en tienda", { exact: true }),
        ).toBeVisible();
      }
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByText("Recolectar en tienda", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialogo).toHaveCount(0);
      // R598: al cerrar, la lista se relee una vez.
      await expect(seccionHoy.getByText("2 paquetes recogidos en tienda hoy.")).toBeVisible();
      await expect(seccionPor.getByText("2 paquetes por recolectar en tienda.")).toBeVisible();

      // R500, R519: escáner → barra → «Por recolectar en tienda» → «Recogidos en tienda hoy».
      expect(await encimaDe(escaner, barra(page))).toBe(true);
      expect(await encimaDe(barra(page), seccionPor)).toBe(true);
      expect(await encimaDe(seccionPor, seccionHoy)).toBe(true);
      expect(Math.abs((await cajaDe(escaner)).width - (await cajaDe(barra(page))).width)).toBeLessThanOrEqual(1);

      // R517: Mosaico de entrada en las dos listas; nada fuera, nada con «…», importes en una línea.
      await expect(page.getByRole("region", { name: "Órdenes por recolectar" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Paquetes recogidos en tienda hoy" })).toBeVisible();
      await expect(seccionHoy.getByText(`Carla Mora ${DESTINATARIO_LARGO}`, { exact: true }).first()).toBeVisible();
      await sinDesborde(page);
      await sinElipsis(seccionPor);
      await sinElipsis(seccionHoy);
      await importesEnUnaLinea(seccionPor);
      await importesEnUnaLinea(seccionHoy);

      // R517: Detalle con la fila compacta en las dos listas.
      await aDetalle(page, "Órdenes por recolectar");
      await expect(page.getByRole("region", { name: "Paquetes recogidos en tienda hoy" })).toHaveCount(0);
      await desplegarFila(page, DESTINATARIO_LARGO);
      await desplegarFila(page, `Carla Mora ${DESTINATARIO_LARGO}`);
      await sinDesborde(page);
      await sinElipsis(seccionPor);
      await sinElipsis(seccionHoy);
      await importesEnUnaLinea(seccionPor);
      await importesEnUnaLinea(seccionHoy);

      // R520, R521: la búsqueda filtra las DOS listas; la que se queda vacía lo dice, y las
      // cabeceras siguen contando el día entero.
      await page.getByRole("searchbox", { name: "Buscar guías" }).fill("Carla Mora");
      await expect(seccionPor.getByText(VACIO_BUSQUEDA_RECOLECCION)).toBeVisible();
      await expect(seccionHoy.locator("article")).toHaveCount(1);
      await expect(seccionPor.getByText("2 paquetes por recolectar en tienda.")).toBeVisible();
      await page.getByRole("searchbox", { name: "Buscar guías" }).fill("Beto Ruiz");
      await expect(seccionPor.locator("article")).toHaveCount(1);
      await expect(seccionHoy.getByText(VACIO_BUSQUEDA_RECOLECCION)).toBeVisible();
      await expect(seccionHoy.getByText("2 paquetes recogidos en tienda hoy.")).toBeVisible();
      await sinDesborde(page);
    });
  }

  // ===============================================================================================
  // SLT-190 «Recoger y Recolección según el canvas» (T6): (a) la barra con el filtro «Tienda» puesto y
  // el conmutador no desborda a 360/414 px y sus controles miden 44 px (R852, R861); (b) el conmutador
  // sigue pegado arriba al bajar (R861); (c) el diálogo lleva la barra con el título y un «Cerrar» de
  // 44 × 44 (R867-R869); (d) la fila plegada de Recolección muestra el estado y, en «Recogidos en
  // tienda hoy», la hora (R862, R863).
  // ===============================================================================================
  for (const ancho of ANCHOS_MOVIL) {
    test(`SLT-190 Recolección a ${ancho} px: filtro «Tienda» y conmutador en la barra, pegados al bajar; diálogo con barra; fila plegada con estado y hora`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      const aRecolectar = await porRecolectar(m, { destinatario: "Elena Campos", montoCobrar: 3000 });
      for (const nombre of ["Fabio Ureña", "Gina Porras", "Hugo Chaves", "Irene Mata", "Jorge Leiva"]) {
        await porRecolectar(m, { ...datosLargos(), destinatario: `${nombre} ${DESTINATARIO_LARGO}` });
      }

      const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(RECOLECCION);
      const seccionPor = page.getByRole("region", { name: "Por recolectar en tienda", exact: true });
      const seccionHoy = page.getByRole("region", { name: "Recogidos en tienda hoy", exact: true });
      await expect(seccionPor.getByText("6 paquetes por recolectar en tienda.")).toBeVisible();

      // (c) R868, R869: la barra del diálogo con «Recolectar en tienda» y un solo «Cerrar» de 44 × 44.
      const escaner = page.getByRole("button", { name: "Escanear o escribir guía" });
      await escaner.click();
      const dialogo = page.getByRole("dialog", { name: "Recolectar en tienda" });
      await expect(dialogo).toBeVisible();
      await expect(dialogo.getByText("Escanea o ingresa el número de guía")).toHaveCount(0);
      const cerrar = dialogo.getByRole("button", { name: "Cerrar" });
      await expect(cerrar).toHaveCount(1);
      await tactil(cerrar);
      expect(await encimaDe(dialogo.getByText("Recolectar en tienda", { exact: true }), dialogo.getByRole("textbox", { name: "Número de guía", exact: true }))).toBe(true);
      const campo = dialogo.getByRole("textbox");
      await campo.fill(String(aRecolectar.numGuia));
      await campo.press("Enter");
      await expect(
        dialogo.getByRole("log", { name: "Lecturas" }).getByText("Recogida en tienda", { exact: true }),
      ).toBeVisible();
      await cerrar.click();
      await expect(dialogo).toHaveCount(0);
      await expect(seccionHoy.getByText("1 paquete recogido en tienda hoy.")).toBeVisible();

      // (a) R852, R861: el filtro «Tienda» puesto y el conmutador, en la barra, a 44 px y sin desborde.
      await barra(page).getByRole("button", { name: /^Filtros/ }).click();
      await page.getByRole("listbox", { name: "Filtros" }).getByRole("option", { name: "Tienda" }).click();
      await page.keyboard.press("Escape");
      const control = barra(page).getByRole("combobox", { name: "Filtrar por tienda" });
      await control.click();
      await page.getByRole("listbox").getByRole("option", { name: TIENDA_LARGA }).click();
      await expect(control).toContainText(`Tienda: ${TIENDA_LARGA}`);
      await expect(barra(page).getByRole("button", { name: /^Filtros \(1\)/ })).toBeVisible();
      const conmutador = barra(page).getByRole("group", { name: "Vista de las órdenes" });
      await expect(page.getByRole("group", { name: "Vista de las órdenes" })).toHaveCount(1);
      for (const c of [
        control,
        barra(page).getByRole("button", { name: "Limpiar todo" }),
        conmutador.getByRole("button", { name: /Mosaico/ }),
        conmutador.getByRole("button", { name: /Detalle/ }),
      ]) {
        await tactil(c);
      }
      await sinDesborde(page);

      // (d) R862, R863: en Detalle, la fila plegada lleva la tienda y el estado; en «Recogidos hoy»,
      // además la hora.
      await aDetalle(page, "Órdenes por recolectar");
      const filaPor = seccionPor.locator("article").first().locator(":scope > button[aria-expanded]");
      await expect(filaPor).toHaveAttribute("aria-expanded", "false");
      await expect(filaPor).toContainText(TIENDA_LARGA);
      await expect(filaPor).toContainText(/Orden 1 de \d/);
      // B1 (decisión de Carlos, 2026-11-17): el estado va plegado con su (i), FUERA del botón de la
      // fila (como la fila del chat); el área táctil del (i) es su `::after`, de 44 × 44.
      const tarjetaPor = seccionPor.locator("article").first();
      await expect(tarjetaPor).toContainText("Recolectando");
      await expect(filaPor).not.toContainText("Recolectando");
      const infoPor = tarjetaPor.getByRole("button", { name: "Qué significa «Recolectando»" });
      await expect(infoPor).toBeVisible();
      const zona = await infoPor.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el, "::after");
        return {
          ancho: r.width - parseFloat(cs.left) - parseFloat(cs.right),
          alto: r.height - parseFloat(cs.top) - parseFloat(cs.bottom),
        };
      });
      expect(zona.ancho).toBeGreaterThanOrEqual(44);
      expect(zona.alto).toBeGreaterThanOrEqual(44);
      await infoPor.click();
      await expect(filaPor).toHaveAttribute("aria-expanded", "false");
      await page.keyboard.press("Escape");
      const filaHoy = seccionHoy.locator("article").first().locator(":scope > button[aria-expanded]");
      await expect(filaHoy).toContainText(new RegExp(`${TIENDA_LARGA} · Recogido a las \\d`));
      await sinDesborde(page);
      await sinElipsis(seccionPor);
      await sinElipsis(seccionHoy);

      // (b) R861: al bajar, la barra —con el conmutador— sigue pegada arriba.
      // Se mide con el scroll ASENTADO (mismo `scrollY` dos frames seguidos) y se reintenta el bloque
      // entero: en CI la caja se leía antes de que el scroll y la barra fija se asentaran (283 px,
      // flaky). Lo comprobado no cambia: la página bajó y el conmutador queda en el tercio de arriba.
      await expect(async () => {
        await page.evaluate(() => window.scrollTo({ top: 900, behavior: "instant" }));
        expect(await scrollAsentado(page)).toBeGreaterThan(0);
        await expect(conmutador).toBeVisible();
        const caja = await cajaDe(conmutador);
        expect(caja.y).toBeGreaterThanOrEqual(0);
        expect(caja.y).toBeLessThan(ALTO_MOVIL / 3);
      }).toPass({ timeout: 10_000 });
    });
  }

  // SLT-194 «Buscar escaneando en recolección, devoluciones y rechazos» (R945, R941, D2): a 360 px la
  // barra con la cámara del buscador no desborda y «Escanear con cámara» mide 44 × 44; lo leído por
  // la pistola (Enter) filtra y no recolecta.
  test("SLT-194 Recolección a 360 px: la barra con la cámara no desborda, cámara de 44 × 44 y Enter solo filtra", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const buscada = await porRecolectar(m, { destinatario: "Lidia Soto", montoCobrar: 3000 });
    await porRecolectar(m, { destinatario: "Mario Brenes", montoCobrar: 3000 });

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto(RECOLECCION);
    const seccionPor = page.getByRole("region", { name: "Por recolectar en tienda", exact: true });
    await expect(seccionPor.getByText("2 paquetes por recolectar en tienda.")).toBeVisible();

    // R945: la barra no desborda en horizontal y la cámara mide al menos 44 × 44.
    const camara = barra(page).getByRole("button", { name: "Escanear con cámara" });
    await expect(camara).toBeVisible();
    const caja = await cajaDe(camara);
    expect(caja.width).toBeGreaterThanOrEqual(44);
    expect(caja.height).toBeGreaterThanOrEqual(44);
    const medidas = await barra(page).evaluate((el) => ({ scroll: el.scrollWidth, cliente: el.clientWidth }));
    expect(medidas.scroll).toBeLessThanOrEqual(medidas.cliente);
    await sinDesborde(page);

    // R941, D2: la guía + Enter filtra «Por recolectar» y la orden sigue sin recolectar.
    const campo = barra(page).getByRole("searchbox", { name: "Buscar guías" });
    await campo.fill(String(buscada.numGuia));
    await campo.press("Enter");
    await expect(campo).toHaveValue(String(buscada.numGuia));
    await expect(seccionPor.getByText("Mario Brenes")).toHaveCount(0);
    // La card pinta el destinatario dos veces (cabecera y detalle): se comprueba la TARJETA, que es
    // una sola y es la de Lidia Soto.
    const tarjetas = seccionPor.locator("article");
    await expect(tarjetas).toHaveCount(1);
    await expect(tarjetas).toBeVisible();
    await expect(tarjetas).toContainText("Lidia Soto");
    await expect(seccionPor.getByText("2 paquetes por recolectar en tienda.")).toBeVisible();
  });

  test("SLT-190 Recoger a 360 px: conmutador en la barra y diálogo con barra «Recoger paquete» y «Cerrar» de 44 × 44", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    await llevarA(r, await crearOrden(r, { zona: "satelite", destinatario: "Karla Mena", montoCobrar: 4000 }), "mensajero_recogiendo_en_bodega", { mensajero: m });

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto(RECOGER);

    // R859: el conmutador está en la barra; la fila de las pestañas no lleva ninguno.
    await expect(page.getByRole("group", { name: "Vista de las órdenes" })).toHaveCount(1);
    await expect(barra(page).getByRole("group", { name: "Vista de las órdenes" })).toBeVisible();
    await sinDesborde(page);

    // R867, R869: la barra del diálogo y un solo «Cerrar» de 44 × 44.
    await page.getByRole("button", { name: "Escanear o escribir guía" }).click();
    const dialogo = page.getByRole("dialog", { name: "Recoger paquete" });
    await expect(dialogo).toBeVisible();
    await expect(dialogo.getByText("Escanea o ingresa el número de guía")).toHaveCount(0);
    const cerrar = dialogo.getByRole("button", { name: "Cerrar" });
    await expect(cerrar).toHaveCount(1);
    await tactil(cerrar);
    await cerrar.click();
    await expect(dialogo).toHaveCount(0);
  });
});
