import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import type { Letra } from "./_dos-empresas-fixture";
import {
  abrirTarifas,
  activacionesDe,
  activarConFaltantes,
  digitarYGuardar,
  elegirNivel,
  panelDe,
  valoresDe,
} from "./_tarifas-activacion-fixture";
import {
  clienteDuenoLocal,
  elegirDistritos,
  gruposDe,
  marcarZonaEspecial,
  marcasDe,
  sembrarEmpresa,
  type DistritoElegido,
  type EmpresaDeTarifas,
} from "./_zona-especial-fixture";

/**
 * SLT-54 R69 (R44, R45, R46; antes SL-38 T9) — la zona especial en la pantalla nueva, con dos maestros.
 *
 * Desde SLT-54 la marca `distrito_zona_especial` no se escribe por pantalla (R28): se siembra por su servicio
 * y lo que se comprueba es lo que la sustituye. La zona especial se configura como un grupo más, y la marca
 * solo se ve, de solo lectura, en el selector de distritos mientras la empresa no ha activado. Los dos son de
 * la EMPRESA: A marca X y B marca Y, sobre zonas que cubren los dos distritos, y ninguna ve lo de la otra. La
 * base se lee también por detrás, como dueño, para que el verde no dependa solo de lo que se pinta.
 *
 * DATOS: las dos zonas cubren X e Y, además de un distrito propio. Sin siembra, el `beforeAll` lanza y los
 * casos FALLAN.
 */

test.use({ actionTimeout: 30_000 });

test.describe.configure({ mode: "serial" });

const GRUPO = "Zona especial";
const MARCA = "Zona especial hoy";

let dueno: PrismaClient | null = null;
let userAgent = "";
const empresas: Partial<Record<Letra, EmpresaDeTarifas>> = {};
const cookies: Partial<Record<Letra, Awaited<ReturnType<BrowserContext["cookies"]>>>> = {};
/** [propio de A, propio de B, X (lo marca A), Y (lo marca B)]. */
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

  empresas.A = await sembrarEmpresa(dueno, "A", userAgent, [distritos[0], X(), Y()]);
  empresas.B = await sembrarEmpresa(dueno, "B", userAgent, [distritos[1], X(), Y()]);
  await marcarZonaEspecial(de("A").empresa, X());
  await marcarZonaEspecial(de("B").empresa, Y());

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
  await dueno?.$disconnect();
});

async function comoMaestro(browser: Browser, letra: Letra): Promise<Page> {
  const sesion = cookies[letra];
  expect(sesion?.length ?? 0, `no hay sesión de ${letra}: el login del beforeAll no dejó cookies`).toBeGreaterThan(0);
  const ctx = await browser.newContext({ userAgent });
  await ctx.addCookies(sesion ?? []);
  const page = await ctx.newPage();
  await abrirTarifas(page);
  await expect(panelDe(page).getByRole("heading", { name: de(letra).zonaNombre })).toBeVisible();
  return page;
}

const seccionGrupos = (page: Page): Locator => page.getByRole("region", { name: /Grupos de .* de la zona/ });

/** Abre «Crear grupo». Solo aquí se ve el selector de distritos con la marca. */
async function abrirSelector(page: Page): Promise<Locator> {
  await seccionGrupos(page).getByRole("button", { name: "Crear grupo", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Crear grupo" });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

const filaDistrito = (dialogo: Locator, d: DistritoElegido): Locator =>
  dialogo.locator("label").filter({ hasText: d.nombre });

async function crearGrupo(page: Page, d: DistritoElegido): Promise<void> {
  const dialogo = await abrirSelector(page);
  await dialogo.getByRole("textbox").fill(GRUPO);
  await filaDistrito(dialogo, d).getByRole("checkbox").click();
  await dialogo.getByRole("button", { name: "Guardar", exact: true }).click();
  // SLT-89 (R22): toda escritura de grupos pasa por el antes → después del mismo modal.
  const confirmacion = page.getByRole("dialog", { name: `¿Crear el grupo ${GRUPO}?` });
  await confirmacion.getByRole("button", { name: "Sí, guardar", exact: true }).click();
  await expect(confirmacion).toHaveCount(0);
  await expect(seccionGrupos(page)).toContainText(GRUPO);
}

test("(1) cada maestro ve solo su marca, de solo lectura, en el selector de distritos", async ({ browser }) => {
  test.setTimeout(240_000);
  const pageA = await comoMaestro(browser, "A");
  const selectorA = await abrirSelector(pageA);
  await expect(selectorA).toContainText("es de solo lectura");
  await expect(filaDistrito(selectorA, X())).toContainText(MARCA);
  await expect(filaDistrito(selectorA, Y())).not.toContainText(MARCA);
  await expect(selectorA.getByText(MARCA, { exact: true })).toHaveCount(1);
  // R28: la fila no trae otro control que la casilla del grupo, y marcarla no toca la marca.
  await expect(filaDistrito(selectorA, X()).getByRole("button")).toHaveCount(0);
  await expect(filaDistrito(selectorA, X()).getByRole("checkbox")).toHaveCount(1);
  await pageA.context().close();

  const pageB = await comoMaestro(browser, "B");
  const selectorB = await abrirSelector(pageB);
  await expect(filaDistrito(selectorB, Y())).toContainText(MARCA);
  await expect(filaDistrito(selectorB, X())).not.toContainText(MARCA);
  await expect(selectorB.getByText(MARCA, { exact: true })).toHaveCount(1);
  await pageB.context().close();

  expect(await marcasDe(base(), de("A").empresa.organizacionId)).toEqual([X().id]);
  expect(await marcasDe(base(), de("B").empresa.organizacionId)).toEqual([Y().id]);
});

test("(2) A configura la zona especial como un grupo más, con su flete, sin tocar la marca", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await comoMaestro(browser, "A");
  await crearGrupo(page, X());

  await elegirNivel(page, new RegExp(`^Grupo: ${GRUPO} \\(1 `));
  await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por entregado", valor: "5000", iva: "13" }]);

  // Al reabrir, el grupo y su valor siguen; y el distrito está a la vez en el grupo y con su marca (R46).
  await abrirTarifas(page);
  await elegirNivel(page, new RegExp(`^Grupo: ${GRUPO} \\(1 `));
  await expect(panelDe(page).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true })).toHaveValue("5000");
  await expect(seccionGrupos(page)).toContainText(X().nombre);
  const selector = await abrirSelector(page);
  await expect(filaDistrito(selector, X())).toContainText(MARCA);
  await expect(filaDistrito(selector, X())).toContainText(`En el grupo ${GRUPO}`);
  await page.context().close();

  expect(await gruposDe(base(), de("A").empresa.organizacionId)).toEqual([{ nombre: GRUPO, distritos: [X().id] }]);
  expect(await marcasDe(base(), de("A").empresa.organizacionId)).toEqual([X().id]);
  expect(await marcasDe(base(), de("B").empresa.organizacionId)).toEqual([Y().id]);
});

test("(3) B no ve el grupo de A y crea el suyo, con el mismo nombre, sin que A lo vea", async ({ browser }) => {
  test.setTimeout(240_000);
  const pageB = await comoMaestro(browser, "B");
  await expect(seccionGrupos(pageB)).toContainText("Esta zona no tiene grupos");
  await pageB.locator("#tarifas-nivel").click();
  await expect(pageB.getByRole("option")).toHaveText(["Toda la zona", "Tienda con precio propio…"]);
  await pageB.keyboard.press("Escape");
  await expect(panelDe(pageB).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true })).toHaveValue("");

  await crearGrupo(pageB, Y());
  await pageB.context().close();

  const pageA = await comoMaestro(browser, "A");
  await expect(seccionGrupos(pageA).getByRole("listitem")).toHaveCount(1);
  await expect(seccionGrupos(pageA)).toContainText(X().nombre);
  await expect(seccionGrupos(pageA)).not.toContainText(Y().nombre);
  await pageA.context().close();

  expect(await gruposDe(base(), de("B").empresa.organizacionId)).toEqual([{ nombre: GRUPO, distritos: [Y().id] }]);
  expect(await gruposDe(base(), de("A").empresa.organizacionId)).toEqual([{ nombre: GRUPO, distritos: [X().id] }]);
  expect(await valoresDe(de("B").empresa.organizacionId)).toEqual([]);
});

test("(4) A activa: su marca deja de verse, su grupo sigue, y B no cambia", async ({ browser }) => {
  test.setTimeout(240_000);
  const pageA = await comoMaestro(browser, "A");
  await activarConFaltantes(pageA);
  await abrirTarifas(pageA);
  await expect(seccionGrupos(pageA)).toContainText(X().nombre);
  const selectorA = await abrirSelector(pageA);
  await expect(selectorA.getByText(MARCA, { exact: true })).toHaveCount(0);
  await expect(selectorA).not.toContainText("es de solo lectura");
  await pageA.context().close();

  const pageB = await comoMaestro(browser, "B");
  await expect(pageB.getByRole("region", { name: "Estado de las tarifas" })).toContainText("Borrador");
  const selectorB = await abrirSelector(pageB);
  await expect(filaDistrito(selectorB, Y())).toContainText(MARCA);
  await pageB.context().close();

  expect(await activacionesDe(de("A").empresa.organizacionId)).toBe(1);
  expect(await activacionesDe(de("B").empresa.organizacionId)).toBe(0);
  // R9: activar no mueve la marca ni los grupos de nadie; se oculta, no se borra.
  expect(await marcasDe(base(), de("A").empresa.organizacionId)).toEqual([X().id]);
  expect(await marcasDe(base(), de("B").empresa.organizacionId)).toEqual([Y().id]);
  expect(await gruposDe(base(), de("A").empresa.organizacionId)).toEqual([{ nombre: GRUPO, distritos: [X().id] }]);
});
