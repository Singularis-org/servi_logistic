import { randomBytes, randomInt, randomUUID } from "node:crypto";

import { test, expect, type Browser, type Cookie, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SL-36 T9.1 — integraciones por empresa, de punta a punta (R6, R12, R13, R18, R32, R36).
 *
 * La pantalla `/configuracion/integraciones` prueba contra el doble de design §15
 * (`lib/clients/probadores/probador-doble.ts`): un secreto que empieza por `valido-` pasa y
 * cualquier otro se rechaza. `playwright.config.ts` fija `INTEGRACIONES_PROBADOR_DOBLE=1` y el
 * anillo de prueba de la bóveda en el servidor.
 *
 * Recorrido, en serie y sobre dos empresas (A y B) creadas por la fábrica:
 * 1. El maestro de A intenta dar de alta WhatsApp con secretos que no empiezan por `valido-`: ve el
 *    texto del catálogo, la base no tiene fila (R13) y el formulario conserva solo lo no secreto
 *    (R36).
 * 2. Lo vuelve a intentar con secretos `valido-…`: la tarjeta queda «Conectada» (R12) y el token del
 *    webhook se ve UNA vez; al recargar ya no está en el HTML (R18).
 * 3. Con la integración de A conectada: el adminTienda de A, el maestro de B y el superadmin no ven
 *    nada de ella ni tienen formulario (R6).
 * 4. El maestro de A prueba la conexión, abre «Desconectar», ve la marca y lo que deja de funcionar
 *    ANTES de confirmar, confirma, y la fila desaparece de la base (R32).
 *
 * Los oráculos de texto (mensaje de rechazo, «qué deja de funcionar») van escritos a mano: sacarlos
 * del catálogo convertiría la aserción en una comparación del código consigo mismo.
 *
 * Datos: empresas, usuarios y marcadores nuevos en cada corrida (`A-<uuid>`, número aleatorio), así
 * que dos corridas seguidas sobre la misma base pasan. Nada se busca por nombre fijo ni por total.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/integraciones-por-empresa.spec.ts --project=aislamiento`.
 */

test.describe.configure({ mode: "serial" });

const TARJETA = "WhatsApp Business";
const SIN_PERMISO = "No tienes permiso para acceder a esta sección.";
const RECHAZO_WHATSAPP =
  "WhatsApp rechazó la credencial. Revisa que la copiaste entera y que sigue vigente en el panel de Meta.";
const QUE_DEJA_DE_FUNCIONAR =
  "No salen los avisos automáticos a los clientes, no hay chat con ellos, no se envía el mensaje de bienvenida y no se pueden crear ni sincronizar plantillas.";
const RUTA = "/configuracion/integraciones";

interface DatosWhatsapp {
  nombreVisible: string;
  numeroId: string;
  wabaId: string;
}

let db: PrismaClient | null = null;
let empresaA: EmpresaE2E | null = null;
let empresaB: EmpresaE2E | null = null;
const sesiones: { maestroA?: Cookie[]; adminA?: Cookie[]; maestroB?: Cookie[] } = {};
const whatsappA: DatosWhatsapp = {
  nombreVisible: `A-${randomUUID()}`,
  numeroId: `9${randomInt(10 ** 9, 10 ** 10 - 1)}${randomInt(1000, 9999)}`,
  wabaId: `waba-a-${randomBytes(6).toString("hex")}`,
};
/** El token que mostró el alta; se guarda para afirmar que la recarga ya no lo trae. */
let tokenMostrado = "";

function base(): PrismaClient {
  if (!db) throw new Error("sin cliente de base: falló el beforeAll");
  return db;
}

function empresa(e: EmpresaE2E | null, letra: string): EmpresaE2E {
  if (!e) throw new Error(`no hay empresa ${letra}: falló el beforeAll`);
  return e;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  db = abrirBaseE2E();
  empresaA = await crearEmpresaE2E("integraciones A");
  empresaB = await crearEmpresaE2E("integraciones B");
  const adminA = await crearUsuarioE2E(empresaA, "adminTienda");
  sesiones.maestroA = await sesionDe(browser, empresaA.maestro);
  sesiones.adminA = await sesionDe(browser, adminA);
  sesiones.maestroB = await sesionDe(browser, empresaB.maestro);
});

test.afterAll(async () => {
  // La base es desechable: no se borra nada.
  await db?.$disconnect();
});

async function paginaCon(browser: Browser, cookies: Cookie[] | undefined, quien: string): Promise<Page> {
  expect(cookies?.length ?? 0, `no hay sesión de ${quien}: el login del beforeAll no dejó cookies`).toBeGreaterThan(0);
  const ctx = await browser.newContext();
  await ctx.addCookies(cookies ?? []);
  return ctx.newPage();
}

async function abrirIntegraciones(page: Page): Promise<void> {
  const r = await page.goto(RUTA, { waitUntil: "load", timeout: 180_000 });
  expect(r?.status() ?? 0, `${RUTA}: estado HTTP`).toBeLessThan(400);
}

async function filasDe(e: EmpresaE2E): Promise<number> {
  return base().integracion.count({ where: { organizacionId: e.organizacionId } });
}

async function llenarAltaWhatsapp(page: Page, datos: DatosWhatsapp, secretos: { token: string; appSecret: string }) {
  const tarjeta = page.getByRole("region", { name: TARJETA });
  await tarjeta.getByRole("button", { name: "Configurar" }).click();
  const form = page.getByRole("form", { name: TARJETA });
  await form.getByRole("textbox", { name: "Nombre visible", exact: true }).fill(datos.nombreVisible);
  await form.getByRole("textbox", { name: "Phone Number ID", exact: true }).fill(datos.numeroId);
  await form.getByRole("textbox", { name: "WABA ID", exact: true }).fill(datos.wabaId);
  await form.getByRole("textbox", { name: "Token de acceso", exact: true }).fill(secretos.token);
  await form.getByRole("textbox", { name: "App Secret", exact: true }).fill(secretos.appSecret);
  await form.getByRole("button", { name: "Probar y guardar" }).click();
  return form;
}

test("alta rechazada: texto del catálogo, ninguna fila y solo lo no secreto se conserva (R13, R36)", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = empresa(empresaA, "A");
  const page = await paginaCon(browser, sesiones.maestroA, "maestro A");
  await abrirIntegraciones(page);
  await expect(page.getByRole("region", { name: TARJETA }).getByTestId("estado-integracion")).toHaveText("Sin configurar");

  const form = await llenarAltaWhatsapp(page, whatsappA, {
    token: `malo-${randomBytes(8).toString("hex")}`,
    appSecret: `malo-${randomBytes(8).toString("hex")}`,
  });
  await expect(form.getByRole("alert")).toHaveText(RECHAZO_WHATSAPP, { timeout: 60_000 });

  expect(await filasDe(a), "R13: el alta rechazada dejó una fila").toBe(0);
  // R36: los secretos se vacían y lo no secreto se queda.
  await expect(form.getByRole("textbox", { name: "Token de acceso", exact: true })).toHaveValue("");
  await expect(form.getByRole("textbox", { name: "App Secret", exact: true })).toHaveValue("");
  await expect(form.getByRole("textbox", { name: "Token de acceso", exact: true })).toHaveAttribute("type", "password");
  await expect(form.getByRole("textbox", { name: "Phone Number ID", exact: true })).toHaveValue(whatsappA.numeroId);
  await expect(page.getByRole("dialog", { name: "Webhook de WhatsApp" })).toHaveCount(0);
  await page.context().close();
});

test("alta buena: conectada, el token se ve una vez y al recargar no está en el HTML (R12, R18)", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = empresa(empresaA, "A");
  const page = await paginaCon(browser, sesiones.maestroA, "maestro A");
  await abrirIntegraciones(page);
  const tokenAcceso = `valido-${randomBytes(12).toString("hex")}`;
  const appSecret = `valido-${randomBytes(12).toString("hex")}`;
  await llenarAltaWhatsapp(page, whatsappA, { token: tokenAcceso, appSecret });

  const revelado = page.getByRole("dialog", { name: "Webhook de WhatsApp" });
  await expect(revelado).toBeVisible({ timeout: 60_000 });
  const campoToken = revelado.getByRole("textbox", { name: "Token de verificación", exact: true });
  tokenMostrado = await campoToken.inputValue();
  expect(tokenMostrado.length, "R18: el diálogo no trae token").toBeGreaterThanOrEqual(16);
  await expect(revelado.getByRole("textbox", { name: "URL del webhook", exact: true })).toHaveValue(/\/api\/webhooks\/whatsapp$/);

  expect(await filasDe(a), "R12: el alta buena no dejó exactamente una fila de A").toBe(1);

  await revelado.getByRole("checkbox", { name: "Ya pegué el token en Meta o lo guardé en un lugar seguro" }).click();
  await revelado.getByRole("button", { name: "Cerrar" }).click();
  await expect(revelado).toHaveCount(0);

  // Con el diálogo cerrado (mientras está abierto el fondo es inerte): la tarjeta, ya revalidada.
  const tarjeta = page.getByRole("region", { name: TARJETA });
  await expect(tarjeta.getByTestId("estado-integracion")).toHaveText("Conectada");
  await expect(tarjeta).toContainText(whatsappA.nombreVisible);

  await page.reload({ waitUntil: "load" });
  // Control: la recarga sí trae la integración (si no cargara, «no hay token» no probaría nada).
  await expect(page.getByRole("region", { name: TARJETA }).getByTestId("estado-integracion")).toHaveText("Conectada");
  await expect(page.getByRole("navigation", { name: "Navegación principal" }).locator(`a[href="${RUTA}"]`)).toHaveCount(1);
  const html = await page.content();
  expect(html.includes(whatsappA.nombreVisible), "control: el HTML recargado no trae la integración").toBe(true);
  expect(html.includes(tokenMostrado), "R18: el token sigue en el HTML tras recargar").toBe(false);
  expect(html.includes(tokenAcceso), "R5: el token de acceso está en el HTML").toBe(false);
  expect(html.includes(appSecret), "R5: el App Secret está en el HTML").toBe(false);
  await expect(page.getByRole("dialog", { name: "Webhook de WhatsApp" })).toHaveCount(0);
  await page.context().close();
});

test("el admin de A, el maestro de B y el superadmin no ven la integración de A ni su formulario (R6)", async ({ browser }) => {
  test.setTimeout(300_000);
  const a = empresa(empresaA, "A");
  expect(await filasDe(a), "precondición: A tiene su WhatsApp conectado").toBe(1);
  const fugas = [whatsappA.nombreVisible, whatsappA.numeroId, whatsappA.wabaId];

  async function sinNadaDeA(page: Page, quien: string): Promise<string> {
    await abrirIntegraciones(page);
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
    const html = await page.content();
    for (const f of fugas) expect.soft(html.includes(f), `${quien}: ve «${f}» de la integración de A`).toBe(false);
    expect.soft(html.includes(tokenMostrado), `${quien}: ve el token del webhook de A`).toBe(false);
    return html;
  }

  // El admin de A: la pantalla le niega el acceso y el menú no la enlaza.
  const admin = await paginaCon(browser, sesiones.adminA, "admin A");
  await sinNadaDeA(admin, "admin A");
  await expect(admin.getByText(SIN_PERMISO)).toBeVisible();
  await expect(admin.getByRole("region", { name: TARJETA })).toHaveCount(0);
  await expect(admin.getByRole("form", { name: TARJETA })).toHaveCount(0);
  await expect(admin.locator(`a[href="${RUTA}"]`)).toHaveCount(0);
  await admin.context().close();

  // El maestro de B: su propia pantalla, con su WhatsApp sin configurar.
  const maestroB = await paginaCon(browser, sesiones.maestroB, "maestro B");
  await sinNadaDeA(maestroB, "maestro B");
  await expect(maestroB.getByRole("region", { name: TARJETA }).getByTestId("estado-integracion")).toHaveText(
    "Sin configurar",
  );
  expect(await filasDe(empresa(empresaB, "B")), "B no tiene integraciones").toBe(0);
  await maestroB.context().close();

  // El superadmin: entra con OTP (es único por base) y no tiene formulario.
  const dueno = base();
  const ctxSa = await browser.newContext();
  const sa = await ctxSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await asegurarSuperadmin(dueno);
    await olvidarDispositivos(dueno, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(sa, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await sinNadaDeA(sa, "superadmin");
  console.log(`[integraciones] superadmin en ${RUTA} termina en ${new URL(sa.url()).pathname}`);
  expect(new URL(sa.url()).pathname.startsWith("/login"), "superadmin: la sesión no quedó abierta").toBe(false);
  await expect(sa.getByText(SIN_PERMISO)).toBeVisible();
  await expect(sa.getByRole("form", { name: TARJETA })).toHaveCount(0);
  await expect(sa.getByRole("button", { name: "Probar y guardar" })).toHaveCount(0);
  await expect(sa.getByRole("button", { name: "Configurar" })).toHaveCount(0);
  await expect(sa.locator(`a[href="${RUTA}"]`)).toHaveCount(0);
  await ctxSa.close();
});

test("probar y desconectar: el aviso de qué deja de funcionar va antes y la fila se borra (R31, R32)", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = empresa(empresaA, "A");
  const page = await paginaCon(browser, sesiones.maestroA, "maestro A");
  await abrirIntegraciones(page);
  const tarjeta = page.getByRole("region", { name: TARJETA });
  await expect(tarjeta.getByTestId("estado-integracion")).toHaveText("Conectada");

  await tarjeta.getByRole("button", { name: "Probar conexión" }).click();
  await expect(page.getByText("La conexión funciona.")).toBeVisible({ timeout: 60_000 });
  await expect(tarjeta.getByTestId("ultima-prueba")).not.toHaveText("Todavía no se ha probado");

  await tarjeta.getByRole("button", { name: "Desconectar" }).click();
  const dialogo = page.getByRole("dialog", { name: "¿Desconectar WhatsApp Business?" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByTestId("marca-desconexion")).toHaveText("Requerido");
  await expect(dialogo.getByTestId("que-deja-de-funcionar")).toHaveText(QUE_DEJA_DE_FUNCIONAR);
  // Ver el aviso no desconecta: la fila sigue ahí hasta confirmar.
  expect(await filasDe(a), "abrir el diálogo ya desconectó").toBe(1);

  await dialogo.getByRole("button", { name: "Desconectar" }).click();
  await expect(dialogo).toHaveCount(0, { timeout: 60_000 });
  await expect(tarjeta.getByTestId("estado-integracion")).toHaveText("Sin configurar", { timeout: 60_000 });
  await expect.poll(() => filasDe(a), { message: "R32: la integración sigue en la base" }).toBe(0);

  await page.reload({ waitUntil: "load" });
  await expect(page.getByRole("region", { name: TARJETA }).getByTestId("estado-integracion")).toHaveText("Sin configurar");
  expect((await page.content()).includes(whatsappA.nombreVisible), "R32: la pantalla aún muestra lo de A").toBe(false);
  await page.context().close();
});
