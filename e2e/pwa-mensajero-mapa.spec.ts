import { expect, test, type Browser, type Page } from "@playwright/test";

import {
  baseReparto,
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
 * E2E — SLT-166 «PWA del mensajero: mapa de ruta», rebanada E de SLT-156 «PWA de los mensajeros:
 * tablas usables en el móvil» (E4; R539-R544).
 *
 *  (a) R539, R541, R543, R544, R501: a 360 y 414 px, Reparto con el mapa abierto no desborda; el
 *      marcador de la parada activa se PINTA en Amarillo Señal (las variables de la paleta resuelven
 *      en el navegador, no solo en el HTML); «Mostrar mapa» / «Ocultar mapa» y «Ver mapa completo»
 *      miden ≥ 44 px; la pantalla completa ocupa la ventana con «Cerrar» y «Paradas 1 de 2» (la otra
 *      orden no tiene coordenadas: sigue en la lista y fuera del mapa) y «Cerrar» la devuelve.
 *  (b) R540: a 360 px, tocar el marcador abre la hoja con los datos largos enteros; «Navegar» abre
 *      «Abrir en:»; «Gestionar» → «Aceptar» lleva al modo foco de esa orden («Confirmar guía»).
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`), cada caso con SU mensajero y SUS órdenes, por los
 * servicios reales. La geocodificación no está configurada en las empresas del E2E
 * (`drenarGeocodificacion`), así que las coordenadas que el geocodificador dejaría en la orden se
 * escriben con el cliente dueño, como `cierre-bodega-satelite.spec.ts` escribe un nombre largo. Los
 * tiles de OpenStreetMap se sirven en local (un PNG vacío): el spec no depende de la red.
 */

let r: RepartoE2E;

const REPARTO = "/mis-asignaciones/reparto";
/** PNG de 1 × 1 transparente: el tile que se sirve en lugar del de OpenStreetMap. */
const TILE_VACIO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
/** Amarillo Señal y Negro Servi (`docs/marca.md`), como los devuelve `getComputedStyle`. */
const AMARILLO_SENAL = "rgb(255, 208, 0)";
const NEGRO_SERVI = "rgb(17, 17, 17)";

async function enReparto(
  m: MensajeroE2E,
  o: { destinatario: string; montoCobrar?: number; direccion?: string; producto?: string },
): Promise<OrdenE2E> {
  return llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 5000, ...o }), "en_reparto", { mensajero: m });
}

/** Lo que el geocodificador dejaría en la orden (San José, CR). */
async function conCoordenadas(o: OrdenE2E, latitud: number, longitud: number): Promise<void> {
  await baseReparto().orden.update({ where: { id: o.id }, data: { latitud, longitud } });
}

/** Una orden larga CON coordenadas (la del mapa) y otra SIN ellas (R543). */
async function dosOrdenes(m: MensajeroE2E): Promise<{ larga: OrdenE2E; sinCoordenadas: OrdenE2E }> {
  const larga = await enReparto(m, {
    destinatario: DESTINATARIO_LARGO,
    montoCobrar: IMPORTE_LARGO,
    direccion: DIRECCION_LARGA,
    producto: PRODUCTO_LARGO,
  });
  await conCoordenadas(larga, 9.9325, -84.0796);
  const sinCoordenadas = await enReparto(m, { destinatario: "Beto Ruiz", montoCobrar: 4000 });
  return { larga, sinCoordenadas };
}

async function abrirReparto(browser: Browser, m: MensajeroE2E, ancho: number): Promise<Page> {
  const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
  await page.route(/tile\.openstreetmap\.org/, (ruta) =>
    ruta.fulfill({ status: 200, contentType: "image/png", body: TILE_VACIO }),
  );
  await page.goto(REPARTO);
  return page;
}

test.describe("SLT-166 — mapa de ruta en el móvil", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("pwa-mensajero-mapa", { nombreTienda: TIENDA_LARGA });
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) R539, R541, R543, R544, R880, R882-R884: a ${ancho} px, mapa abierto sin desborde, marcadores con la paleta y pantalla completa`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      const { sinCoordenadas } = await dosOrdenes(m);
      const page = await abrirReparto(browser, m, ancho);

      // R544 + SLT-192 (R880, R884): el mapa arranca abierto con el rótulo «Mapa de ruta» a la
      // vista, y «Ocultar mapa» (44 px) es el único control del mapa y va DEBAJO del mapa.
      const grupo = page.getByRole("group", { name: "Mapa de ruta" });
      await expect(grupo).toBeVisible();
      await expect(grupo.getByText("Mapa de ruta", { exact: true })).toBeVisible();
      const alternar = page.getByRole("button", { name: /^(Ocultar mapa|Mostrar mapa)$/ });
      await expect(alternar).toHaveCount(1);
      const ocultar = grupo.getByRole("button", { name: "Ocultar mapa" });
      await expect(ocultar).toBeVisible();
      await tactil(ocultar);
      const cajaMapa = await grupo.locator(".leaflet-container").boundingBox();
      const cajaOcultar = await ocultar.boundingBox();
      expect(cajaOcultar!.y).toBeGreaterThanOrEqual(cajaMapa!.y + cajaMapa!.height);

      // R543: un solo marcador (la orden sin coordenadas no está en el mapa) y su tarjeta sí.
      const marcadores = page.locator(".leaflet-marker-icon");
      await expect(marcadores).toHaveCount(1);
      await expect(page.getByRole("article", { name: new RegExp(`Orden ${sinCoordenadas.numRemision}`) })).toHaveCount(1);

      await expect(grupo.getByRole("list", { name: "Leyenda del mapa" })).toHaveText(/Siguiente.*Pendiente.*Gestionada.*Tú/);

      // R501: con el mapa abierto, nada se sale.
      await sinDesborde(page);
      await sinElipsis(grupo);

      // R541: pantalla completa en el mismo contenedor.
      const verCompleto = page.getByRole("button", { name: "Ver mapa completo" });
      await tactil(verCompleto);
      await verCompleto.click();
      const completo = page.getByRole("dialog", { name: "Mapa de ruta a pantalla completa" });
      await expect(completo).toBeVisible();
      const caja = await completo.boundingBox();
      expect(caja).toEqual({ x: 0, y: 0, width: ancho, height: ALTO_MOVIL });
      await expect(completo.getByText("Paradas 1 de 2")).toBeVisible();
      // SLT-192 (R886): a pantalla completa no hay «Ocultar mapa».
      await expect(page.getByRole("button", { name: "Ocultar mapa" })).toHaveCount(0);
      await tactil(completo.getByRole("button", { name: "Cerrar" }));
      await tactil(completo.getByRole("button", { name: "Centrar en mi ubicación" }));
      // `invalidateSize`: el mapa crece con su contenedor (si no, se quedaría en las 288 px de la página).
      const mapa = completo.locator(".leaflet-container");
      await expect.poll(async () => (await mapa.boundingBox())?.height ?? 0).toBeGreaterThan(400);

      await completo.getByRole("button", { name: "Cerrar" }).click();
      await expect(completo).toHaveCount(0);
      await expect(verCompleto).toBeVisible();
      await sinDesborde(page);

      // SLT-192 (R882, R883, DC2): «Ocultar mapa» del pie lo pliega y «Mostrar mapa» (44 px) lo vuelve
      // a abrir. Este escenario tiene avisos de ruta (la orden sin coordenadas queda sin optimizar →
      // «ruta desactualizada»), así que «Mostrar mapa» va como hoy: en la fila del PRIMER aviso, fuera
      // del grupo «Mapa de ruta», cuyo rótulo sigue a la vista sin botón (R884).
      await ocultar.click();
      const avisoConMapa = page
        .getByRole("alert")
        .filter({ has: page.getByRole("button", { name: "Mostrar mapa" }) });
      await expect(avisoConMapa).toHaveCount(1);
      const mostrar = avisoConMapa.getByRole("button", { name: "Mostrar mapa" });
      await expect(mostrar).toBeVisible();
      await expect(grupo.getByRole("button", { name: "Mostrar mapa" })).toHaveCount(0);
      await expect(mostrar).toHaveAttribute("aria-expanded", "false");
      await expect(alternar).toHaveCount(1);
      await tactil(mostrar);
      await expect(page.locator(".leaflet-container")).toHaveCount(0);
      await expect(grupo.getByText("Mapa de ruta", { exact: true })).toBeVisible();
      await mostrar.click();
      await expect(grupo.getByRole("button", { name: "Ocultar mapa" })).toBeVisible();
      await expect(page.locator(".leaflet-marker-icon")).toHaveCount(1);

      // R539: el marcador de la tarjeta a la vista se pinta en Amarillo Señal (la variable existe).
      // Va al final: deslizar el carrusel mueve su pista, y `sinDesborde` mide la vista quieta.
      // R542: la parada activa es la de la tarjeta a la vista del carrusel. El orden de las dos
      // tarjetas lo decide el servidor, así que se pasa de tarjeta y el color tiene que cambiar.
      const circulo = page.locator(".leaflet-marker-icon").first().locator("div[aria-hidden]");
      const carrusel = page.getByRole("region", { name: "Órdenes en reparto" });
      const antes = await circulo.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect([AMARILLO_SENAL, NEGRO_SERVI]).toContain(antes);
      await carrusel.getByRole("button", { name: "Siguiente" }).click();
      await expect(circulo).toHaveCSS("background-color", antes === AMARILLO_SENAL ? NEGRO_SERVI : AMARILLO_SENAL);
      if (antes === AMARILLO_SENAL) await carrusel.getByRole("button", { name: "Anterior" }).click();
      // Con la tarjeta de la orden del mapa a la vista, su marcador es Amarillo Señal (la variable existe).
      await expect(circulo).toHaveCSS("background-color", AMARILLO_SENAL);
    });
  }

  test("(b) R540, R889, R890: el marcador abre su hoja «Parada {n}»; Escape la cierra; «Navegar» y «Gestionar» → modo foco", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const { larga } = await dosOrdenes(m);
    const page = await abrirReparto(browser, m, 360);

    // SLT-192 (R890): el nombre accesible es «Parada {n}» (o «Parada sin posición»), sin «de {total}».
    const hoja = page.getByRole("dialog", { name: /^Parada( \d+| sin posición)$/ });
    // SLT-192 (R889): sin botón «Cerrar»; Escape la cierra y vuelve al mapa.
    await page.locator(".leaflet-marker-icon").first().click();
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole("button", { name: "Cerrar" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(hoja).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Mapa de ruta" })).toBeVisible();

    // SLT-192 (R889): tocar fuera de la hoja (arriba de la ventana: la hoja se abre desde abajo y
    // ocupa como mucho el 60 % del alto) también la cierra.
    await page.locator(".leaflet-marker-icon").first().click();
    await expect(hoja).toBeVisible();
    await page.mouse.click(180, 10);
    await expect(hoja).toHaveCount(0);

    await page.locator(".leaflet-marker-icon").first().click();
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText(larga.numRemision, { exact: true })).toBeVisible();
    await expect(hoja.getByText(DESTINATARIO_LARGO, { exact: true })).toBeVisible();
    // SLT-192 (R888): la dirección va como «Cantón · Distrito — dirección», con el cantón y el
    // distrito de la zona satélite (la carga masiva pone la orden en ese distrito).
    const { canton, distrito } = r.zonaSatelite.geo;
    await expect(hoja.getByText(`${canton} · ${distrito} — ${DIRECCION_LARGA}`, { exact: true })).toBeVisible();
    await expect(hoja.getByText("Cobrar", { exact: true })).toBeVisible();
    await sinElipsis(hoja);
    const cajaHoja = await hoja.boundingBox();
    expect(cajaHoja!.x).toBeGreaterThanOrEqual(0);
    expect(cajaHoja!.x + cajaHoja!.width).toBeLessThanOrEqual(360);

    await tactil(hoja.getByRole("button", { name: "Arrastrar para ampliar la hoja" }));
    const navegar = hoja.getByRole("button", { name: "Navegar" });
    await tactil(navegar);
    await navegar.click();
    await expect(hoja.getByText("Abrir en:")).toBeVisible();

    const gestionar = hoja.getByRole("button", { name: `Gestionar la orden ${larga.numRemision}` });
    await tactil(gestionar);
    await gestionar.click();
    const confirmar = page.getByRole("dialog", { name: "¿Gestionar esta orden?" });
    await confirmar.getByRole("button", { name: "Aceptar" }).click();

    // El mismo modo foco que desde la tarjeta (R510): solo el panel de esa orden y «Confirmar guía».
    await expect(page.getByRole("dialog", { name: /^Parada/ })).toHaveCount(0);
    const panel = page.getByRole("region", { name: "Detalle de la orden" });
    await expect(panel.getByText(`Guía ${larga.numGuia}`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar guía" })).toHaveCount(1);
    await expect(page.getByRole("group", { name: "Mapa de ruta" })).toHaveCount(0);
  });
});
