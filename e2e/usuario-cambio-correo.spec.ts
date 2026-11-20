import { randomInt, randomUUID } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { computeDeviceHash } from "../lib/utils/device";
import { componerEnlace, generarSecretoEnlace } from "../lib/utils/enlace-de-un-uso";
import { hashPassword } from "../lib/utils/password";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { clienteDuenoLocal, elegirDistritos, sembrarEmpresa, type EmpresaDeTarifas } from "./_zona-especial-fixture";

/**
 * SLT-221 «Maestro: corregir correo y cédula de un usuario», PR 3 (R1618, R1619, R1622, R1623,
 * R1626, R1628) — en pantalla.
 *
 * Una empresa sembrada con la fixture de SL-38 y un usuario `admin` con contraseña conocida y el
 * dispositivo confiado (entra sin OTP). El maestro abre «Editar usuario», pide el cambio de correo,
 * ve el pendiente, lo cancela y lo vuelve a pedir. El secreto del enlace solo existe en el correo,
 * así que el test cambia el hash del pendiente por el de un secreto suyo (design §10). Sin sesión
 * abre el enlace —abrirlo no cambia nada— y confirma. Después el usuario entra con el correo nuevo y
 * ya no con el anterior, y el maestro ve la fila del Histórico con los dos correos.
 *
 * CÓMO SE CORRE (solo en local; una base no local lo aborta antes de escribir): igual que
 * `usuario-corregir-cedula.spec.ts`, con `NEXT_PUBLIC_APP_URL` en el puerto del E2E (sin ella la app
 * no puede componer el enlace y la petición falla).
 */

test.describe.configure({ mode: "serial" });

const PASSWORD = "Correo-Nuevo-e2e-1!";
const ERROR_LOGIN = "Correo o contraseña inválidos";

let dueno: PrismaClient | null = null;
let userAgent = "";
let empresa: EmpresaDeTarifas | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];
let objetivo: { id: string; nombre: string; email: string } | null = null;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function correoDePrueba(etiqueta: string): string {
  return `slt221-${etiqueta}-${randomUUID().slice(0, 8)}@example.test`;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDuenoLocal();
  const distritos = await elegirDistritos(dueno);

  const ctx = await browser.newContext();
  userAgent = await (await ctx.newPage()).evaluate(() => navigator.userAgent);
  await ctx.close();

  empresa = await sembrarEmpresa(dueno, "A", userAgent, [distritos[0]]);

  // El usuario cuyo correo se cambia: rol `admin` (no pide zona ni vehículo), con contraseña y el
  // dispositivo de este navegador confiado, para poder entrar con él al final.
  const rol = await dueno.rol.findUniqueOrThrow({ where: { value: "admin" }, select: { id: true } });
  // La clave del catálogo por país (SLT-42): «Cédula física» de CR, 9 dígitos.
  const tipo = await dueno.tipoIdentificacion.findFirstOrThrow({
    where: { paisId: "CR", clave: "cedula_fisica" },
    select: { id: true },
  });
  const cedula = `2${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
  const nombre = `Usuario correo ${randomUUID().slice(0, 8)}`;
  const email = correoDePrueba("anterior");
  const passwordHash = await hashPassword(PASSWORD);
  const organizacionId = empresa.empresa.organizacionId;
  objetivo = await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    const u = await tx.usuario.create({
      data: {
        id: randomUUID(),
        nombre,
        email,
        telefono: "88882222",
        passwordHash,
        estado: "activo",
        cedula,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
      },
      select: { id: true },
    });
    await tx.trustedDevice.create({
      data: { usuarioId: u.id, deviceHash: computeDeviceHash(userAgent), ipAddress: "127.0.0.1" },
    });
    return { id: u.id, nombre, email };
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

async function abrirEdicion(page: Page, nombre: string): Promise<Locator> {
  const fila = page.getByRole("row").filter({ hasText: nombre });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await fila.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar usuario" });
  await expect(dialogo).toBeVisible({ timeout: 30_000 });
  return dialogo;
}

async function pedirCambio(bloque: Locator, correo: string): Promise<void> {
  await bloque.getByRole("button", { name: "Cambiar correo" }).click();
  await bloque.getByLabel("Correo nuevo").fill(correo);
  await bloque.getByRole("button", { name: "Enviar confirmación" }).click();
  await expect(bloque.getByText("Pendiente de confirmar:")).toBeVisible({ timeout: 30_000 });
  await expect(bloque.getByText(correo, { exact: true })).toBeVisible();
}

async function pendientesAbiertos(usuarioId: string) {
  return base().usuarioCambioCorreo.findMany({
    where: { usuarioId, anuladoAt: null, confirmadoAt: null },
    select: { id: true, emailNuevo: true },
  });
}

/** Login en un contexto limpio; devuelve la página para mirar dónde quedó. */
async function intentarEntrar(browser: Browser, email: string): Promise<Page> {
  const ctx = await browser.newContext({ userAgent });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return page;
}

test("R1618, R1619, R1622, R1623, R1626, R1628: pedir, cancelar, confirmar sin sesión y verlo en el Histórico", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  if (!empresa || !objetivo) throw new Error("no hay siembra: falló el beforeAll");
  const { id, nombre, email: anterior } = objetivo;
  const primero = correoDePrueba("primero");
  const nuevo = correoDePrueba("nuevo");

  const page = await comoMaestro(browser);
  await page.goto("/configuracion", { waitUntil: "load", timeout: 180_000 });

  // 1) Pedir el cambio: el formulario muestra el pendiente (R1618) y el correo de la cuenta no cambia.
  const dialogo = await abrirEdicion(page, nombre);
  await expect(dialogo.getByLabel("Email")).toHaveValue(anterior);
  const bloque = dialogo.getByRole("region", { name: "Cambiar correo" });
  await pedirCambio(bloque, primero);
  expect((await pendientesAbiertos(id)).map((p) => p.emailNuevo)).toEqual([primero]);

  // 2) Cancelarlo: deja de verse y el pendiente queda anulado (R1619).
  await bloque.getByRole("button", { name: "Cancelar" }).click();
  await expect(bloque.getByRole("button", { name: "Cambiar correo" })).toBeVisible({ timeout: 30_000 });
  await expect(bloque.getByText(primero, { exact: true })).toHaveCount(0);
  expect(await pendientesAbiertos(id)).toEqual([]);

  // 3) Volver a pedirlo con otro correo.
  await pedirCambio(bloque, nuevo);
  const abiertos = await pendientesAbiertos(id);
  expect(abiertos.map((p) => p.emailNuevo)).toEqual([nuevo]);
  await page.context().close();

  // 4) El secreto solo viaja en el correo: el test pone en el pendiente el hash de uno suyo.
  const secreto = generarSecretoEnlace();
  const organizacionId = empresa.empresa.organizacionId;
  await base().$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    await tx.usuarioCambioCorreo.update({
      where: { id: abiertos[0].id },
      data: { secretoHash: await hashPassword(secreto) },
    });
  });
  const ruta = `/recuperar-contrasena/confirmar-correo#enlace=${componerEnlace(abiertos[0].id, secreto)}`;

  // 5) Sin sesión: abrir el enlace no cambia nada (R1626, R1628); el secreto sale de la barra.
  const publico = await (await browser.newContext({ userAgent })).newPage();
  await publico.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  await expect(publico).toHaveURL(/\/recuperar-contrasena\/confirmar-correo$/);
  await expect(publico.getByRole("heading", { level: 1, name: "Confirma tu correo" })).toBeVisible({
    timeout: 60_000,
  });
  // El correo aún no ha cambiado: la página dice que se PIDIÓ el cambio (review PR 3, m3).
  await expect(
    publico.getByText(
      "Tu administrador pidió cambiar el correo de tu cuenta. Confírmalo para empezar a entrar con el correo nuevo.",
    ),
  ).toBeVisible();
  const alAbrir = await base().usuario.findUniqueOrThrow({ where: { id }, select: { email: true } });
  expect(alAbrir.email).toBe(anterior);
  expect(await pendientesAbiertos(id)).toHaveLength(1);

  // 6) Confirmar (R1622).
  await publico.getByRole("button", { name: "Confirmar correo" }).click();
  await expect(publico.getByRole("heading", { level: 1, name: "Correo confirmado" })).toBeVisible({
    timeout: 30_000,
  });
  const confirmado = await base().usuario.findUniqueOrThrow({ where: { id }, select: { email: true } });
  expect(confirmado.email).toBe(nuevo);

  // 7) El mismo enlace ya no sirve (R1623). Pestaña nueva: en la misma, ir a la misma ruta con otro
  // fragmento no recarga la página.
  const otraVez = await publico.context().newPage();
  await otraVez.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  await otraVez.getByRole("button", { name: "Confirmar correo" }).click();
  // Por el texto y no por `role="alert"`: Next monta su propio anunciador de rutas con ese rol.
  await expect(
    otraVez.getByText("El enlace no es válido o ya venció. Pide a tu administrador que te envíe otro."),
  ).toBeVisible({ timeout: 30_000 });
  await publico.context().close();

  // 8) Entra con el correo nuevo y ya no con el anterior.
  const conNuevo = await intentarEntrar(browser, nuevo);
  await conNuevo.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  await conNuevo.context().close();

  const conAnterior = await intentarEntrar(browser, anterior);
  await expect(conAnterior.getByText(ERROR_LOGIN)).toBeVisible({ timeout: 60_000 });
  await expect(conAnterior).toHaveURL(/\/login/);
  await conAnterior.context().close();

  // 9) El maestro ve el cambio en el Histórico con el correo anterior y el nuevo (R1622).
  const historico = await comoMaestro(browser);
  await historico.goto("/historico/acciones", { waitUntil: "load", timeout: 180_000 });
  await expect(historico.getByRole("heading", { level: 1, name: "Acciones" })).toBeVisible({ timeout: 60_000 });
  const fila = historico.getByRole("row").filter({ hasText: "Cambió el correo de un usuario" });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(anterior);
  await expect(fila).toContainText(nuevo);
  await historico.context().close();
});
