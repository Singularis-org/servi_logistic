import { test, expect, type Cookie, type Page } from "@playwright/test";

import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E, sesionDe } from "../tests/fabricas/e2e";

import { crearZonaE2E } from "./_aislamiento-datos";

/**
 * SLT-80 «Guía de integración por API en la ayuda» (T11; R1306, R1307, R1309, R1312, R1313) — el
 * camino completo de la guía con sesión real:
 *
 *  1. Un `maestro` entra a `/configuracion/api`, sigue «Guía de integración» (R1313) y ve la guía
 *     dentro de Ayuda con sus tres acciones (R1306, R1308).
 *  2. Con SU sesión descarga el PDF (R1309: 200, `application/pdf`, cuerpo `%PDF`) y la colección de
 *     Postman (R1312: 200, JSON).
 *  3. Un `mensajero` recibe 404 en la pantalla de la guía y en las dos descargas (R1307).
 *
 * Los oráculos (rutas, textos de los enlaces, título) se escriben A MANO a propósito: derivarlos de
 * `lib/ayuda/guia-api.ts` haría del test una tautología de la constante que juzga.
 *
 * QUÉ MUTACIÓN MATA: abrir `puedeLeerDocumento` (`lib/ayuda/documento.ts`) a cualquier rol hace
 * pasar al mensajero y cae el caso 3. Sin redirecciones (`maxRedirects: 0`): un 30x a `/login`
 * no se confunde con el 404.
 *
 * DATOS: el `beforeAll` crea su empresa (con su `maestro`), una zona y un `mensajero` de esa zona;
 * cada uno entra por `/login` con `sesionDe`. Nada de datos sembrados a mano.
 */

const RUTA_CONFIG_API = "/configuracion/api";
const RUTA_GUIA = "/ayuda/oficina/guia-integracion-api";
const RUTA_PDF = "/ayuda/descargas/guia-integracion-api";
const RUTA_POSTMAN = "/ayuda/descargas/postman";
const TITULO_GUIA = "Guía de integración — API de Servi Logistic";

type Rol = "maestro" | "mensajero";
const sesiones: Partial<Record<Rol, Cookie[]>> = {};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const db = abrirBaseE2E();
  try {
    const e = await crearEmpresaE2E("guia-api");
    const zona = await crearZonaE2E(db, e, { esCentral: false });
    const mensajero = await crearUsuarioE2E(e, "mensajero", { zonaId: zona.id });
    sesiones.maestro = await sesionDe(browser, e.maestro);
    sesiones.mensajero = await sesionDe(browser, mensajero);
  } finally {
    await db.$disconnect();
  }
});

/** Pone la sesión del rol y comprueba que vale (fuera de `/login`): el anti-vacío de cada caso. */
async function login(page: Page, rol: Rol) {
  const sesion = sesiones[rol];
  expect(sesion?.length ?? 0, `no hay sesión de ${rol}: falló el beforeAll`).toBeGreaterThan(0);
  await page.context().addCookies(sesion ?? []);
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("SLT-80 — guía de integración por API en Ayuda", () => {
  test("el maestro llega a la guía desde /configuracion/api y ve las tres acciones (R1313, R1306, R1308)", async ({
    page,
  }) => {
    await login(page, "maestro");
    await page.goto(RUTA_CONFIG_API);

    const enlaceGuia = page.getByRole("link", { name: "Guía de integración", exact: true });
    await expect(enlaceGuia).toBeVisible();
    await expect(page.getByRole("link", { name: "Descargar guía en PDF" })).toHaveAttribute("href", RUTA_PDF);

    await enlaceGuia.click();
    await expect(page).toHaveURL(new RegExp(`${RUTA_GUIA}$`));
    // Dentro del módulo de Ayuda (su `h1` y el índice con la sección «Oficina»); el `#` del `.md`
    // se pinta como `h2` bajo el `h1` del módulo.
    await expect(page.getByRole("heading", { level: 1, name: "Ayuda", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Oficina", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: TITULO_GUIA })).toBeVisible();

    const acciones = page.getByRole("navigation", { name: "Descargas y referencia de la API" });
    await expect(acciones.getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", RUTA_PDF);
    const swagger = acciones.getByRole("link", { name: /Referencia interactiva \(Swagger\)/ });
    await expect(swagger).toHaveAttribute("href", "/api-docs");
    await expect(swagger).toHaveAttribute("target", "_blank");
    await expect(acciones.getByRole("link", { name: "Colección de Postman" })).toHaveAttribute("href", RUTA_POSTMAN);
  });

  test("el maestro descarga el PDF y la colección de Postman con su sesión (R1309, R1312)", async ({ page }) => {
    await login(page, "maestro");

    const pdf = await page.request.get(RUTA_PDF, { maxRedirects: 0 });
    expect(pdf.status(), "PDF de la guía").toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect(pdf.headers()["content-disposition"]).toMatch(
      /attachment; filename="Guia-Integracion-API-Servi-Logistic-\d{4}-\d{2}-\d{2}\.pdf"/,
    );
    const cuerpoPdf = await pdf.body();
    expect(cuerpoPdf.subarray(0, 4).toString("latin1")).toBe("%PDF");

    const postman = await page.request.get(RUTA_POSTMAN, { maxRedirects: 0 });
    expect(postman.status(), "colección de Postman").toBe(200);
    expect(postman.headers()["content-type"]).toContain("application/json");
    expect(postman.headers()["content-disposition"]).toContain("attachment");
    const coleccion = (await postman.json()) as { info?: unknown; item?: unknown[] };
    expect(coleccion.info, "la colección trae su bloque info").toBeTruthy();
    expect(Array.isArray(coleccion.item) && coleccion.item.length > 0, "la colección trae peticiones").toBe(true);
  });

  test("el mensajero recibe 404 en la guía, el PDF y la colección de Postman (R1307)", async ({ page }) => {
    await login(page, "mensajero");

    for (const ruta of [RUTA_PDF, RUTA_POSTMAN]) {
      const r = await page.request.get(ruta, { maxRedirects: 0 });
      expect(r.status(), `mensajero en ${ruta}`).toBe(404);
      expect(r.headers()["content-type"] ?? "").not.toContain("application/pdf");
    }

    const pantalla = await page.goto(RUTA_GUIA);
    expect(pantalla?.status(), `mensajero en ${RUTA_GUIA}`).toBe(404);
    await expect(page.getByRole("heading", { name: TITULO_GUIA })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Descargar PDF" })).toHaveCount(0);
  });
});
