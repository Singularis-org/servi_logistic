import { randomBytes } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import { fechaCalendarioCR, mananaCalendarioCR } from "../lib/utils/fecha-cr";
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
 * SLT-58 T10 (design §8 «E2E (R28)») — el superadmin crea un plan custom por pantalla, que queda
 * asignado a su empresa al crearlo (ajuste planes-custom D2), asigna un plan público desde el detalle
 * de otra empresa con el modal de primera asignación, y cada empresa ve en «Mi plan» lo suyo.
 *
 * 1. Datos: tres empresas nuevas por el servicio del alta (`crearEmpresaE2E`). A hace de «empresa demo»
 *    (decisión cerrada del spec) y lleva un `mensajero` de una zona suya; B no recibe plan; C recibe el
 *    plan público por el modal de primera asignación.
 * 2. El superadmin entra con OTP, abre «Planes» y crea desde «Nuevo plan» un custom de A con tope de
 *    mensajeros (los demás topes vacíos = sin límite; SLT-86 R8: ya no hay tope de órdenes, ni su
 *    campo), todos los módulos, tipo de cobro
 *    «Anual» (D6) y el «Inicio del ciclo de órdenes» que el form pide porque A no tiene plan (D4; abre en
 *    mañana, D5, y se pone en hoy). Crearlo lo deja asignado a A (D2).
 * 3. El detalle de A pinta el plan, su consumo, «Tipo de cobro: Anual» (D9) y la fila del historial.
 * 4. El superadmin crea por pantalla un plan PÚBLICO con costo concreto (R28): no pide empresa, tipo de
 *    cobro ni inicio del ciclo, y no se asigna a nadie.
 * 5. En el detalle de C (sin plan) elige el público y pulsa «Asignar plan»: es la PRIMERA asignación, así
 *    que se abre el modal de confirmación (decisión del 2026-10-29) con lo que tendrá la empresa, el
 *    «Inicio del ciclo de órdenes» en mañana (D5; antes, hoy), «El plan empieza a regir el {fecha}.»
 *    (SLT-86 §7.1; antes, «El ciclo de órdenes empieza…») y el tipo de cobro (D6). Se pone hoy, se
 *    espera a la vista previa y se confirma.
 * 6. El maestro de A abre `/mi-plan`: el nombre, «Órdenes en el período: 0» (SLT-86 R7, R8: sin tope;
 *    antes, «0 de <tope> órdenes del ciclo»), «de <tope> Mensajero» y ninguna fila de Maestro (SLT-66
 *    R5: el maestro no tiene tope).
 * 7. El maestro de B, sin plan, ve «sin límites» y ni el nombre del plan de A ni su id en el HTML.
 * 8. El `mensajero` de A recibe «No encontramos esta página» en `/mi-plan` (R8).
 * 9. Por detrás (`clienteDueno`): el custom es de A y es el plan de A, el público es el de C; B sigue
 *    sin plan.
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
const TOPE_MENSAJEROS = 3;
/** SLT-86 (R7, R8; design §7.1): el conteo del período, sin tope ni barra, de una empresa que empieza hoy. */
const ORDENES_EN_EL_PERIODO_CERO = "Órdenes en el período: 0";
/** SLT-86 (R8): el rótulo del tope de órdenes que ya no existe, en ningún sitio. */
const TOPE_DE_ORDENES = "Órdenes por ciclo";

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
let empresaA: EmpresaE2E | null = null;
let empresaB: EmpresaE2E | null = null;
let empresaC: EmpresaE2E | null = null;
let nombreEmpresaA = "";
let nombreEmpresaC = "";
const nombreDelPlan = `Plan E2E ${randomBytes(4).toString("hex")}`;
let planId = "";
/** El plan público del modal de primera asignación (ajuste planes-custom D2: un custom ya no pasa por él). */
const nombreDelPublico = `Plan E2E publico ${randomBytes(4).toString("hex")}`;
let publicoId = "";
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

function c(): EmpresaE2E {
  if (!empresaC) throw new Error("no hay empresa C: falló el beforeAll");
  return empresaC;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  // 1. Las tres empresas y el mensajero de A (por los servicios reales, SL-44 A1).
  empresaA = await crearEmpresaE2E("planes-a");
  empresaB = await crearEmpresaE2E("planes-b");
  empresaC = await crearEmpresaE2E("planes-c");
  const base = abrirBaseE2E();
  try {
    const zona = await crearZonaE2E(base, a());
    const mensajero = await crearUsuarioE2E(a(), "mensajero", { zonaId: zona.id });
    const org = await base.organizacion.findUniqueOrThrow({ where: { id: a().organizacionId }, select: { nombre: true } });
    nombreEmpresaA = org.nombre;
    const orgC = await base.organizacion.findUniqueOrThrow({ where: { id: c().organizacionId }, select: { nombre: true } });
    nombreEmpresaC = orgC.nombre;
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

/** Rellena los campos comunes del form de un plan: nombre, topes, módulos y costo concreto (R28). */
async function rellenarPlan(form: Locator, nombre: string, visibilidad: "Público" | "Custom"): Promise<void> {
  await form.getByRole("textbox", { name: /^Nombre/ }).fill(nombre);
  await form.getByRole("radio", { name: visibilidad, exact: true }).click();
  // Vacío = sin límite: solo mensajeros lleva tope. SLT-86 (R8, R23): el campo de órdenes ya no está.
  await expect(form.getByRole("textbox", { name: TOPE_DE_ORDENES })).toHaveCount(0);
  await form.getByRole("textbox", { name: "Usuarios activos con el rol Mensajero" }).fill(String(TOPE_MENSAJEROS));
  for (const modulo of ORDEN_MODULOS) {
    await form.getByRole("checkbox", { name: nombreDelModulo(modulo), exact: true }).check();
  }
  // SLT-66 R28: solo se asigna un plan con costo concreto, así que se crea «Con monto» y con costo por
  // orden (antes, «Sin precio»).
  await form.getByRole("radio", { name: "Con monto", exact: true }).click();
  await form.getByLabel("Costo base mensual", { exact: true }).fill("1000");
  await form.getByLabel("Costo por orden", { exact: true }).fill("100");
}

async function abrirNuevoPlan(page: Page): Promise<Locator> {
  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const form = page.getByRole("dialog").getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });
  return form;
}

test("el superadmin crea por pantalla un custom de A, que queda asignado con su tipo de cobro (R28, D2, D4–D6)", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  const form = await abrirNuevoPlan(page);

  await rellenarPlan(form, nombreDelPlan, "Custom");
  await form.getByRole("combobox", { name: "Empresa" }).click();
  await page.getByRole("option", { name: nombreEmpresaA, exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Empresa" })).toHaveText(nombreEmpresaA);

  // D6: el tipo de cobro, «Mensual» por defecto; se elige «Anual».
  const tipo = form.getByRole("radiogroup", { name: "Tipo de cobro" });
  await expect(tipo.getByRole("radio", { name: "Mensual", exact: true })).toBeChecked();
  await tipo.getByRole("radio", { name: "Anual", exact: true }).click();
  await expect(tipo.getByRole("radio", { name: "Anual", exact: true })).toBeChecked();

  // D4/D5: A no tiene plan, así que el form pide el inicio del ciclo, que abre en mañana. Se pone hoy:
  // el ancla queda en el instante de la creación y el consumo de «Mi plan» empieza en 0.
  const inicio = form.getByLabel("Inicio del ciclo de órdenes", { exact: true });
  await expect(inicio).toHaveValue(mananaCalendarioCR(new Date()));
  const hoy = fechaCalendarioCR(new Date());
  await inicio.fill(hoy);

  // D13/D17: «Crear plan» espera a la vista previa; empresa nueva, así que ni avisa ni falla.
  const crear = form.getByRole("button", { name: "Crear plan" });
  await expect(crear).toBeEnabled({ timeout: 60_000 });
  await expect(form).not.toContainText("No se pudo comprobar el consumo de la empresa");
  await crear.click();

  await expect(page.getByRole("status").filter({ hasText: `Plan «${nombreDelPlan}» creado.` })).toBeVisible({
    timeout: 60_000,
  });
  const fila = page.getByRole("row").filter({ has: page.getByRole("link", { name: `Ver el plan ${nombreDelPlan}` }) });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(`Custom de ${nombreEmpresaA}`);
  await expect(fila).not.toContainText(TOPE_DE_ORDENES);
  await expect(fila).toContainText(`Usuarios activos con el rol Mensajero: ${TOPE_MENSAJEROS}`);

  // Por detrás: el plan existe, es custom de A, con esos topes, y crearlo lo dejó asignado a A (D2).
  const plan = await db().plan.findFirstOrThrow({
    where: { nombre: nombreDelPlan },
    // SLT-86 (R8): la columna `tope_ordenes_ciclo` ya no existe.
    select: { id: true, visibilidad: true, organizacionExclusivaId: true, topeApiKeys: true },
  });
  expect(plan.visibilidad).toBe("custom");
  expect(plan.organizacionExclusivaId).toBe(a().organizacionId);
  expect(plan.topeApiKeys).toBeNull();
  planId = plan.id;
  const asignada = await db().organizacion.findUniqueOrThrow({
    where: { id: a().organizacionId },
    select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true },
  });
  expect(asignada.planId, "crear un custom con empresa lo asigna (D2)").toBe(planId);
  expect(asignada.planTipoCobro, "el tipo de cobro elegido en el form (D6)").toBe("anual");
  // SLT-86 (P4 = a): ya no hay ciclo corto (la columna `plan_ciclo_corto_desde_at` se fue); queda el ancla.
  expect(asignada.planCicloAnclaAt, "crear y asignar no fijó el ancla").not.toBeNull();
});

test("el detalle de A pinta el custom asignado: consumo, tipo de cobro e historial (R28, D2, D9, D14)", async () => {
  test.setTimeout(240_000);
  expect(planId, "no hay plan: falló el caso anterior").not.toBe("");
  const page = superadmin();
  await page.goto(`/plataforma/empresas/${a().organizacionId}`);
  const bloque = page.getByRole("region", { name: "Plan", exact: true });
  await expect(bloque.getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(bloque).not.toContainText("Sin plan: sin límites");
  const consumo = bloque.getByRole("list", { name: "Consumo" });
  await expect(consumo).toContainText(ORDENES_EN_EL_PERIODO_CERO);
  await expect(consumo).not.toContainText("órdenes del ciclo");
  await expect(consumo).toContainText(`1 de ${TOPE_MENSAJEROS} Mensajero`);
  await expect(bloque.getByRole("list", { name: "Cobro del plan" })).toContainText("Tipo de cobro: Anual");
  const historial = bloque.getByRole("table", { name: "Historial de asignaciones" });
  await expect(historial).toContainText(nombreDelPlan);
  await expect(historial).toContainText("Anual");
});

test("el superadmin crea por pantalla un plan público con costo concreto, que no se asigna a nadie (R28)", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  const form = await abrirNuevoPlan(page);

  await rellenarPlan(form, nombreDelPublico, "Público");
  // Un público no nombra empresa, ni lleva tipo de cobro ni inicio del ciclo (D2: no se asigna al crearlo).
  await expect(form.getByRole("combobox", { name: "Empresa" })).toHaveCount(0);
  await expect(form.getByRole("radiogroup", { name: "Tipo de cobro" })).toHaveCount(0);
  await expect(form.getByLabel("Inicio del ciclo de órdenes", { exact: true })).toHaveCount(0);
  await form.getByRole("button", { name: "Crear plan" }).click();

  await expect(page.getByRole("status").filter({ hasText: `Plan «${nombreDelPublico}» creado.` })).toBeVisible({
    timeout: 60_000,
  });
  const plan = await db().plan.findFirstOrThrow({
    where: { nombre: nombreDelPublico },
    select: { id: true, visibilidad: true, organizacionExclusivaId: true },
  });
  expect(plan.visibilidad).toBe("publico");
  expect(plan.organizacionExclusivaId).toBeNull();
  publicoId = plan.id;
  const conElPlan = await db().organizacion.count({ where: { planId: publicoId } });
  expect(conElPlan, "crear un público no lo asigna").toBe(0);
});

test("el superadmin asigna el público desde el detalle de C, pasando el modal de la primera asignación (R28)", async () => {
  test.setTimeout(240_000);
  expect(publicoId, "no hay plan público: falló el caso anterior").not.toBe("");
  const page = superadmin();
  await page.goto(`/plataforma/empresas/${c().organizacionId}`);
  const bloque = page.getByRole("region", { name: "Plan", exact: true });
  await expect(bloque.getByText("Sin plan: sin límites")).toBeVisible({ timeout: 60_000 });

  await bloque.getByRole("combobox", { name: "Plan a asignar" }).click();
  await page.getByRole("option", { name: `${nombreDelPublico} (Público)`, exact: true }).click();
  await bloque.getByRole("button", { name: "Asignar plan", exact: true }).click();

  // La primera asignación pide confirmación: lo que tendrá la empresa, y «Volver» no asigna.
  const modal = page.getByRole("dialog", { name: "¿Asignar este plan a la empresa?" });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  await expect(modal).toContainText(`Asignar ${nombreDelPublico} a ${nombreEmpresaC}: desde ahora tendrá:`);
  const loQueTendra = modal.getByRole("list", { name: "Lo que tendrá la empresa" });
  await expect(loQueTendra).toContainText(`Usuarios activos con el rol Mensajero: ${TOPE_MENSAJEROS}`);
  // SLT-86 (R8): sin tope de órdenes en lo que tendrá la empresa.
  await expect(loQueTendra).not.toContainText(TOPE_DE_ORDENES);
  await modal.getByRole("button", { name: "Volver" }).click();
  await expect(modal).toBeHidden();
  const trasVolver = await db().organizacion.findUniqueOrThrow({ where: { id: c().organizacionId }, select: { planId: true } });
  expect(trasVolver.planId, "«Volver» asignó el plan").toBeNull();

  await bloque.getByRole("button", { name: "Asignar plan", exact: true }).click();
  await expect(modal).toBeVisible({ timeout: 30_000 });

  // D5 (antes SLT-58 T15, R29: «hoy»): el inicio del ciclo abre en MAÑANA (hora de la plataforma) y la
  // frase lo repite. Se pone hoy y la frase lo sigue (R38). SLT-86 (design §7.1): la frase pasó de «El
  // ciclo de órdenes empieza el {fecha}.» a «El plan empieza a regir el {fecha}.».
  const manana = mananaCalendarioCR(new Date());
  const hoy = fechaCalendarioCR(new Date());
  const inicio = modal.getByLabel("Inicio del ciclo de órdenes");
  await expect(inicio).toHaveValue(manana);
  await expect(modal).toContainText(`El plan empieza a regir el ${manana}.`);
  await inicio.fill(hoy);
  await expect(modal).toContainText(`El plan empieza a regir el ${hoy}.`);
  // D6: el tipo de cobro de la primera asignación, «Mensual» por defecto.
  await expect(
    modal.getByRole("radiogroup", { name: "Tipo de cobro" }).getByRole("radio", { name: "Mensual", exact: true }),
  ).toBeChecked();
  // «Asignar plan» del modal no se habilita hasta que llega la vista previa (P11).
  const confirmar = modal.getByRole("button", { name: "Asignar plan", exact: true });
  await expect(confirmar).toBeEnabled({ timeout: 60_000 });
  // Empresa nueva: no pasa ningún tope, así que la vista previa no avisa de nada ni falla.
  await expect(modal).not.toContainText("No se pudo comprobar el consumo de la empresa");
  await expect(modal).not.toContainText("no podrá");
  await confirmar.click();

  // Tras el `refresh`, el bloque pinta el plan y su consumo; el historial, la asignación.
  await expect(bloque.getByRole("heading", { name: nombreDelPublico, exact: true })).toBeVisible({ timeout: 60_000 });
  const consumo = bloque.getByRole("list", { name: "Consumo" });
  await expect(consumo).toContainText(ORDENES_EN_EL_PERIODO_CERO);
  await expect(consumo).toContainText(`0 de ${TOPE_MENSAJEROS} Mensajero`);
  await expect(bloque.getByRole("list", { name: "Cobro del plan" })).toContainText("Tipo de cobro: Mensual");
  await expect(bloque.getByRole("table", { name: "Historial de asignaciones" })).toContainText(nombreDelPublico);

  const asignada = await db().organizacion.findUniqueOrThrow({
    where: { id: c().organizacionId },
    select: { planId: true, planTipoCobro: true, planCicloAnclaAt: true },
  });
  expect(asignada.planId).toBe(publicoId);
  expect(asignada.planTipoCobro).toBe("mensual");
  // SLT-86 (P4 = a): ya no hay ciclo corto (la columna `plan_ciclo_corto_desde_at` se fue); queda el ancla.
  expect(asignada.planCicloAnclaAt, "la primera asignación no fijó el ancla").not.toBeNull();
  // El público no tocó a A: A sigue con su custom.
  const deA = await db().organizacion.findUniqueOrThrow({ where: { id: a().organizacionId }, select: { planId: true } });
  expect(deA.planId).toBe(planId);
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
    await expect(consumo).toContainText(ORDENES_EN_EL_PERIODO_CERO);
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
