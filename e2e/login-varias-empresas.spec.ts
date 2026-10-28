import { randomBytes, randomUUID } from "node:crypto";

import { test, expect, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { abrirBaseE2E, confiarDispositivo, correoE2E, crearUsuarioE2E, type EmpresaE2E, type UsuarioE2E } from "../tests/fabricas/e2e";
import { crearEmpresa } from "../tests/fabricas/empresa-y-usuarios";

/**
 * SL-18 T7.3 (R31) — el mismo email y la misma contraseña en dos empresas.
 *
 * 1. Con la contraseña buena, `/login` no entra todavía: pinta «Elige la empresa» con un botón por
 *    cada empresa de ese email (A y B, por su nombre) y «Volver a correo y contraseña».
 * 2. La persona elige B: entra en B, y en «Usuarios» ve la tienda de B y no la de A (un dato propio
 *    de A que B no debe ver; el de B es el control que hace falsable el «no ve»).
 *
 * DATOS (SL-44; R7, R10). Las dos empresas las da de alta `crearEmpresa`, el alta de la fábrica
 * por el servicio del superadmin, con el MISMO correo `@example.test` y la MISMA contraseña: es lo
 * que SL-18 (R1) permite. `crearEmpresaE2E` sortea el correo, por eso aquí va la de debajo. Las
 * tiendas las crea `crearUsuarioE2E`. El dispositivo del navegador queda confiado para los dos
 * maestros: así elegir B entra sin OTP, que no es lo que se prueba (lo cubre `auth.spec.ts`).
 *
 * CÓMO SE CORRE: `pnpm exec playwright test --project=aislamiento` (base local, migrada y con
 * `pnpm run db:seed`). Una segunda corrida crea otras dos empresas y otro correo.
 */

test.describe.configure({ mode: "serial" });

interface Par {
  a: EmpresaE2E;
  b: EmpresaE2E;
  nombreA: string;
  nombreB: string;
  tiendaA: UsuarioE2E;
  tiendaB: UsuarioE2E;
  email: string;
  password: string;
}

let dueno: PrismaClient | null = null;
let par: Par | null = null;

function elPar(): Par {
  if (!par) throw new Error("no hay empresas: falló el beforeAll");
  return par;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  // Valida que la base es local ANTES de que el alta abra su propia conexión.
  dueno = abrirBaseE2E();
  const email = correoE2E("maestro");
  const password = `E2e-${randomBytes(12).toString("base64url")}-9a`;
  const s = randomUUID().replace(/-/g, "").slice(0, 10);
  const alta = (letra: "A" | "B") =>
    crearEmpresa(
      dueno!,
      {
        nombre: `E2E varias ${letra} ${s}`,
        slug: `e2e-varias-${letra.toLowerCase()}-${s}`,
        correoMaestro: email,
        contrasena: password,
        nombreMaestro: `Maestro ${letra} ${s}`,
      },
      { ficha: "SL-18", motivo: "E2E: el mismo email en dos empresas" },
    );
  const a = await alta("A");
  const b = await alta("B");
  par = {
    a,
    b,
    nombreA: `E2E varias A ${s}`,
    nombreB: `E2E varias B ${s}`,
    tiendaA: await crearUsuarioE2E(a, "adminTienda"),
    tiendaB: await crearUsuarioE2E(b, "adminTienda"),
    email,
    password,
  };
});

test.afterAll(async () => {
  // Sin borrado: todo lleva sufijo aleatorio (SL-44 A1).
  await dueno?.$disconnect();
});

/** La tarjeta del formulario de login: fuera queda el anunciador de rutas de Next. */
function tarjeta(page: Page): Locator {
  return page.locator('[data-slot="card"]');
}

async function credenciales(page: Page, p: Par): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(p.email);
  await page.locator('input[type="password"]').fill(p.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(tarjeta(page).getByRole("heading", { name: "Elige la empresa" })).toBeVisible({ timeout: 60_000 });
}

test("con el mismo email y la misma contraseña en A y en B, /login ofrece las dos empresas (R31)", async ({ page }) => {
  const p = elPar();
  // Las dos cuentas existen de verdad, con el mismo email, cada una en su empresa (R1).
  const cuentas = await dueno!.usuario.findMany({ where: { email: p.email }, select: { organizacionId: true } });
  expect(cuentas.map((c) => c.organizacionId).sort()).toEqual([p.a.organizacionId, p.b.organizacionId].sort());

  await credenciales(page, p);
  expect(new URL(page.url()).pathname).toBe("/login");
  const botones = tarjeta(page).getByRole("listitem").getByRole("button");
  await expect(botones).toHaveCount(2);
  // El orden lo decide el servicio; aquí solo importa que estén las dos y nada más.
  expect((await botones.allInnerTexts()).map((t) => t.trim()).sort()).toEqual([p.nombreA, p.nombreB].sort());

  // «Volver» devuelve a correo y contraseña sin entrar en ninguna.
  await tarjeta(page).getByRole("button", { name: "Volver a correo y contraseña" }).click();
  await expect(page.getByRole("button", { name: "Iniciar sesión" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/login");
});

test("eligiendo B entra en B y no ve datos de A (R31)", async ({ page }) => {
  test.setTimeout(180_000);
  const p = elPar();
  const userAgent = await page.evaluate(() => navigator.userAgent);
  await confiarDispositivo(p.a.maestro, userAgent);
  await confiarDispositivo(p.b.maestro, userAgent);

  await credenciales(page, p);
  await tarjeta(page).getByRole("button", { name: p.nombreB, exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 });

  // La sesión es la del maestro de B, no la de A: la cookie `session` es el id de la fila de
  // `Session` (`lib/actions/auth.ts > setSessionCookie`).
  const cookie = (await page.context().cookies()).find((c) => c.name === "session");
  expect(cookie, "no quedó sesión tras elegir B").toBeDefined();
  const sesion = await dueno!.session.findUnique({ where: { id: cookie!.value }, select: { userId: true } });
  expect(sesion?.userId, "la sesión no es del maestro de B").toBe(p.b.maestro.id);

  // «Usuarios» (`/configuracion`) lista los de SU empresa: la tienda de B sí, la de A no.
  await page.goto("/configuracion", { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { name: "Usuarios" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(p.tiendaB.email, { exact: true }), "B no ve su propia tienda").toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText(p.tiendaA.email), "B ve la tienda de A").toHaveCount(0);
  expect(await page.content(), "el HTML de B trae la tienda de A").not.toContain(p.tiendaA.email);
  expect(await page.content(), "el HTML de B trae el nombre de A").not.toContain(p.nombreA);
});
