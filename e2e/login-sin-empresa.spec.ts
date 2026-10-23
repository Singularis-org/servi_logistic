import { randomUUID } from "node:crypto";

import { test, expect, type Browser, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { computeDeviceHash } from "../lib/utils/device";
import { hashPassword } from "../lib/utils/password";
import { datosDeOrganizacionDePrueba } from "../tests/fabricas/organizaciones";
import { clienteDueno } from "./_dos-empresas-fixture";

/**
 * SLT-32 — el login exige empresa (flujo crítico «Login y sesión»).
 *
 * (a) Un usuario activo, con contraseña correcta y `organizacion_id` NULL, se queda en /login y ve
 *     el mensaje de `account_unavailable`.
 * (b) Control: un usuario con empresa, mismo montaje, sí entra (sale de /login). Sin este control
 *     (a) pasaría también con un login roto para todos.
 * (c) m1: un usuario con empresa ya logueado pierde la empresa en la base; el siguiente request a
 *     una ruta protegida lo manda a /login (el middleware revalida la sesión con `isSessionActive`).
 *
 * Sin OTP: el dispositivo del navegador queda confiado (técnica de `_dos-empresas-fixture.ts`), así
 * que el riesgo es bajo y el login no manda correo. También al usuario sin empresa: si el chequeo
 * se rompe, entra directo y (a) da rojo en vez de emitir un OTP a un buzón inexistente.
 *
 * CÓMO SE CORRE (solo en local; `clienteDueno` aborta con una base remota prohibida):
 * - `DATABASE_URL` a una base local migrada y con catálogos (`pnpm run db:seed`).
 * - El dev server en el `baseURL` de Playwright. Lo sembrado se borra al terminar.
 */

test.describe.configure({ mode: "serial" });

const MENSAJE_NO_DISPONIBLE = "Esta cuenta no está disponible para iniciar sesión";

interface Sembrado {
  id: string;
  email: string;
  password: string;
}

let dueno: PrismaClient | null = null;
let organizacionId: string | null = null;
const usuarios: Sembrado[] = [];

function db(): PrismaClient {
  if (!dueno) throw new Error("SLT-32 E2E: no hay cliente de base: falló el beforeAll");
  return dueno;
}

async function sembrarUsuario(
  userAgent: string,
  etiqueta: string,
  conEmpresa: string | null,
): Promise<Sembrado> {
  const c = db();
  const s = randomUUID().replace(/-/g, "").slice(0, 12);
  const rol = await c.rol.findUnique({ where: { value: "maestro" }, select: { id: true } });
  const tipo = await c.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
  if (!rol || !tipo) throw new Error("SLT-32 E2E: faltan catálogos (corre `pnpm run db:seed`)");

  const password = randomUUID();
  const u = await c.usuario.create({
    data: {
      nombre: `SLT-32 ${etiqueta}`,
      primerApellido: "E2E",
      email: `slt32-${etiqueta}-${s}@example.test`,
      telefono: "88880000",
      passwordHash: await hashPassword(password),
      cedula: `slt32-${s}`,
      tipoIdentificacionId: tipo.id,
      rolId: rol.id,
      estado: "activo",
      // Explícito: el DEFAULT de la columna lee `app.organizacion_id`, que aquí no está fijado.
      organizacionId: conEmpresa,
    },
    select: { id: true, email: true },
  });
  await c.trustedDevice.create({
    data: { usuarioId: u.id, deviceHash: computeDeviceHash(userAgent), ipAddress: "127.0.0.1" },
  });
  const sembrado = { id: u.id, email: u.email, password };
  usuarios.push(sembrado);
  return sembrado;
}

async function loguear(page: Page, u: Sembrado): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
}

async function userAgentDelNavegador(browser: Browser): Promise<string> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const ua = await page.evaluate(() => navigator.userAgent);
  await ctx.close();
  return ua;
}

let userAgent = "";

test.beforeAll(async ({ browser }) => {
  dueno = clienteDueno();
  userAgent = await userAgentDelNavegador(browser);
  const org = await db().organizacion.create({ data: datosDeOrganizacionDePrueba("SLT-32 E2E"), select: { id: true } });
  organizacionId = org.id;
});

test.afterAll(async () => {
  if (!dueno) return;
  const ids = usuarios.map((u) => u.id);
  if (ids.length > 0) {
    await dueno.session.deleteMany({ where: { userId: { in: ids } } });
    await dueno.loginAttempt.deleteMany({ where: { usuarioId: { in: ids } } });
    await dueno.trustedDevice.deleteMany({ where: { usuarioId: { in: ids } } });
    await dueno.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: ids } } });
    await dueno.usuarioPreferencia.deleteMany({ where: { usuarioId: { in: ids } } });
    await dueno.usuario.deleteMany({ where: { id: { in: ids } } });
  }
  if (organizacionId) await dueno.organizacion.delete({ where: { id: organizacionId } });
  await dueno.$disconnect();
});

test.describe("SLT-32 — el login exige empresa", () => {
  test("(a) un usuario activo sin empresa se queda en /login con «cuenta no disponible»", async ({ browser }) => {
    const u = await sembrarUsuario(userAgent, "sin-empresa", null);
    const ctx = await browser.newContext({ userAgent });
    const page = await ctx.newPage();

    await loguear(page, u);

    // Filtrado por texto: Next monta su propio `role="alert"` vacío (`__next-route-announcer__`).
    await expect(page.getByRole("alert").filter({ hasText: MENSAJE_NO_DISPONIBLE })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    // Ni sesión emitida, y el intento queda registrado con su motivo.
    expect(await db().session.count({ where: { userId: u.id } })).toBe(0);
    expect(
      await db().loginAttempt.count({ where: { usuarioId: u.id, exitoso: false, riskReason: "sin_empresa" } }),
    ).toBe(1);
    await ctx.close();
  });

  test("(b) control: un usuario con empresa, mismo montaje, sí entra", async ({ browser }) => {
    const u = await sembrarUsuario(userAgent, "con-empresa", organizacionId);
    const ctx = await browser.newContext({ userAgent });
    const page = await ctx.newPage();

    await loguear(page, u);

    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
    expect(await db().session.count({ where: { userId: u.id } })).toBe(1);
    await ctx.close();
  });

  test("(c) m1: una sesión viva de un usuario sin empresa vuelve a /login en el siguiente request", async ({
    browser,
  }) => {
    // La base no deja quitarle la empresa a un usuario (`impedir_cambio_de_empresa`, SL-17), así que
    // el caso real de m1 es una sesión emitida ANTES de SLT-32 a un usuario sin empresa. Se siembra
    // la fila de `session` tal cual y se pone su cookie; el control es lo mismo con empresa.
    const sinEmpresa = await sembrarUsuario(userAgent, "sesion-previa-sin", null);
    const conEmpresa = await sembrarUsuario(userAgent, "sesion-previa-con", organizacionId);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const abrirConSesion = async (usuarioId: string): Promise<{ page: Page; status: number | undefined }> => {
      const s = await db().session.create({ data: { userId: usuarioId, expiresAt }, select: { id: true } });
      const ctx = await browser.newContext({ userAgent });
      await ctx.addCookies([{ name: "session", value: s.id, url: test.info().project.use.baseURL ?? "" }]);
      const page = await ctx.newPage();
      // `goto` sigue las redirecciones: si el middleware rechaza, la URL final ya es /login.
      const resp = await page.goto("/dashboard");
      return { page, status: resp?.status() };
    };

    const control = await abrirConSesion(conEmpresa.id);
    expect(control.status).toBe(200);
    expect(new URL(control.page.url()).pathname).toBe("/dashboard");
    await control.page.context().close();

    const { page, status } = await abrirConSesion(sinEmpresa.id);
    expect({ ruta: new URL(page.url()).pathname, status }).toEqual({ ruta: "/login", status: 200 });
    expect(new URL(page.url()).searchParams.get("redirect")).toBe("/dashboard");
    await page.context().close();
  });
});
