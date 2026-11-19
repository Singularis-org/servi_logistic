import { expect, test, type Locator, type Page } from "@playwright/test";

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
import { ALTO_MOVIL } from "./_pwa-mensajero-fixture";

/**
 * E2E — SLT-209 «Cierre del mensajero: la barra de búsqueda, filtros y descarga flota sobre la lista».
 *
 * La captura de Carlos (PWA, 360 px): en «Gestiones» de un cierre, la barra fija («Guía, re…»,
 * «Filtros», «Descargar») quedaba a mitad de la lista, con tarjetas asomando por ENCIMA de ella, y
 * el campo de búsqueda estrecho. Causa: en el detalle a pantalla completa el panel de la pestaña es
 * el que desplaza, con `pt-4`; un `sticky top-0` se pega al borde del CONTENIDO de su contenedor,
 * así que la barra quedaba 16 px por debajo del borde visible y las tarjetas se veían por esa franja.
 *
 *  (a) `/cierre-dia` a 360 px, el cierre en curso: al bajar, la barra queda arriba, opaca, sin
 *      tarjeta visible por encima ni a través de ella, y el campo con ancho útil.
 *  (b) El mismo cierre ya solicitado, abierto con «Ver» (pantalla completa): al desplazar el panel
 *      de «Gestiones», lo mismo.
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`), un mensajero con 10 gestiones entregadas por los
 * servicios reales. Sin datos, los `expect` fallan: no se salta nada.
 */

const ANCHO = 360;
const GESTIONES = "Órdenes del cierre";
const DETALLE = "Detalle del cierre · Tu cierre del día";
const BUSCAR = "Buscar gestión";
/** El campo ocupa su línea: 360 − 2 × 16 de márgenes = 328; hoy medía ~150 al lado de los botones. */
const ANCHO_MIN_CAMPO = 280;

let r: RepartoE2E;
let m: MensajeroE2E;

/**
 * Mide, en el MISMO paso del navegador, la barra fija (el ancestro `sticky` del buscador) frente a su
 * contenedor de desplazamiento y a las tarjetas `[data-gestion]` de la lista.
 */
async function medir(page: Page, lista: Locator) {
  const buscador = page.getByRole("searchbox", { name: BUSCAR });
  await expect(buscador).toBeVisible();
  return buscador.evaluate((campo, sel) => {
    let barra: HTMLElement | null = campo as HTMLElement;
    while (barra && getComputedStyle(barra).position !== "sticky") barra = barra.parentElement;
    if (!barra) return { error: "sin ancestro sticky" } as const;
    // El contenedor que desplaza: el primer ancestro con overflow-y auto/scroll; si no, la ventana.
    let port: HTMLElement | null = barra.parentElement;
    while (port && !/(auto|scroll)/.test(getComputedStyle(port).overflowY)) port = port.parentElement;
    const p = port ? port.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const b = barra.getBoundingClientRect();
    const fondo = getComputedStyle(barra).backgroundColor;
    const alfa = /rgba\([^)]*,\s*([\d.]+)\)/.exec(fondo)?.[1];
    const tarjetas = Array.from(document.querySelectorAll(sel)).map((t) => t.getBoundingClientRect());
    // Una tarjeta ASOMA por encima de la barra si una parte suya queda VISIBLE entre el borde visible
    // del contenedor y el borde superior de la barra (la que pasa por debajo de la barra no cuenta).
    const asoman = tarjetas.filter((t) => Math.min(t.bottom, b.top) - Math.max(t.top, p.top) > 0.5).length;
    // Lo que recibe el toque en la barra es la barra (nada de una tarjeta pintado encima).
    const puntos = [b.top + 2, b.top + b.height / 2, b.bottom - 2].flatMap((y) =>
      [b.left + 4, b.left + b.width / 2, b.right - 4].map((x) => document.elementFromPoint(x, y)),
    );
    const ajenos = puntos.filter((e) => e === null || !barra!.contains(e)).length;
    return {
      separacion: Math.round(b.top - p.top),
      asoman,
      ajenos,
      alfa: alfa === undefined ? 1 : Number(alfa),
      fondo,
      ancho: Math.round(campo.getBoundingClientRect().width),
      tarjetas: tarjetas.length,
      tapadas: tarjetas.filter((t) => t.top < b.bottom && t.bottom > b.top).length,
    };
  }, `[aria-label="${GESTIONES}"] [data-gestion]`);
}

function comprobar(med: Awaited<ReturnType<typeof medir>>, donde: string) {
  expect("error" in med ? med.error : null, donde).toBeNull();
  if ("error" in med) return;
  const info = `${donde}: ${JSON.stringify(med)}`;
  // Control positivo: hay tarjetas y al menos una pasa por debajo de la barra (se desplazó de verdad).
  expect(med.tarjetas, info).toBeGreaterThan(0);
  expect(med.tapadas, info).toBeGreaterThan(0);
  // La barra pegada al borde visible, sin franja por la que asomen tarjetas.
  expect.soft(med.separacion, info).toBeLessThanOrEqual(1);
  expect.soft(med.asoman, info).toBe(0);
  expect.soft(med.ajenos, info).toBe(0);
  // Fondo opaco.
  expect.soft(med.alfa, info).toBe(1);
  // Ancho útil del campo en el teléfono.
  expect.soft(med.ancho, info).toBeGreaterThanOrEqual(ANCHO_MIN_CAMPO);
}

test.describe("SLT-209 — la barra de «Gestiones» no flota sobre la lista a 360 px", () => {
  test.beforeAll(async () => {
    test.setTimeout(300_000);
    r = await crearEscenarioReparto("pwa-mensajero-cierre-barra-fija");
    m = await crearMensajero(r, "satelite");
    for (let i = 0; i < 10; i++) {
      const monto = 1000 + i;
      const orden = await llevarA(
        r,
        await crearOrden(r, { zona: "satelite", montoCobrar: monto, destinatario: `Destinatario ${i + 1}` }),
        "en_reparto",
        { mensajero: m },
      );
      await gestionar(r, orden, m, { resultado: "entregado", pagos: [{ metodo: "efectivo", monto }] });
    }
  });

  test("(a) y (b): en la página y en «Ver», barra pegada arriba, opaca, sin tarjetas encima y campo ancho", async ({ browser }) => {
    const page = await paginaDe(browser, m, { viewport: { width: ANCHO, height: ALTO_MOVIL } });
    await page.goto("/cierre-dia");

    // (a) La página: se baja hasta que la lista pasa por debajo de la barra.
    const lista = page.getByRole("region", { name: GESTIONES });
    await expect(lista.locator("[data-gestion]")).toHaveCount(10);
    await lista.evaluate((el) => window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + 60, behavior: "instant" }));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    comprobar(await medir(page, lista), "página");

    // (b) Se solicita y se abre con «Ver».
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.getByRole("region", { name: DETALLE }).getByRole("button", { name: "Solicitar cierre del día 10 gestiones" }).click();
    await page.getByRole("dialog", { name: "Solicitar cierre del día" }).getByRole("button", { name: "Solicitar cierre" }).click();
    await expect(page.getByText("Cierre solicitado correctamente.")).toBeVisible();
    const cola = page.getByRole("region", { name: "Cierres solicitados" });
    await cola.getByRole("button", { name: /^Más datos del cierre del \d{4}-\d{2}-\d{2}$/ }).click();
    await cola.getByRole("button", { name: /^Ver del cierre del \d{4}-\d{2}-\d{2}$/ }).click();
    const detalle = page.getByRole("dialog");
    await expect(detalle).toBeVisible();
    await detalle.getByRole("tab", { name: /^Gestiones \(10\)$/ }).click();
    const listaModal = detalle.getByRole("region", { name: GESTIONES });
    await expect(listaModal.locator("[data-gestion]")).toHaveCount(10);
    // El panel de la pestaña es el que desplaza: se baja 150 px dentro de él.
    await listaModal.evaluate((el) => {
      let p: HTMLElement | null = el.parentElement;
      while (p && !/(auto|scroll)/.test(getComputedStyle(p).overflowY)) p = p.parentElement;
      if (p) p.scrollTop = 150;
    });
    comprobar(await medir(page, listaModal), "detalle «Ver»");
  });
});
