import { randomBytes, randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import type { BulkSummary } from "../lib/types/carga-masiva";
import { fechaCalendarioCR, mananaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearEmpresaE2E, crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import { crearZonaE2E, type ZonaE2E } from "./_aislamiento-datos";
import { altaDeEmpresa, clienteDueno, prepararAcceso, type Empresa } from "./_dos-empresas-fixture";
import { crearPlanPublicoConCosto } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";
import { CAJA_A, sembrarCaja } from "./_wallet-iva-sl39-siembra";

/**
 * SLT-66 T14 (design §9.2; R26, R31, R32) — el costo por orden del plan, de punta a punta.
 *
 * 1. `beforeAll`: guarda el valor GLOBAL del cobro y lo fija en 500,00, para que el caso pruebe que el
 *    plan gana al global. Da de alta la empresa A (`altaDeEmpresa`) con su caja (`sembrarCaja`, para
 *    que la wallet pinte la región de la deuda), una zona y una tienda.
 * 2. El superadmin entra con OTP. En el listado de «Empresas» la fila de A dice «Sin plan» y el cobro
 *    global. Crea por `PlanForm` un custom de A «Con monto»: costo base mensual 50000, costo por orden
 *    100, tipo de cobro «Mensual» (D6) e inicio del ciclo el día 1 del mes en curso (D4; abre en mañana,
 *    D5; SLT-86: el día 1 y no hoy, para que el período mensual sea completo y no un tramo). Crearlo lo
 *    deja asignado a A (ajuste planes-custom D2). De vuelta al listado, la fila de A dice el plan con
 *    «· Mensual» (D9), «Cambiar plan» y, en «Cobro por orden», «₡100» y «del plan» (R31).
 * 2b. «Asignar plan» del listado (R32) sigue existiendo para planes públicos: B, una segunda empresa sin
 *    plan, lo pulsa; lleva al bloque «Plan» del detalle (`#plan`) y ahí se confirma el modal de SLT-58
 *    con un plan PÚBLICO con costo concreto (R28, creado por el fixture), la fecha de hoy y «Anual». De
 *    vuelta al listado, la fila de B dice ese plan con «· Anual», «₡250» y «del plan».
 * 3. El maestro de A abre `/wallet`: la deuda con la plataforma es «₡0».
 * 4. La tienda de A crea una orden con su sesión por el endpoint de la carga masiva (precedente SL-24
 *    §11.1).
 * 5. `/wallet` dice «₡100», no «₡500»: el cargo salió del plan y no del global.
 * 6. `/mi-plan` muestra el costo base del período, el costo por orden, las órdenes del período y el
 *    total estimado (SLT-86 R28: «período» en lugar de «ciclo»).
 * 7. Por detrás (`clienteDueno`): un único movimiento de la orden, `cargo 100.00 plan`.
 * 8. `afterAll`: devuelve el global a lo que había.
 *
 * Los importes esperados van escritos a mano: «₡100» es lo que pinta `money("100.00")` (omite los
 * «,00»), y las líneas de «Mi plan» son los literales de `ConsumoDelPlan` con el formato de
 * `costeoDelCiclo` (dos decimales). Derivarlos de las funciones de producción los compararía contra su
 * propia fuente.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/planes-costeo.spec.ts` (proyecto `aislamiento`, que
 * arrastra `plataforma-vacia`), sobre una base local desechable, migrada y con `pnpm run db:seed`. Todo
 * lleva sufijo aleatorio y nada se borra salvo el global, que se devuelve: dos corridas seguidas pasan.
 */

test.describe.configure({ mode: "serial" });

const COSTO_BASE_MENSUAL = "50000";
const COSTO_POR_ORDEN = "100";
/** El global durante el spec: distinto del costo del plan, para ver cuál de los dos se cobra. */
const GLOBAL_DEL_SPEC = "500.00";

const TEXTO = {
  sinPlan: "Sin plan",
  cambiarPlan: "Cambiar plan",
  delPlan: "del plan",
  regionPlan: "Plan",
  modal: "¿Asignar este plan a la empresa?",
  // SLT-86 (R12, R28; design §7.1 y decisión del 2026-11-06): «Costo base {tipo}: …» del período en curso,
  // y «período» en lugar de «ciclo». El período es el mes de calendario completo (ver `primerDiaDelMes`).
  costoBase: "Costo base mensual: 50000.00",
  costoPorOrden: "Costo por orden: 100.00",
  ordenesDelPeriodo: "Órdenes del período: 1 × 100.00 = 100.00",
  total: "Total estimado del período: 50100.00",
} as const;

/**
 * SLT-86 (R5, R12): el período mensual es el mes de calendario y una entrada a mitad de mes lo hace un
 * tramo proporcional, cuyo costo base depende del día en que corra el spec. Con la entrada el día 1 del
 * mes en curso (hora de la plataforma; dentro del rango de SLT-58 R30, ± 1 mes) el período en curso es
 * completo y el costo base es el mensual tal cual: las cifras de «Mi plan» quedan fijas.
 */
function primerDiaDelMes(): string {
  return `${fechaCalendarioCR(new Date()).slice(0, 8)}01`;
}

/** El costo por orden del plan público de B (paso 2b): distinto del de A y del global. */
const COSTO_POR_ORDEN_PUBLICO = "250.00";

/** Lo que pinta `money()`: `money("100.00")`, `money("250.00")` y `money("0.00")`, escritos a mano. */
const PINTADO = { costoPlan: "₡100", costoPublico: "₡250", global: "₡500", deudaCero: "₡0" } as const;

let dueno: PrismaClient | undefined;
let empresaA: Empresa | undefined;
let nombreA = "";
let zonaA: ZonaE2E | undefined;
let sesionTienda: Cookie[] = [];
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;
let contextoA: BrowserContext | undefined;
let paginaA: Page | undefined;
const nombreDelPlan = `Plan E2E costeo ${randomBytes(4).toString("hex")}`;
let planId = "";
/** B: sin plan hasta el paso 2b, que le asigna el público desde «Asignar plan» del listado (R32). */
let empresaB: EmpresaE2E | undefined;
let nombreB = "";
const nombreDelPublico = `Plan E2E costeo publico ${randomBytes(4).toString("hex")}`;
let publicoId = "";
let ordenId = "";
/** El valor global del cobro al empezar (`null`: sin configurar), para devolverlo en el `afterAll`. */
let globalAntes: Prisma.Decimal | null = null;
let globalGuardado = false;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function empresa(): Empresa {
  if (!empresaA) throw new Error("no hay alta de A: falló el beforeAll");
  return empresaA;
}

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function maestroA(): Page {
  if (!paginaA) throw new Error("no hay página del maestro de A: falló el beforeAll");
  return paginaA;
}

/** La empresa del alta con la forma que piden las fábricas de `tests/fabricas/e2e.ts`. */
function comoEmpresaE2E(e: Empresa): EmpresaE2E {
  return {
    organizacionId: e.organizacionId,
    maestro: { id: e.maestroId, email: e.email, password: e.password, nombre: `Maestro ${e.letra}` },
    slug: e.slug,
  };
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(base()));

  // El global en 500,00: si el cargo saliera de él, la wallet diría «₡500» y no «₡100».
  globalAntes = (await base().cobroPlataformaTarifa.findUnique({ where: { id: true }, select: { monto: true } }))?.monto ?? null;
  globalGuardado = true;
  await base().cobroPlataformaTarifa.upsert({
    where: { id: true },
    create: { id: true, monto: new Prisma.Decimal(GLOBAL_DEL_SPEC) },
    update: { monto: new Prisma.Decimal(GLOBAL_DEL_SPEC) },
  });

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  const email = `slt66-maestro-a-${randomUUID().slice(0, 8)}@example.test`;
  empresaA = (await altaDeEmpresa("A", email)).empresa;
  await prepararAcceso(base(), empresa(), userAgent);
  nombreA = (
    await base().organizacion.findUniqueOrThrow({ where: { id: empresa().organizacionId }, select: { nombre: true } })
  ).nombre;
  await sembrarCaja(base(), empresa().organizacionId, CAJA_A);

  // La zona y la tienda de A, por los servicios reales: la orden del paso 4 la crea la tienda.
  zonaA = await crearZonaE2E(base(), comoEmpresaE2E(empresa()));
  const tienda = await crearUsuarioE2E(comoEmpresaE2E(empresa()), "adminTienda");
  sesionTienda = await sesionDe(browser, tienda);

  // B, sin plan, y el plan público con costo concreto que se le asigna en el paso 2b (R28, D2).
  empresaB = await crearEmpresaE2E("costeo-b");
  nombreB = (
    await base().organizacion.findUniqueOrThrow({ where: { id: empresaB.organizacionId }, select: { nombre: true } })
  ).nombre;
  publicoId = await crearPlanPublicoConCosto(base(), nombreDelPublico, COSTO_POR_ORDEN_PUBLICO);

  contextoA = await browser.newContext({ userAgent });
  paginaA = await contextoA.newPage();
  await paginaA.goto("/login");
  await paginaA.fill('input[type="email"]', empresa().email);
  await paginaA.fill('input[type="password"]', empresa().password);
  await paginaA.click('button[type="submit"]');
  await paginaA.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(base(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  await contextoSa?.close();
  await contextoA?.close();
  // El valor global, como estaba antes de este spec. Lo demás es de la empresa A de esta corrida.
  if (dueno && globalGuardado) {
    if (globalAntes === null) {
      await dueno.cobroPlataformaTarifa.deleteMany({});
    } else {
      await dueno.cobroPlataformaTarifa.upsert({
        where: { id: true },
        create: { id: true, monto: globalAntes },
        update: { monto: globalAntes },
      });
    }
  }
  await dueno?.$disconnect();
});

/* -------------------------------------------------------------------------- */
/* 1. El superadmin crea el custom (asignado, D2) y asigna un público          */
/* -------------------------------------------------------------------------- */

function filaDe(page: Page, slug: string): Locator {
  return page.getByRole("table").locator("tbody tr").filter({ hasText: slug });
}

function filaDeA(page: Page): Locator {
  return filaDe(page, empresa().slug);
}

function b(): EmpresaE2E {
  if (!empresaB) throw new Error("no hay empresa B: falló el beforeAll");
  return empresaB;
}

test("el superadmin crea un custom de A «Con monto» con costo por orden 100, que queda asignado (R26, D2, D4–D6)", async () => {
  test.setTimeout(240_000);
  const page = superadmin();

  // Antes de crearlo, A no tiene plan y su cobro sale del global de este spec.
  await page.goto("/plataforma/empresas");
  const filaAntes = filaDeA(page);
  await expect(filaAntes).toHaveCount(1, { timeout: 60_000 });
  await expect(filaAntes).toContainText(TEXTO.sinPlan);
  await expect(filaAntes).toContainText(PINTADO.global);

  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const form = page.getByRole("dialog").getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });

  await form.getByRole("textbox", { name: /^Nombre/ }).fill(nombreDelPlan);
  await form.getByRole("radio", { name: "Custom", exact: true }).click();
  await form.getByRole("combobox", { name: "Empresa" }).click();
  await page.getByRole("option", { name: nombreA, exact: true }).click();
  await expect(form.getByRole("combobox", { name: "Empresa" })).toHaveText(nombreA);
  // Todos los módulos: asignar el plan no apaga la wallet que el paso 3 abre. Topes vacíos = sin límite.
  for (const modulo of ORDEN_MODULOS) {
    await form.getByRole("checkbox", { name: nombreDelModulo(modulo), exact: true }).check();
  }
  await form.getByRole("radio", { name: "Con monto", exact: true }).click();
  await form.getByLabel("Costo base mensual", { exact: true }).fill(COSTO_BASE_MENSUAL);
  await form.getByLabel("Costo por orden", { exact: true }).fill(COSTO_POR_ORDEN);

  // D6: «Mensual», el tipo por defecto, que es el que da el total mensual de «Mi plan».
  const mensual = form.getByRole("radiogroup", { name: "Tipo de cobro" }).getByRole("radio", { name: "Mensual", exact: true });
  await mensual.click();
  await expect(mensual).toBeChecked();
  // D4/D5: abre en mañana. SLT-86: se pone el día 1 del mes en curso (antes, hoy), para que la orden del
  // paso 4 caiga dentro del período y el período sea completo (`primerDiaDelMes`).
  const inicio = form.getByLabel("Inicio del período", { exact: true });
  await expect(inicio).toHaveValue(mananaCalendarioCR(new Date()));
  await inicio.fill(primerDiaDelMes());

  // D13/D17: «Crear plan» espera a la vista previa.
  const crear = form.getByRole("button", { name: "Crear plan" });
  await expect(crear).toBeEnabled({ timeout: 60_000 });
  await expect(form).not.toContainText("No se pudo comprobar el consumo de la empresa");
  await crear.click();

  await expect(page.getByRole("status").filter({ hasText: `Plan «${nombreDelPlan}» creado.` })).toBeVisible({
    timeout: 60_000,
  });

  const plan = await base().plan.findFirstOrThrow({
    where: { nombre: nombreDelPlan },
    select: { id: true, visibilidad: true, organizacionExclusivaId: true },
  });
  expect(plan.visibilidad).toBe("custom");
  expect(plan.organizacionExclusivaId).toBe(empresa().organizacionId);
  planId = plan.id;
  const asignada = await base().organizacion.findUniqueOrThrow({
    where: { id: empresa().organizacionId },
    select: { planId: true, planTipoCobro: true },
  });
  expect(asignada.planId, "crear un custom con empresa lo asigna (D2)").toBe(planId);
  expect(asignada.planTipoCobro).toBe("mensual");
});

test("la fila de A en «Empresas» dice el plan, su tipo de cobro y «₡100 del plan» (R26, R31, D9)", async ({}, info) => {
  test.setTimeout(240_000);
  expect(planId, "no hay plan: falló el caso anterior").not.toBe("");
  const page = superadmin();
  await page.goto("/plataforma/empresas");
  const fila = filaDeA(page);
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(`${nombreDelPlan} · Mensual`);
  await expect(fila.getByRole("link", { name: `Cambiar el plan de ${nombreA}`, exact: true })).toHaveText(
    TEXTO.cambiarPlan,
  );
  await expect(fila).not.toContainText(TEXTO.sinPlan);
  await expect(fila.getByText(PINTADO.costoPlan, { exact: true })).toBeVisible();
  await expect(fila.getByText(TEXTO.delPlan, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("slt66-empresas.png"), fullPage: true });
});

test("«Asignar plan» del listado lleva a B al bloque «Plan» y le asigna un público con costo; la fila dice «₡250 del plan» (R28, R31, R32, D6, D9)", async () => {
  test.setTimeout(240_000);
  expect(publicoId, "no hay plan público: falló el beforeAll").not.toBe("");
  const page = superadmin();
  await page.goto("/plataforma/empresas");
  const fila = filaDe(page, b().slug);
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(TEXTO.sinPlan);
  // Sin plan, el cobro de B sale del global de este spec.
  await expect(fila).toContainText(PINTADO.global);

  await fila.getByRole("link", { name: `Asignar plan a ${nombreB}`, exact: true }).click();
  await page.waitForURL((u) => u.pathname === `/plataforma/empresas/${b().organizacionId}` && u.hash === "#plan", {
    timeout: 60_000,
  });

  const bloque = page.getByRole("region", { name: TEXTO.regionPlan, exact: true });
  await bloque.getByRole("combobox", { name: "Plan a asignar" }).click({ timeout: 60_000 });
  await page.getByRole("option", { name: `${nombreDelPublico} (Público)`, exact: true }).click();
  await bloque.getByRole("button", { name: "Asignar plan", exact: true }).click();

  // El modal de la primera asignación (SLT-58): el inicio del ciclo abre en mañana (D5) y se pone hoy;
  // el tipo de cobro se cambia a «Anual» (D6).
  const modal = page.getByRole("dialog", { name: TEXTO.modal });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  const inicio = modal.getByLabel("Inicio del período");
  await expect(inicio).toHaveValue(mananaCalendarioCR(new Date()));
  await inicio.fill(fechaCalendarioCR(new Date()));
  const anual = modal.getByRole("radiogroup", { name: "Tipo de cobro" }).getByRole("radio", { name: "Anual", exact: true });
  await anual.click();
  await expect(anual).toBeChecked();
  const confirmar = modal.getByRole("button", { name: "Asignar plan", exact: true });
  await expect(confirmar).toBeEnabled({ timeout: 60_000 });
  await confirmar.click();
  await expect(bloque.getByRole("heading", { name: nombreDelPublico, exact: true })).toBeVisible({ timeout: 60_000 });

  const asignada = await base().organizacion.findUniqueOrThrow({
    where: { id: b().organizacionId },
    select: { planId: true, planTipoCobro: true },
  });
  expect(asignada.planId).toBe(publicoId);
  expect(asignada.planTipoCobro).toBe("anual");

  // De vuelta al listado: el plan con su tipo, «Cambiar plan» y el cobro vigente con su fuente.
  await page.goto("/plataforma/empresas");
  const filaTras = filaDe(page, b().slug);
  await expect(filaTras).toHaveCount(1, { timeout: 60_000 });
  await expect(filaTras).toContainText(`${nombreDelPublico} · Anual`);
  await expect(filaTras.getByRole("link", { name: `Cambiar el plan de ${nombreB}`, exact: true })).toHaveText(
    TEXTO.cambiarPlan,
  );
  await expect(filaTras).not.toContainText(TEXTO.sinPlan);
  await expect(filaTras.getByText(PINTADO.costoPublico, { exact: true })).toBeVisible();
  await expect(filaTras.getByText(TEXTO.delPlan, { exact: true })).toBeVisible();
  // El público no tocó a A: A sigue con su custom.
  const deA = await base().organizacion.findUniqueOrThrow({ where: { id: empresa().organizacionId }, select: { planId: true } });
  expect(deA.planId).toBe(planId);
});

/* -------------------------------------------------------------------------- */
/* 2. La orden, la wallet y «Mi plan»                                          */
/* -------------------------------------------------------------------------- */

function regionDeuda(page: Page): Locator {
  return page.locator('[data-region="deuda_plataforma"]');
}

async function deudaEnWallet(page: Page): Promise<string> {
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  const region = regionDeuda(page);
  await expect(region, "la región de la deuda con la plataforma").toHaveCount(1, { timeout: 60_000 });
  const importe = region.locator(".tabular-nums").first();
  await expect(importe).toBeVisible();
  return (await importe.innerText()).trim();
}

/** Los cargos y reversos de A, leídos por detrás con el dueño. */
async function movimientosDeA(): Promise<string[]> {
  const filas = await base().cobroPlataformaMovimiento.findMany({
    where: { organizacionId: empresa().organizacionId },
    orderBy: [{ ocurridoAt: "asc" }, { secuencia: "asc" }],
    select: { ordenId: true, tipo: true, monto: true, fuente: true },
  });
  return filas.map((f) => `${f.ordenId === ordenId ? "orden" : f.ordenId}:${f.tipo}:${f.monto.toFixed(2)}:${f.fuente}`);
}

test("A crea una orden y la wallet pasa de «₡0» a «₡100», el costo del plan y no el global (R26)", async ({ browser }, info) => {
  test.setTimeout(240_000);
  const page = maestroA();
  expect(await deudaEnWallet(page)).toBe(PINTADO.deudaCero);

  // La tienda de A, con su sesión, por el mismo endpoint que usa la carga masiva.
  expect(sesionTienda.length, "no hay sesión de la tienda: falló el beforeAll").toBeGreaterThan(0);
  const zona = zonaA;
  if (!zona) throw new Error("no hay zona de A: falló el beforeAll");
  const numRemision = `SLT66-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies(sesionTienda);
    const tienda = await ctx.newPage();
    await tienda.goto("/ordenes", { waitUntil: "load", timeout: 180_000 });
    const r = await tienda.request.post("/api/ordenes/carga-masiva/chunk", {
      data: {
        dryRun: false,
        rows: [
          {
            num_remision: numRemision,
            destinatario: "Destinatario SLT-66",
            telefono: "88887777",
            producto: "Caja SLT-66",
            provincia: zona.geo.provincia,
            canton_distrito: `${zona.geo.canton} (${zona.geo.distrito})`,
            direccion: "",
            notas: "",
            monto_cobrar: "15000",
          },
        ],
      },
    });
    expect(r.status(), "la carga respondió otro estado").toBe(200);
    const resumen = (await r.json()) as BulkSummary;
    expect(resumen.creadas, `la carga no creó la orden: ${JSON.stringify(resumen.filas)}`).toBe(1);
  } finally {
    await ctx.close();
  }
  const orden = await base().orden.findFirstOrThrow({
    where: { numRemision, organizacionId: empresa().organizacionId },
    select: { id: true },
  });
  ordenId = orden.id;

  // Por detrás: un único cargo, de 100, y su fuente es el plan.
  expect(await movimientosDeA()).toEqual(["orden:cargo:100.00:plan"]);

  expect(await deudaEnWallet(page)).toBe(PINTADO.costoPlan);
  await page.screenshot({ path: info.outputPath("slt66-wallet.png"), fullPage: true });
});

test("«Mi plan» muestra el costo por orden, la orden del período y el total estimado (R26; SLT-86 R28)", async ({}, info) => {
  test.setTimeout(240_000);
  expect(ordenId, "no hay orden: falló el caso anterior").not.toBe("");
  const page = maestroA();
  const r = await page.goto("/mi-plan", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible({ timeout: 60_000 });
  for (const linea of [TEXTO.costoBase, TEXTO.costoPorOrden, TEXTO.ordenesDelPeriodo, TEXTO.total]) {
    await expect(page.getByText(linea, { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("slt66-mi-plan.png"), fullPage: true });
});
