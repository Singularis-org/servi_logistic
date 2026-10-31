import { randomBytes } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Cookie, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import { crearZonaE2E } from "./_aislamiento-datos";
import { clienteDueno } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-58 T10 (design §8 «E2E (R28)») — el superadmin crea un plan custom por pantalla, lo asigna desde
 * el detalle de la empresa y la empresa lo ve en «Mi plan».
 *
 * 1. Datos: dos empresas nuevas por el servicio del alta (`crearEmpresaE2E`). A hace de «empresa demo»
 *    (decisión cerrada del spec) y lleva un `mensajero` de una zona suya; B no recibe plan.
 * 2. El superadmin entra con OTP, abre «Planes» y crea desde «Nuevo plan» un custom de A con tope de
 *    órdenes y de mensajeros (los demás topes vacíos = sin límite) y todos los módulos (asignarlo no
 *    apaga ninguno).
 * 3. En el detalle de A elige el plan y pulsa «Asignar plan»: es la PRIMERA asignación, así que se abre
 *    el modal de confirmación (decisión del 2026-10-29) con lo que tendrá la empresa y el «Inicio del
 *    ciclo de órdenes» en hoy (T15); se espera a la vista previa y se confirma. El
 *    bloque «Plan» pasa a pintar el plan y su consumo, y el historial la asignación.
 * 4. El maestro de A abre `/mi-plan`: el nombre, «de <tope> órdenes del ciclo», «de <tope> Mensajero» y
 *    ninguna fila de Maestro (SLT-66 R5: el maestro no tiene tope).
 * 5. El maestro de B, sin plan, ve «sin límites» y ni el nombre del plan de A ni su id en el HTML.
 * 6. El `mensajero` de A recibe «No encontramos esta página» en `/mi-plan` (R8).
 * 7. Por detrás (`clienteDueno`): el plan existe, es custom de A y es el plan de A; B sigue sin plan.
 *
 * Los textos esperados se escriben a mano a propósito (son los literales del spec): derivarlos de los
 * componentes haría el test una tautología.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/planes-superadmin.spec.ts` (proyecto `aislamiento`,
 * arrastra `plataforma-vacia`). Base local desechable, migrada y con `pnpm run db:seed`. Todo lleva
 * sufijo aleatorio y nada se borra: dos corridas seguidas sobre la misma base pasan.
 */

test.describe.configure({ mode: "serial" });

const PANTALLA_DE_ERROR = "No pudimos cargar esta pantalla";
const SIN_PLAN_EMPRESA = "Tu empresa no tiene plan asignado: sin límites";
const TOPE_ORDENES = 50;
const TOPE_MENSAJEROS = 3;

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
let empresaA: EmpresaE2E | null = null;
let empresaB: EmpresaE2E | null = null;
let nombreEmpresaA = "";
const nombreDelPlan = `Plan E2E ${randomBytes(4).toString("hex")}`;
let planId = "";
const sesiones: { maestroA?: Cookie[]; maestroB?: Cookie[]; mensajeroA?: Cookie[] } = {};

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function db(): PrismaClient {
  if (!dueno) throw new Error("sin cliente de base: falló el beforeAll");
  return dueno;
}

function a(): EmpresaE2E {
  if (!empresaA) throw new Error("no hay empresa A: falló el beforeAll");
  return empresaA;
}

function b(): EmpresaE2E {
  if (!empresaB) throw new Error("no hay empresa B: falló el beforeAll");
  return empresaB;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  // 1. Las dos empresas y el mensajero de A (por los servicios reales, SL-44 A1).
  empresaA = await crearEmpresaE2E("planes-a");
  empresaB = await crearEmpresaE2E("planes-b");
  const base = abrirBaseE2E();
  try {
    const zona = await crearZonaE2E(base, a());
    const mensajero = await crearUsuarioE2E(a(), "mensajero", { zonaId: zona.id });
    const org = await base.organizacion.findUniqueOrThrow({ where: { id: a().organizacionId }, select: { nombre: true } });
    nombreEmpresaA = org.nombre;
    sesiones.maestroA = await sesionDe(browser, a().maestro);
    sesiones.maestroB = await sesionDe(browser, b().maestro);
    sesiones.mensajeroA = await sesionDe(browser, mensajero);
  } finally {
    await base.$disconnect();
  }

  // 2. El superadmin de prueba entra con OTP.
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));
  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(db(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  // Sin borrado: todo lleva sufijo aleatorio y la corrida siguiente no lo busca.
  await contextoSa?.close();
  await dueno?.$disconnect();
});

/** Abre `ruta` con la sesión dada en un contexto nuevo y devuelve el texto y el HTML. */
async function abrirCon(
  browser: Browser,
  sesion: Cookie[] | undefined,
  ruta: string,
): Promise<{ page: Page; ctx: BrowserContext; texto: string; html: string; estado: number | null; errores5xx: number[] }> {
  expect(sesion?.length ?? 0, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
  const ctx = await browser.newContext();
  await ctx.addCookies(sesion ?? []);
  const page = await ctx.newPage();
  const errores5xx: number[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500) errores5xx.push(r.status());
  });
  const respuesta = await page.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  return {
    page,
    ctx,
    texto: await page.locator("body").innerText(),
    html: await page.content(),
    estado: respuesta?.status() ?? null,
    errores5xx,
  };
}

test("el superadmin crea por pantalla un plan custom de A con tope de órdenes y de mensajeros (R28)", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const panel = page.getByRole("dialog");
  const form = panel.getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });

  await form.getByRole("textbox", { name: /^Nombre/ }).fill(nombreDelPlan);
  await form.getByRole("radio", { name: "Custom", exact: true }).click();
  await form.getByRole("combobox", { name: "Empresa" }).click();
  await page.getByRole("option", { name: nombreEmpresaA, exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Empresa" })).toHaveText(nombreEmpresaA);

  // Vacío = sin límite: solo órdenes y mensajeros llevan tope.
  await form.getByRole("textbox", { name: "Órdenes por ciclo" }).fill(String(TOPE_ORDENES));
  await form.getByRole("textbox", { name: "Usuarios activos con el rol Mensajero" }).fill(String(TOPE_MENSAJEROS));
  for (const modulo of ORDEN_MODULOS) {
    await form.getByRole("checkbox", { name: nombreDelModulo(modulo), exact: true }).check();
  }
  // SLT-66 R28: solo se asigna un plan con costo concreto, así que se crea «Con monto» y con costo por
  // orden (antes, «Sin precio»). El resto del recorrido no cambia.
  await form.getByRole("radio", { name: "Con monto", exact: true }).click();
  await form.getByLabel("Costo base mensual", { exact: true }).fill("1000");
  await form.getByLabel("Costo por orden", { exact: true }).fill("100");
  await form.getByRole("button", { name: "Crear plan" }).click();

  await expect(page.getByRole("status").filter({ hasText: `Plan «${nombreDelPlan}» creado.` })).toBeVisible({
    timeout: 60_000,
  });
  const fila = page.getByRole("row").filter({ has: page.getByRole("link", { name: `Ver el plan ${nombreDelPlan}` }) });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(`Custom de ${nombreEmpresaA}`);
  await expect(fila).toContainText(`Órdenes por ciclo: ${TOPE_ORDENES}`);
  await expect(fila).toContainText(`Usuarios activos con el rol Mensajero: ${TOPE_MENSAJEROS}`);

  // Por detrás: el plan existe, es custom de A, con esos topes y sin asignar todavía.
  const plan = await db().plan.findFirstOrThrow({
    where: { nombre: nombreDelPlan },
    select: { id: true, visibilidad: true, organizacionExclusivaId: true, topeOrdenesCiclo: true, topeApiKeys: true },
  });
  expect(plan.visibilidad).toBe("custom");
  expect(plan.organizacionExclusivaId).toBe(a().organizacionId);
  expect(plan.topeOrdenesCiclo).toBe(TOPE_ORDENES);
  expect(plan.topeApiKeys).toBeNull();
  planId = plan.id;
  const sinAsignar = await db().organizacion.findUniqueOrThrow({ where: { id: a().organizacionId }, select: { planId: true } });
  expect(sinAsignar.planId, "crear no asigna").toBeNull();
});

test("el superadmin lo asigna desde el detalle de A, pasando el modal de la primera asignación (R28)", async () => {
  test.setTimeout(240_000);
  expect(planId, "no hay plan: falló el caso anterior").not.toBe("");
  const page = superadmin();
  await page.goto(`/plataforma/empresas/${a().organizacionId}`);
  const bloque = page.getByRole("region", { name: "Plan", exact: true });
  await expect(bloque.getByText("Sin plan: sin límites")).toBeVisible({ timeout: 60_000 });

  await bloque.getByRole("combobox", { name: "Plan a asignar" }).click();
  await page.getByRole("option", { name: `${nombreDelPlan} (Custom)`, exact: true }).click();
  await bloque.getByRole("button", { name: "Asignar plan", exact: true }).click();

  // La primera asignación pide confirmación: lo que tendrá la empresa, y «Volver» no asigna.
  const modal = page.getByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  await expect(modal).toContainText(`Asignar ${nombreDelPlan} a ${nombreEmpresaA}: desde ahora tendrá:`);
  await expect(modal.getByRole("list", { name: "Lo que tendrá la empresa" })).toContainText(
    `Órdenes por ciclo: ${TOPE_ORDENES}`,
  );
  await modal.getByRole("button", { name: "Volver" }).click();
  await expect(modal).toBeHidden();
  const trasVolver = await db().organizacion.findUniqueOrThrow({ where: { id: a().organizacionId }, select: { planId: true } });
  expect(trasVolver.planId, "«Volver» asignó el plan").toBeNull();

  await bloque.getByRole("button", { name: "Asignar plan", exact: true }).click();
  await expect(modal).toBeVisible({ timeout: 30_000 });

  // SLT-58 T15 (R29, R37, R38): el campo de inicio del ciclo abre con «hoy» (hora de la plataforma) y
  // la frase lo repite; «Asignar plan» del modal no se habilita hasta que llega la vista previa (P11).
  const hoy = fechaCalendarioCR(new Date());
  await expect(modal.getByLabel("Inicio del ciclo de órdenes")).toHaveValue(hoy);
  await expect(modal).toContainText(`El ciclo de órdenes empieza el ${hoy}.`);
  const confirmar = modal.getByRole("button", { name: "Asignar plan", exact: true });
  await expect(confirmar).toBeEnabled({ timeout: 60_000 });
  // Empresa nueva: no pasa ningún tope, así que la vista previa no avisa de nada ni falla.
  await expect(modal).not.toContainText("No se pudo comprobar el consumo de la empresa");
  await expect(modal).not.toContainText("no podrá");
  await confirmar.click();

  // Tras el `refresh`, el bloque pinta el plan y su consumo; el historial, la asignación.
  await expect(bloque.getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible({ timeout: 60_000 });
  const consumo = bloque.getByRole("list", { name: "Consumo" });
  await expect(consumo).toContainText(`0 de ${TOPE_ORDENES} órdenes del ciclo`);
  await expect(consumo).toContainText(`1 de ${TOPE_MENSAJEROS} Mensajero`);
  await expect(bloque.getByRole("table", { name: "Historial de asignaciones" })).toContainText(nombreDelPlan);

  const asignada = await db().organizacion.findUniqueOrThrow({
    where: { id: a().organizacionId },
    select: { planId: true, planCicloAnclaAt: true, planCicloCortoDesdeAt: true },
  });
  expect(asignada.planId).toBe(planId);
  // «Hoy» ancla en el instante de la asignación (P9): sin ciclo corto (R34 solo con fecha futura).
  expect(asignada.planCicloAnclaAt, "la primera asignación no fijó el ancla").not.toBeNull();
  expect(asignada.planCicloCortoDesdeAt, "«hoy» no abre ciclo corto").toBeNull();
});

test("el maestro de A ve en «Mi plan» el nombre, sus topes y su consumo (R28)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page, texto, estado, errores5xx } = await abrirCon(browser, sesiones.maestroA, "/mi-plan");
  try {
    expect(estado).toBeLessThan(400);
    expect(texto.includes(PANTALLA_DE_ERROR), "pantalla de error").toBe(false);
    expect(texto.includes(NO_ENCONTRADO), "«no encontrado» para el maestro").toBe(false);
    await expect(page.getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible();
    const consumo = page.getByRole("list", { name: "Consumo" });
    await expect(consumo).toContainText(`0 de ${TOPE_ORDENES} órdenes del ciclo`);
    await expect(consumo).toContainText(`1 de ${TOPE_MENSAJEROS} Mensajero`);
    // SLT-66 R5: el maestro no tiene tope ni fila de consumo; antes, «1 Maestro · sin límite».
    await expect(consumo).not.toContainText("Maestro");
    expect(texto.includes(SIN_PLAN_EMPRESA), "A ve el aviso de sin plan").toBe(false);
    expect(errores5xx).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("el maestro de B, sin plan, ve «sin límites» y nada del plan de A (R28, R9)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, page, texto, html, estado, errores5xx } = await abrirCon(browser, sesiones.maestroB, "/mi-plan");
  try {
    expect(estado).toBeLessThan(400);
    expect(texto.includes(PANTALLA_DE_ERROR), "pantalla de error").toBe(false);
    await expect(page.getByText(SIN_PLAN_EMPRESA, { exact: true })).toBeVisible();
    expect(html.includes(nombreDelPlan), "B ve el nombre del plan de A").toBe(false);
    expect(html.includes(planId), "B tiene el id del plan de A en el HTML").toBe(false);
    expect(errores5xx).toEqual([]);
  } finally {
    await ctx.close();
  }
  const sinPlan = await db().organizacion.findUniqueOrThrow({ where: { id: b().organizacionId }, select: { planId: true } });
  expect(sinPlan.planId, "B no debe tener plan").toBeNull();
});

test("el mensajero de A recibe «no encontrado» en «Mi plan» (R28, R8)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { ctx, texto, html, estado } = await abrirCon(browser, sesiones.mensajeroA, "/mi-plan");
  try {
    // R8: 404 HTTP real, no solo el texto. `/mi-plan` no tiene `loading.tsx` para que `notFound()`
    // ocurra antes de mandar la cabecera.
    console.log(`[planes] /mi-plan del mensajero: estado HTTP ${estado}`);
    expect(estado, "el mensajero no recibe un 404 HTTP").toBe(404);
    expect(texto.includes(NO_ENCONTRADO), "el mensajero no ve «no encontrado»").toBe(true);
    expect(html.includes(nombreDelPlan), "el mensajero ve el nombre del plan").toBe(false);
  } finally {
    await ctx.close();
  }
});
