import { expect, test, type Page } from "@playwright/test";

import {
  baseReparto,
  crearEscenarioReparto,
  crearOrden,
  llevarA,
  paginaDe,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";

/**
 * E2E — El filtro de lugar de `/ordenes` con los niveles del país (SLT-47 T6.1; R18, R23, R39).
 *
 * En una empresa de Costa Rica (las del escenario nacen con `paisId: "CR"`) el filtro de lugar son
 * las listas de los niveles del país: Provincia, Cantón y Distrito. Se filtra por UN cantón de tres
 * maneras y las tres tienen que dar las mismas guías, todas de ese cantón y ninguna del otro:
 *  (1) desde la barra: «Filtros» → «Cantón» → el cantón (R39);
 *  (2) con un enlace viejo, `/ordenes?canton_id=<id>`, que el traductor pasa a `nivel_2` (R18);
 *  (3) aplicando una vista guardada de la versión 1, con `canton_id` en la selección y en los
 *      controles montados, que `leerPayloadGuardado` traduce a la v2 al leerla (R23).
 *
 * DATOS (R7, R8 de SL-44): una empresa nueva por corrida (`crearEscenarioReparto`, nombres con
 * sufijo aleatorio), así que el spec es repetible y no limpia nada a mano. Sus dos zonas caen en
 * distritos de cantones DISTINTOS (`dosDistritos`): dos órdenes en el cantón de la central y una en
 * el de la satélite, llevadas a `en_bodega_central` por los servicios reales para que tengan guía.
 *
 * La vista v1 se escribe directamente en `vista_filtro`: hoy ningún servicio guarda la versión 1
 * (`vistaFiltroPayloadSchema` es `v: 2`), y la vista es justo lo que había guardado la barra
 * antes de esta ficha. Es del maestro de la empresa nueva y se va con ella.
 */

/** Las guías de la tabla «Órdenes», ordenadas. Espera a que la tabla tenga filas. */
async function guiasDeLaTabla(page: Page): Promise<number[]> {
  const tabla = page.getByRole("table", { name: "Órdenes" });
  const filas = tabla.getByRole("row").filter({ has: page.getByRole("checkbox", { name: /^Seleccionar orden / }) });
  await expect(filas.first()).toBeVisible();
  const remisiones = await filas
    .getByRole("checkbox", { name: /^Seleccionar orden / })
    .evaluateAll((casillas) => casillas.map((c) => c.getAttribute("aria-label")?.replace(/^Seleccionar orden /, "") ?? ""));
  return remisiones.map((rem) => {
    const o = todas.find((x) => x.numRemision === rem);
    if (!o?.numGuia) throw new Error(`la tabla enseña una orden que el spec no sembró: ${rem}`);
    return o.numGuia;
  }).sort((a, b) => a - b);
}

/** Espera a que la tabla enseñe EXACTAMENTE las órdenes del cantón elegido y ninguna del otro. */
async function soloDelCanton(page: Page): Promise<number[]> {
  const tabla = page.getByRole("table", { name: "Órdenes" });
  for (const o of delOtro) await expect(tabla.getByRole("row", { name: new RegExp(o.numRemision) })).toHaveCount(0);
  for (const o of delCanton) await expect(tabla.getByRole("row", { name: new RegExp(o.numRemision) })).toBeVisible();
  return guiasDeLaTabla(page);
}

let r: RepartoE2E;
let delCanton: OrdenE2E[];
let delOtro: OrdenE2E[];
let todas: OrdenE2E[];
let cantonId: string;
let nombreCanton: string;
const NOMBRE_VISTA = "Cantón de la central (v1)";
const esperadas = (): number[] => delCanton.map((o) => o.numGuia as number).sort((a, b) => a - b);
const resultados: Record<string, number[]> = {};

test.describe.serial("Filtro de lugar en /ordenes — barra, enlace viejo y vista v1", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("geo-filtro-lugar");
    const db = baseReparto();
    const [central, satelite] = await Promise.all([
      db.distrito.findUniqueOrThrow({ where: { id: r.zonaCentral.geo.distritoId }, select: { cantonId: true } }),
      db.distrito.findUniqueOrThrow({ where: { id: r.zonaSatelite.geo.distritoId }, select: { cantonId: true } }),
    ]);
    expect(central.cantonId, "las dos zonas del escenario caen en cantones distintos").not.toBe(satelite.cantonId);
    cantonId = central.cantonId;
    nombreCanton = r.zonaCentral.geo.canton;

    delCanton = [];
    for (let i = 0; i < 2; i++) delCanton.push(await llevarA(r, await crearOrden(r, { zona: "central" }), "en_bodega_central"));
    delOtro = [await llevarA(r, await crearOrden(r, { zona: "satelite" }), "en_bodega_central")];
    todas = [...delCanton, ...delOtro];

    // La vista como la guardaba la barra antes de SLT-47: claves por nivel con nombre propio.
    await db.vistaFiltro.create({
      data: {
        usuarioId: r.empresa.maestro.id,
        organizacionId: r.empresa.organizacionId,
        superficie: "ordenes",
        nombre: NOMBRE_VISTA,
        version: 1,
        filtro: { v: 1, termino: "", activos: ["canton_id"], seleccion: { canton_id: [cantonId] } },
      },
    });
  });

  test("sin filtro, la tabla enseña las órdenes de los dos cantones", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");
    await expect.poll(() => guiasDeLaTabla(page)).toEqual(todas.map((o) => o.numGuia as number).sort((a, b) => a - b));
  });

  test("(1) R39 — filtrar por el cantón desde la barra, con las listas de los niveles del país", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");
    const tabla = page.getByRole("table", { name: "Órdenes" });
    await expect(tabla.getByRole("row", { name: new RegExp(delOtro[0].numRemision) })).toBeVisible();

    await page.getByRole("button", { name: /^Filtros/ }).click();
    const selector = page.getByRole("listbox", { name: "Filtros" });
    // Las listas de lugar se rotulan con los niveles de Costa Rica.
    for (const nivel of ["Provincia", "Cantón", "Distrito"]) {
      await expect(selector.getByRole("option", { name: nivel, exact: true })).toBeVisible();
    }
    await selector.getByRole("option", { name: "Cantón", exact: true }).click();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /^Cantón:/ }).click();
    await page.getByLabel("Buscar en Cantón").fill(nombreCanton);
    await page.getByRole("listbox", { name: "Cantón" }).getByRole("option", { name: nombreCanton, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: `Cantón: ${nombreCanton}` })).toBeVisible();

    resultados.barra = await soloDelCanton(page);
    expect(resultados.barra).toEqual(esperadas());
  });

  test("(2) R18 — el enlace viejo `?canton_id=` da las mismas guías", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto(`/ordenes?canton_id=${cantonId}`);
    // El mismo control que en la barra, con la misma elección.
    await expect(page.getByRole("button", { name: `Cantón: ${nombreCanton}` })).toBeVisible();

    resultados.enlace = await soloDelCanton(page);
    expect(resultados.enlace).toEqual(esperadas());
  });

  test("(3) R23 — aplicar la vista guardada de la versión 1 da las mismas guías", async ({ browser }) => {
    const page = await paginaDe(browser, r.empresa.maestro);
    await page.goto("/ordenes");
    const tabla = page.getByRole("table", { name: "Órdenes" });
    await expect(tabla.getByRole("row", { name: new RegExp(delOtro[0].numRemision) })).toBeVisible();

    await page.getByRole("button", { name: "Vistas guardadas" }).click();
    const aplicar = page.getByRole("button", { name: `Aplicar «${NOMBRE_VISTA}»` });
    await expect(aplicar).toBeEnabled();
    await aplicar.click();
    await expect(page.getByRole("button", { name: `Cantón: ${nombreCanton}` })).toBeVisible();

    resultados.vista = await soloDelCanton(page);
    expect(resultados.vista).toEqual(esperadas());

    // La vista se tradujo al leerla: la fila sigue siendo de la versión 1 (R34).
    const fila = await baseReparto().vistaFiltro.findFirstOrThrow({
      where: { usuarioId: r.empresa.maestro.id, nombre: NOMBRE_VISTA },
      select: { version: true },
    });
    expect(fila.version).toBe(1);
  });

  test("R39 — las tres veces, las mismas guías", () => {
    expect(resultados.enlace).toEqual(resultados.barra);
    expect(resultados.vista).toEqual(resultados.barra);
    expect(resultados.barra).toEqual(esperadas());
  });
});
