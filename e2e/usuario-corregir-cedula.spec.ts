import { randomInt, randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { clienteDuenoLocal, elegirDistritos, sembrarEmpresa, type EmpresaDeTarifas } from "./_zona-especial-fixture";

/**
 * SLT-221 «Maestro: corregir correo y cédula de un usuario», Tanda 1 (R1606, R1609) — en pantalla.
 *
 * Una empresa sembrada con la fixture de SL-38 y, como dueño, un usuario `admin` con una cédula
 * física de CR. El maestro abre «Editar usuario», cambia el «Número de documento» y guarda; al
 * reabrir la edición ve el documento nuevo. En «Acciones» (Histórico) ve la fila «Cambió la cédula
 * de un usuario» con el documento anterior y el nuevo. Por detrás se comprueba el UPDATE.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir): igual que
 * `zona-sin-distritos.spec.ts`. Sin siembra, el `beforeAll` lanza y el test FALLA.
 */

test.describe.configure({ mode: "serial" });

/** Cédula física de CR: 9 dígitos. Empieza por 1 para no depender de ceros a la izquierda. */
function cedulaFisica(): string {
  return `1${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
}

let dueno: PrismaClient | null = null;
let userAgent = "";
let empresa: EmpresaDeTarifas | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let objetivo: { id: string; nombre: string; cedula: string } | null = null;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  const distritos = await elegirDistritos(dueno);

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresa = await sembrarEmpresa(dueno, "A", userAgent, [distritos[0]]);

  // El usuario cuya cédula se corrige: rol `admin` (no pide zona ni vehículo), tipo «Cédula física» de CR (9 dígitos).
  const tipo = await dueno.tipoIdentificacion.findFirstOrThrow({
    // La clave del catálogo por país (SLT-42): `cedula` es el `value` heredado; la clave es `cedula_fisica`.
    where: { paisId: "CR", clave: "cedula_fisica" },
    select: { id: true },
  });
  const rol = await dueno.rol.findUniqueOrThrow({ where: { value: "admin" }, select: { id: true } });
  const nombre = `Usuario cédula ${randomUUID().slice(0, 8)}`;
  const cedula = cedulaFisica();
  const organizacionId = empresa.empresa.organizacionId;
  objetivo = await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    const u = await tx.usuario.create({
      data: {
        id: randomUUID(),
        nombre,
        email: `slt221-${randomUUID().slice(0, 8)}@example.test`,
        telefono: "88881111",
        passwordHash: "sin-acceso-e2e",
        estado: "activo",
        cedula,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
      },
      select: { id: true },
    });
    return { id: u.id, nombre, cedula };
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

async function abrirEdicion(page: Page, nombre: string) {
  const fila = page.getByRole("row").filter({ hasText: nombre });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await fila.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar usuario" });
  await expect(dialogo).toBeVisible({ timeout: 30_000 });
  return dialogo;
}

test("R1606, R1609: el maestro corrige la cédula y la ve en el Histórico de acciones", async ({ browser }) => {
  test.setTimeout(300_000);
  if (!empresa || !objetivo) throw new Error("no hay siembra: falló el beforeAll");
  const { id, nombre, cedula: anterior } = objetivo;
  let nueva = cedulaFisica();
  while (nueva === anterior) nueva = cedulaFisica();

  const page = await comoMaestro(browser);
  await page.goto("/configuracion", { waitUntil: "load", timeout: 180_000 });

  // 1) Editar el usuario: el número de documento se puede cambiar (R1606) y se guarda.
  let dialogo = await abrirEdicion(page, nombre);
  const campo = dialogo.getByLabel("Número de documento");
  await expect(campo).toBeEnabled();
  await expect(campo).toHaveValue(anterior);
  await campo.fill(nueva);
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Usuario actualizado", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(dialogo).toHaveCount(0);

  // 2) Reabrir la edición: el documento guardado es el nuevo.
  dialogo = await abrirEdicion(page, nombre);
  await expect(dialogo.getByLabel("Número de documento")).toHaveValue(nueva);
  await dialogo.getByRole("button", { name: "Cerrar" }).first().click();

  // 3) El Histórico de acciones muestra la corrección con el anterior y el nuevo (R1609).
  await page.goto("/historico/acciones", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Acciones" })).toBeVisible({ timeout: 60_000 });
  const filaHistorico = page.getByRole("row").filter({ hasText: "Cambió la cédula de un usuario" });
  await expect(filaHistorico).toHaveCount(1, { timeout: 60_000 });
  await expect(filaHistorico).toContainText(anterior);
  await expect(filaHistorico).toContainText(nueva);
  await page.context().close();

  // Por detrás: el UPDATE llegó a la base.
  const guardado = await base().usuario.findUniqueOrThrow({ where: { id }, select: { cedula: true } });
  expect(guardado.cedula).toBe(nueva);
});
