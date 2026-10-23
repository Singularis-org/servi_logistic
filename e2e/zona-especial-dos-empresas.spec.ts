import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import type { Letra } from "./_dos-empresas-fixture";
import {
  clienteDuenoLocal,
  elegirDistritos,
  marcasDe,
  sembrarEmpresa,
  type DistritoElegido,
  type EmpresaDeTarifas,
} from "./_zona-especial-fixture";

/**
 * SL-38 T9 (R14) — la marca de zona especial en la pantalla de Tarifas, con dos maestros.
 *
 * La marca es de la EMPRESA (`distrito_zona_especial`, con RLS): el maestro de A marca un distrito
 * desde «Editar zona» y lo ve marcado al reabrir; el de B, en el mismo distrito, no lo ve; y lo que
 * marca B no lo ve A. El conteo «Zonas especiales: N» del cantón, que es lo único de tarifa que la
 * pantalla enseña de la marca, se comprueba con la misma regla. La base se lee también por detrás,
 * como dueño, para que el verde no dependa solo de lo que pinta el árbol.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir):
 * - `DATABASE_URL` a una base local desechable, migrada y con catálogos (`pnpm run db:seed`).
 * - El dev server en `localhost:3000` contra esa misma base (Playwright lo reutiliza).
 * - No se envía ningún correo: los maestros son `@example.test` por corrida, la contraseña la fija
 *   la fixture con el hasher del login y el dispositivo queda confiado (sin OTP).
 * Sin siembra, el `beforeAll` lanza y los tests FALLAN: no se saltan.
 */

test.describe.configure({ mode: "serial" });

const ERROR_DE_LA_MARCA = "No se pudo guardar la marca de zona especial.";
const GUARDADO_OK = "Zona actualizada";

let dueno: PrismaClient | null = null;
let userAgent = "";
const empresas: Partial<Record<Letra, EmpresaDeTarifas>> = {};
const cookies: Partial<Record<Letra, Awaited<ReturnType<BrowserContext["cookies"]>>>> = {};
/** [zona de A, zona de B, X (lo marca A), Y (lo marca B)]. */
let distritos: DistritoElegido[] = [];

function de(letra: Letra): EmpresaDeTarifas {
  const e = empresas[letra];
  if (!e) throw new Error(`no hay siembra de ${letra}: falló el beforeAll`);
  return e;
}

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

const X = (): DistritoElegido => distritos[2];
const Y = (): DistritoElegido => distritos[3];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  distritos = await elegirDistritos(dueno);

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresas.A = await sembrarEmpresa(dueno, "A", userAgent, distritos[0]);
  empresas.B = await sembrarEmpresa(dueno, "B", userAgent, distritos[1]);

  for (const letra of ["A", "B"] as const) {
    const c = await browser.newContext({ userAgent });
    const p = await c.newPage();
    await p.goto("/login");
    await p.fill('input[type="email"]', de(letra).empresa.email);
    await p.fill('input[type="password"]', de(letra).empresa.password);
    await p.click('button[type="submit"]');
    await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
    cookies[letra] = await c.cookies();
    await c.close();
  }
});

test.afterAll(async () => {
  // La base es desechable y se borra entera al terminar la comprobación.
  await dueno?.$disconnect();
});

async function comoMaestro(browser: Browser, letra: Letra): Promise<Page> {
  const sesion = cookies[letra];
  expect(sesion?.length ?? 0, `no hay sesión de ${letra}: el login del beforeAll no dejó cookies`).toBeGreaterThan(0);
  const ctx = await browser.newContext({ userAgent });
  await ctx.addCookies(sesion ?? []);
  return ctx.newPage();
}

/** Abre Tarifas de cero (render del servidor) y entra a «Editar» de la zona de la empresa. */
async function abrirZona(page: Page, letra: Letra): Promise<void> {
  await page.goto("/configuracion/tarifas", { waitUntil: "load", timeout: 180_000 });
  const fila = page.getByRole("listitem").filter({ hasText: de(letra).zonaNombre });
  await fila.getByRole("button", { name: "Editar" }).click({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible({ timeout: 30_000 });
}

/** Filtra el árbol por el nombre del distrito y devuelve su botón «Especial» (marcado o no). */
async function botonEspecial(page: Page, d: DistritoElegido): Promise<Locator> {
  await page.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }).fill(d.nombre);
  const boton = page.getByRole("button", {
    name: new RegExp(`^(Marcar ${d.nombre} como zona especial|Quitar la marca de zona especial a ${d.nombre})$`),
  });
  await expect(boton).toHaveCount(1);
  return boton;
}

async function guardarSinErrorDeMarca(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(GUARDADO_OK, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(ERROR_DE_LA_MARCA)).toHaveCount(0);
  // Tras guardar, el módulo vuelve a la lista: el formulario ya no está.
  await expect(page.getByRole("heading", { name: "Editar zona" })).toHaveCount(0);
}

test("(1) el maestro de A marca un distrito como zona especial y guarda sin toast de error", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await comoMaestro(browser, "A");
  await abrirZona(page, "A");

  const boton = await botonEspecial(page, X());
  await expect(boton).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText(/Zonas especiales:/)).toHaveCount(0);
  await boton.click();
  await expect(boton).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/Zonas especiales: 1/)).toHaveCount(1);

  await guardarSinErrorDeMarca(page);

  await expect.poll(() => marcasDe(base(), de("A").empresa.organizacionId)).toEqual([X().id]);
  await expect.poll(() => marcasDe(base(), de("B").empresa.organizacionId)).toEqual([]);
  await page.context().close();
});

test("(2) al reabrir, el maestro de A ve el distrito marcado", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await comoMaestro(browser, "A");
  await abrirZona(page, "A");

  const boton = await botonEspecial(page, X());
  await expect(boton).toHaveAttribute("aria-pressed", "true");
  await expect(boton).toHaveAccessibleName(`Quitar la marca de zona especial a ${X().nombre}`);
  await expect(page.getByText(/Zonas especiales: 1/)).toHaveCount(1);
  await page.context().close();
});

test("(3) el maestro de B no ve marcado el distrito que marcó A", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await comoMaestro(browser, "B");
  await abrirZona(page, "B");

  const boton = await botonEspecial(page, X());
  await expect(boton).toHaveAttribute("aria-pressed", "false");
  await expect(boton).toHaveAccessibleName(`Marcar ${X().nombre} como zona especial`);
  await expect(page.getByText(/Zonas especiales:/)).toHaveCount(0);
  await page.context().close();
});

test("(4) B marca otro distrito: B lo ve al reabrir y A no, y A conserva el suyo", async ({ browser }) => {
  test.setTimeout(300_000);
  const pageB = await comoMaestro(browser, "B");
  await abrirZona(pageB, "B");
  const botonB = await botonEspecial(pageB, Y());
  await expect(botonB).toHaveAttribute("aria-pressed", "false");
  await botonB.click();
  await expect(botonB).toHaveAttribute("aria-pressed", "true");
  await guardarSinErrorDeMarca(pageB);

  await abrirZona(pageB, "B");
  await expect(await botonEspecial(pageB, Y())).toHaveAttribute("aria-pressed", "true");
  await expect(pageB.getByText(/Zonas especiales: 1/)).toHaveCount(1);
  await pageB.context().close();

  const pageA = await comoMaestro(browser, "A");
  await abrirZona(pageA, "A");
  const botonYenA = await botonEspecial(pageA, Y());
  await expect(botonYenA).toHaveAttribute("aria-pressed", "false");
  await expect(pageA.getByText(/Zonas especiales:/)).toHaveCount(0);
  await expect(await botonEspecial(pageA, X())).toHaveAttribute("aria-pressed", "true");
  await pageA.context().close();

  await expect.poll(() => marcasDe(base(), de("A").empresa.organizacionId)).toEqual([X().id]);
  await expect.poll(() => marcasDe(base(), de("B").empresa.organizacionId)).toEqual([Y().id]);
});
