import { randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import {
  clienteDuenoLocal,
  elegirDistritos,
  sembrarEmpresa,
  type DistritoElegido,
  type EmpresaDeTarifas,
} from "./_zona-especial-fixture";

/**
 * SLT-51 T11 (R5, R3) — el maestro crea una zona SIN costos en `/configuracion/zonas` y la ve en
 * el listado.
 *
 * Una sola empresa, sembrada con la fixture de SL-38 (alta + acceso sin OTP + una zona de bodega
 * principal con un distrito). El maestro abre Zonas, crea una zona con nombre único, un distrito
 * libre y SINPE de prueba, y la ve en el listado. Por detrás, como dueño, se comprueba que la zona
 * nació sin costos: 0 filas de `tarifa_zona_mensajero`, `cobro_vehiculo` en falso y ninguna fila de
 * `tarifas` para la zona. El verde no depende solo de lo que pinta la pantalla.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir):
 * - `DATABASE_URL` a una base local desechable, migrada y con catálogos (`pnpm run db:seed`).
 * - Playwright levanta la app (`E2E_PUERTO`) contra esa misma base.
 * - No se envía ningún correo: el maestro es `@example.test` por corrida.
 * Sin siembra, el `beforeAll` lanza y el test FALLA: no se salta.
 */

test.describe.configure({ mode: "serial" });

/** Número SINPE de prueba (ficticio, el mismo de las suites de la 429): el repo es público. */
const SINPE_NUMERO = "80000000";
const SINPE_NOMBRE = "Titular de Prueba";

let dueno: PrismaClient | null = null;
let userAgent = "";
let empresa: EmpresaDeTarifas | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
/** El distrito libre que la zona nueva toma (la sembrada usa otro). */
let libre: DistritoElegido | null = null;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function sembrada(): EmpresaDeTarifas {
  if (!empresa) throw new Error("no hay siembra: falló el beforeAll");
  return empresa;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  const distritos = await elegirDistritos(dueno);
  libre = distritos[1];

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresa = await sembrarEmpresa(dueno, "A", userAgent, distritos[0]);

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

test("el maestro crea una zona sin costos y la ve en el listado", async ({ browser }) => {
  test.setTimeout(300_000);
  const distrito = libre;
  if (!distrito) throw new Error("no hay distrito libre: falló el beforeAll");
  const nombreZona = `Zona nueva ${randomUUID().slice(0, 8)}`;

  const page = await comoMaestro(browser);
  await page.goto("/configuracion/zonas", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Zonas" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Descargar cobertura/ })).toBeVisible();

  // R3: la zona sembrada (bodega principal) ya está en el listado con su etiqueta.
  const filaSembrada = page.getByRole("listitem").filter({ hasText: sembrada().zonaNombre });
  await expect(filaSembrada).toContainText("1 distrito");
  await expect(filaSembrada).toContainText("Zona de bodega principal");

  await page.getByRole("button", { name: "Crear zona" }).first().click();
  await expect(page.getByRole("heading", { name: "Nueva zona" })).toBeVisible({ timeout: 30_000 });

  // R4: el formulario no pide ningún monto ni ofrece «Especial».
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /zona especial/i })).toHaveCount(0);

  await page.getByRole("textbox", { name: "Nombre de la zona" }).fill(nombreZona);
  await page.getByRole("searchbox", { name: "Buscar en el catálogo geográfico" }).fill(distrito.nombre);
  const casilla = page.getByRole("checkbox", {
    name: new RegExp(`^Seleccionar distrito ${distrito.nombre}\\b`),
  });
  await expect(casilla).toHaveCount(1);
  await casilla.click();
  await page.getByRole("textbox", { name: "Número SINPE" }).fill(SINPE_NUMERO);
  await page.getByRole("textbox", { name: "A nombre de" }).fill(SINPE_NOMBRE);
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByText("Zona creada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Nueva zona" })).toHaveCount(0);

  // R5 + R3: la fila nueva, con su distrito y sin etiqueta ni costo.
  const filaNueva = page.getByRole("listitem").filter({ hasText: nombreZona });
  await expect(filaNueva).toHaveCount(1, { timeout: 30_000 });
  await expect(filaNueva).toContainText("1 distrito");
  await expect(filaNueva).not.toContainText("Zona de bodega principal");
  await expect(filaNueva).not.toContainText(/cobro por veh/i);
  await page.context().close();

  // R5, por detrás: la zona existe en la empresa y nació sin costos.
  const zona = await base().zona.findFirst({
    where: { organizacionId: sembrada().empresa.organizacionId, nombre: nombreZona },
    select: { id: true, cobroVehiculo: true, esCentral: true },
  });
  expect(zona, "la zona no está en la base").not.toBeNull();
  expect(zona?.cobroVehiculo).toBe(false);
  expect(zona?.esCentral).toBe(false);
  const zonaId = zona?.id ?? "";
  expect(await base().zonaDistrito.count({ where: { zonaId } })).toBe(1);
  expect(await base().tarifaZonaMensajero.count({ where: { zonaId } })).toBe(0);
  expect(await base().tarifa.count({ where: { zonaId } })).toBe(0);
});
