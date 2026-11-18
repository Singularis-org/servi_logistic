import { randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import {
  clienteDuenoLocal,
  elegirDistritos,
  sembrarEmpresa,
  type DistritoElegido,
  type EmpresaDeTarifas,
} from "./_zona-especial-fixture";

/**
 * SLT-198 «Cerrar una bodega: dejar una zona sin distritos» (R1233) — el flujo de D4 en pantalla.
 *
 * Una empresa sembrada con la fixture de SL-38 (zona de bodega principal con un distrito) y, como
 * dueno, una zona satelite con OTRO distrito. El maestro edita la satelite, desmarca su unico
 * distrito y guarda; el listado la marca «Sin distritos»; edita la principal, le anade ese distrito
 * y guarda sin error. Por detras se comprueba que el distrito quedo en la principal.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir): igual que
 * `zonas-crear-sin-costos.spec.ts`. Sin siembra, el `beforeAll` lanza y el test FALLA.
 */

test.describe.configure({ mode: "serial" });

/** SINPE de prueba (ficticio, el mismo de `zonas-crear-sin-costos`): el repo es publico. */
const SINPE_NUMERO = "80000000";
const SINPE_NOMBRE = "Titular de Prueba";

let dueno: PrismaClient | null = null;
let userAgent = "";
let empresa: EmpresaDeTarifas | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let distritoSatelite: DistritoElegido | null = null;
let satelite: { id: string; nombre: string } | null = null;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  const distritos = await elegirDistritos(dueno);
  distritoSatelite = distritos[1];

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresa = await sembrarEmpresa(dueno, "A", userAgent, [distritos[0]]);

  // La satelite que se cierra: un solo distrito, SINPE revisado (sin el, la pantalla abre
  // «Confirmá el SINPE» y tapa los clics).
  const nombre = `Cartago ${randomUUID().slice(0, 8)}`;
  const organizacionId = empresa.empresa.organizacionId;
  const idDistrito = distritoSatelite.id;
  satelite = await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    const z = await tx.zona.create({
      data: {
        nombre,
        sinpeNumero: SINPE_NUMERO,
        sinpeNombre: SINPE_NOMBRE,
        esCentral: false,
        sinpeRevisadoAt: new Date(),
      },
      select: { id: true },
    });
    await tx.zonaDistrito.create({ data: { zonaId: z.id, distritoId: idDistrito } });
    return { id: z.id, nombre };
  });

  const c = await browser.newContext({ userAgent });
  const p = await c.newPage();
  await p.goto("/login");
  await p.fill('input[type="email"]', empresa.empresa.email);
  await p.fill('input[type="password"]', empresa.empresa.password);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  sesion = await c.cookies();
  await c.close();
});

test.afterAll(async () => {
  await dueno?.$disconnect();
});

async function comoMaestro(browser: Browser): Promise<Page> {
  expect(sesion.length, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
  const ctx = await browser.newContext({ userAgent });
  await ctx.addCookies(sesion);
  return ctx.newPage();
}

async function casillaDe(page: Page, distrito: DistritoElegido) {
  await page.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }).fill(distrito.nombre);
  const casilla = page.getByRole("checkbox", {
    name: new RegExp(`^Seleccionar distrito ${distrito.nombre}\\b`),
  });
  await expect(casilla).toHaveCount(1);
  return casilla;
}

test("R1233: vaciar la satelite, verla «Sin distritos» y pasar su distrito a la principal", async ({ browser }) => {
  test.setTimeout(300_000);
  if (!empresa || !satelite || !distritoSatelite) throw new Error("no hay siembra: falló el beforeAll");
  const principal = empresa.zonaNombre;
  const distrito = distritoSatelite;

  const page = await comoMaestro(browser);
  await page.goto("/configuracion/zonas", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zonas" })).toBeVisible({ timeout: 60_000 });

  const filaSatelite = page.getByRole("listitem").filter({ hasText: satelite.nombre });
  await expect(filaSatelite).toContainText("1 distrito");
  await expect(filaSatelite).not.toContainText("Sin distritos");

  // 1) Editar la satelite y dejarla sin distritos.
  await filaSatelite.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible({ timeout: 30_000 });
  const casillaSat = await casillaDe(page, distrito);
  await expect(casillaSat).toBeChecked();
  await casillaSat.click();
  await expect(casillaSat).not.toBeChecked();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Zona actualizada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Editar zona" })).toHaveCount(0);

  // 2) El listado la marca «Sin distritos».
  await expect(filaSatelite).toContainText("Sin distritos", { timeout: 30_000 });
  await expect(filaSatelite).not.toContainText("0 distritos");

  // 3) Editar la principal y añadirle el distrito; guardar sin error.
  const filaPrincipal = page.getByRole("listitem").filter({ hasText: principal });
  await filaPrincipal.getByRole("button", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar zona" })).toBeVisible({ timeout: 30_000 });
  const casillaPrin = await casillaDe(page, distrito);
  await expect(casillaPrin).not.toBeChecked();
  await casillaPrin.click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByRole("heading", { name: "Editar zona" })).toHaveCount(0, { timeout: 30_000 });
  await expect(filaPrincipal).toContainText("2 distritos", { timeout: 30_000 });
  await expect(filaSatelite).toContainText("Sin distritos");
  await page.context().close();

  // Por detrás: el distrito quedó en la principal y la satelite sin ninguno.
  const filas = await base().zonaDistrito.findMany({
    where: { distritoId: distrito.id, zona: { organizacionId: empresa.empresa.organizacionId } },
    select: { zona: { select: { nombre: true } } },
  });
  expect(filas.map((f) => f.zona.nombre)).toEqual([principal]);
  expect(await base().zonaDistrito.count({ where: { zonaId: satelite.id } })).toBe(0);
});
