import { expect, test, type Locator, type Page } from "@playwright/test";

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
 * E2E — SLT-163 «PWA del mensajero: Reparto en el móvil», rebanada B de SLT-156 «PWA de los mensajeros:
 * tablas usables en el móvil» (B8; R493, R496, R500-R504, R507, R508, R510-R513).
 *
 *  (a) R502, R501, R490: Reparto a 360 y 414 px con la orden de datos más largos (destinatario de 80
 *      caracteres con una palabra de 40, dirección de 200, producto de 120, tienda de 60, ₡99 999 999):
 *      los cuatro KPI en 2 columnas y 2 filas; ni el documento ni ningún dato se sale; ninguna tarjeta
 *      recorta con «…», en Mosaico ni en Detalle (con la fila desplegada: dirección entera).
 *  (b) R493, R510-R512: a 360 px, los botones de la tarjeta, del diálogo y del modo foco miden ≥ 44 px;
 *      «Gestionar» → «Aceptar» → foco (solo el panel, un único «Confirmar guía», ningún «Gestionar»)
 *      → guía correcta → «¿Cómo terminó la gestión?».
 *  (c) R496, R500, R503 y la condición de la review de SLT-156 A: «Escanear o escribir guía» va encima
 *      de los KPI y la barra debajo; al bajar, la barra se queda pegada arriba y el `SidebarTrigger`
 *      no queda encima de ella (ni se cruzan sus cajas ni el trigger tapa ningún punto de la barra).
 *
 * DATOS: empresa nueva (`crearEscenarioReparto`, con la tienda de nombre largo), cada caso con SU
 * mensajero de la zona satélite y SUS órdenes, por los servicios reales. Sin datos, los `expect`
 * fallan: no se salta nada.
 */

let r: RepartoE2E;

const REPARTO = "/mis-asignaciones/reparto";

async function enReparto(
  m: MensajeroE2E,
  o: { destinatario: string; montoCobrar?: number; direccion?: string; producto?: string },
): Promise<OrdenE2E> {
  return llevarA(r, await crearOrden(r, { zona: "satelite", montoCobrar: 5000, ...o }), "en_reparto", { mensajero: m });
}

/** La orden de los datos más largos de `design.md §12`. */
function ordenLarga(m: MensajeroE2E): Promise<OrdenE2E> {
  return enReparto(m, {
    destinatario: DESTINATARIO_LARGO,
    montoCobrar: IMPORTE_LARGO,
    direccion: DIRECCION_LARGA,
    producto: PRODUCTO_LARGO,
  });
}

/** Columnas y filas distintas que ocupan los KPI (por el borde izquierdo y el superior de cada uno). */
async function rejillaKpi(page: Page): Promise<{ total: number; columnas: number; filas: number }> {
  return page.getByRole("region", { name: "Indicadores de mis asignaciones" }).evaluate((sec) => {
    const cajas = Array.from(sec.children).map((c) => c.getBoundingClientRect());
    return {
      total: cajas.length,
      columnas: new Set(cajas.map((c) => Math.round(c.left))).size,
      filas: new Set(cajas.map((c) => Math.round(c.top))).size,
    };
  });
}

/** Los textos de un KPI que se salen de su tarjeta (por la derecha o por su propio ancho). */
async function kpiQueNoCaben(page: Page): Promise<string[]> {
  return page.getByRole("region", { name: "Indicadores de mis asignaciones" }).evaluate((sec) => {
    const out: string[] = [];
    for (const tarjeta of Array.from(sec.children)) {
      const borde = tarjeta.getBoundingClientRect().right;
      for (const el of Array.from(tarjeta.querySelectorAll<HTMLElement>("*"))) {
        if ((el.textContent ?? "").trim() === "" || el.getBoundingClientRect().width === 0) continue;
        const texto = (el.textContent ?? "").trim().slice(0, 30);
        if (el.getBoundingClientRect().right > borde + 1) out.push(`fuera de la tarjeta: «${texto}»`);
        if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.push(`más ancho que su caja: «${texto}»`);
      }
    }
    return out;
  });
}

/** La barra fija de `BuscadorFiltros` (su raíz `sticky`), por su campo de búsqueda. */
function barra(page: Page): Locator {
  return page.locator(".sticky").filter({ has: page.getByRole("searchbox", { name: "Buscar guías" }) }).last();
}

async function cajaDe(l: Locator) {
  const caja = await l.boundingBox();
  expect(caja, "sin caja (¿está visible?)").not.toBeNull();
  return caja!;
}

test.describe("SLT-163 — Reparto en el móvil", () => {
  test.beforeAll(async () => {
    r = await crearEscenarioReparto("pwa-mensajero-reparto", { nombreTienda: TIENDA_LARGA });
  });

  for (const ancho of ANCHOS_MOVIL) {
    test(`(a) R502, R501, R490: a ${ancho} px, KPI 2 × 2 y ningún dato fuera ni con «…»`, async ({ browser }) => {
      const m = await crearMensajero(r, "satelite");
      await ordenLarga(m);
      await enReparto(m, { destinatario: "Beto Ruiz", montoCobrar: 4000 });

      const page = await paginaDe(browser, m, { viewport: { width: ancho, height: ALTO_MOVIL } });
      await page.goto(REPARTO);

      // R502: cuatro KPI, dos columnas, dos filas.
      await expect(page.getByRole("region", { name: "Indicadores de mis asignaciones" })).toBeVisible();
      expect(await rejillaKpi(page)).toEqual({ total: 4, columnas: 2, filas: 2 });
      // Y cada cifra cabe en su tarjeta (la primitiva `Card` recorta lo que se le sale).
      expect(await kpiQueNoCaben(page)).toEqual([]);

      // R507: Mosaico de entrada; la tarjeta larga, entera.
      const tarjeta = page.locator("article").filter({ hasText: DESTINATARIO_LARGO }).first();
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta.getByText(DESTINATARIO_LARGO, { exact: true }).first()).toBeVisible();
      await expect(tarjeta.getByText(PRODUCTO_LARGO, { exact: true }).first()).toBeVisible();
      await sinDesborde(page);
      await sinElipsis(page.locator("article"));

      // R508: en Detalle, la fila compacta; desplegada, la dirección entera.
      const conmutador = page.getByRole("group", { name: "Vista de las órdenes" });
      await conmutador.getByRole("button", { name: /Detalle/ }).click();
      await expect(conmutador.getByRole("button", { name: /Detalle/ })).toHaveAttribute("aria-pressed", "true");
      // El cambio de vista va animado: hasta que se va el carrusel, las tarjetas de Mosaico siguen ahí.
      await expect(page.getByRole("region", { name: "Órdenes en reparto" })).toHaveCount(0);
      const fila = page.locator("article").filter({ hasText: DESTINATARIO_LARGO }).first();
      // La fila compacta es el botón hijo directo de la tarjeta (dentro hay otros desplegables).
      const disparador = fila.locator(":scope > button[aria-expanded]");
      await expect(disparador).toHaveAttribute("aria-expanded", "false");
      await tactil(disparador);
      await disparador.click();
      await expect(disparador).toHaveAttribute("aria-expanded", "true");
      // La fila desplegada la pinta tras cantón y distrito («San Pablo · San Pablo — …»): entera, no sola.
      await expect(fila.getByText(DIRECCION_LARGA).first()).toBeVisible();
      await sinDesborde(page);
      await sinElipsis(page.locator("article"));
    });
  }

  test("(b) R493, R510-R512: botones de 44 px y Gestionar → foco → Confirmar guía → resultado", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    const orden = await ordenLarga(m);

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto(REPARTO);

    const gestionar = page.getByRole("button", { name: `Gestionar la orden ${orden.numRemision}` });
    await expect(gestionar).toBeVisible();
    await tactil(gestionar);
    // R493 (design §4): el disparador del escáner de la lista también.
    await tactil(page.getByRole("button", { name: "Escanear o escribir guía" }));
    await tactil(page.getByRole("button", { name: `Marcar la orden ${orden.numRemision} para gestionar más tarde` }));
    const conmutador = page.getByRole("group", { name: "Vista de las órdenes" });
    await tactil(conmutador.getByRole("button", { name: /Mosaico/ }));
    await tactil(conmutador.getByRole("button", { name: /Detalle/ }));

    await gestionar.click();
    const dialogo = page.getByRole("dialog", { name: "¿Gestionar esta orden?" });
    await expect(dialogo).toBeVisible();
    await tactil(dialogo.getByRole("button", { name: "Cancelar" }));
    await tactil(dialogo.getByRole("button", { name: "Aceptar" }));
    await dialogo.getByRole("button", { name: "Aceptar" }).click();

    // R510: solo el panel de esa orden, con la verificación abierta.
    const panel = page.getByRole("region", { name: "Detalle de la orden" });
    await expect(panel.getByText(`Guía ${orden.numGuia}`).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Indicadores de mis asignaciones" })).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Buscar guías" })).toHaveCount(0);
    await expect(page.getByRole("article", { name: /^Orden / })).toHaveCount(0);

    // R511: un único «Confirmar guía» y ningún otro «Gestionar».
    const gate = panel.getByRole("region", { name: "Verificar la guía del paquete antes de gestionar" });
    const confirmar = page.getByRole("button", { name: "Confirmar guía" });
    await expect(confirmar).toHaveCount(1);
    await expect(page.getByRole("button", { name: /^Gestionar/ })).toHaveCount(0);
    await expect(gate.getByLabel("Número de guía")).toHaveAttribute("placeholder", "Ej. 1024");
    await tactil(page.getByRole("button", { name: "Volver a la lista" }));
    await tactil(confirmar);
    await sinDesborde(page);

    // R512: la guía de la orden pasa a los resultados.
    await gate.getByLabel("Número de guía").fill(String(orden.numGuia));
    await confirmar.click();
    await expect(panel.getByText("¿Cómo terminó la gestión?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Volver a la lista" })).toHaveCount(0);
  });

  test("(c) R496, R500, R503: escáner arriba, barra pegada al bajar y fuera del alcance del SidebarTrigger", async ({ browser }) => {
    const m = await crearMensajero(r, "satelite");
    // Bastantes órdenes para que la LISTA (Detalle) dé por dónde bajar a 360 × 780: el carrusel de
    // Mosaico enseña una tarjeta a la vez y no alarga la página.
    for (let i = 0; i < 12; i++) await enReparto(m, { destinatario: `Destinatario ${i + 1}` });

    const page = await paginaDe(browser, m, { viewport: { width: 360, height: ALTO_MOVIL } });
    await page.goto(REPARTO);
    await expect(page.locator("article").first()).toBeVisible();

    // R500, R503: «Escanear o escribir guía» → KPI → barra, de arriba abajo.
    const escaner = await cajaDe(page.getByRole("button", { name: "Escanear o escribir guía" }));
    const kpis = await cajaDe(page.getByRole("region", { name: "Indicadores de mis asignaciones" }));
    const enReposo = await cajaDe(barra(page));
    expect(escaner.y + escaner.height).toBeLessThanOrEqual(kpis.y + 1);
    expect(kpis.y + kpis.height).toBeLessThanOrEqual(enReposo.y + 1);

    await page.getByRole("group", { name: "Vista de las órdenes" }).getByRole("button", { name: /Detalle/ }).click();
    await expect(page.getByRole("article", { name: /^Orden / })).toHaveCount(12);

    const alto = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(alto, "la página no tiene por dónde bajar").toBeGreaterThan(400);
    await page.mouse.wheel(0, Math.min(alto, 1200));
    await expect.poll(() => page.evaluate(() => window.scrollY), { message: "la ventana no bajó" }).toBeGreaterThan(enReposo.y);

    // R496: pegada arriba.
    await expect.poll(async () => Math.round((await cajaDe(barra(page))).y)).toBeLessThanOrEqual(1);
    const fija = await cajaDe(barra(page));

    // El SidebarTrigger no se cruza con la barra…
    const trigger = page.locator('[data-slot="sidebar-trigger"]');
    await expect(trigger).toHaveCount(1);
    const cajaTrigger = await trigger.boundingBox();
    if (cajaTrigger) {
      const cruzan =
        cajaTrigger.x < fija.x + fija.width &&
        fija.x < cajaTrigger.x + cajaTrigger.width &&
        cajaTrigger.y < fija.y + fija.height &&
        fija.y < cajaTrigger.y + cajaTrigger.height;
      expect(cruzan, `trigger ${JSON.stringify(cajaTrigger)} sobre la barra ${JSON.stringify(fija)}`).toBe(false);
    }
    // …y ningún punto de la barra (empezando por su esquina izquierda, donde vive el trigger) lo
    // tapa otra cosa: lo que hay en ese punto es de la barra.
    const tapados = await page
      .getByRole("searchbox", { name: "Buscar guías" })
      .evaluate((campo) => {
        const raiz = campo.closest(".sticky") as HTMLElement;
        const c = raiz.getBoundingClientRect();
        const ys = [c.top + 4, c.top + c.height / 2];
        const xs = [c.left + 8, c.left + 24, c.left + c.width / 2, c.right - 8];
        const out: string[] = [];
        for (const y of ys) {
          for (const x of xs) {
            const el = document.elementFromPoint(x, y);
            if (!el || !raiz.contains(el)) out.push(`(${Math.round(x)}, ${Math.round(y)}): ${el ? el.tagName : "nada"}`);
          }
        }
        return out;
      });
    expect(tapados).toEqual([]);
  });
});
