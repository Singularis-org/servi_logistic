import { randomBytes } from "node:crypto";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { fechaCalendarioCR } from "../lib/utils/fecha-cr";

import { aprobarCierre, solicitarCierre } from "./_escenarios/cierres";
import {
  baseReparto,
  crearEscenarioReparto,
  crearMensajero,
  crearOrden,
  estadoDe,
  gestionar,
  llevarA,
  paginaDe,
  type MensajeroE2E,
  type OrdenE2E,
  type RepartoE2E,
} from "./_escenarios/reparto";
import { crearPlanPublicoConCosto } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-83 T15 (design §9.2; R28, y por el camino R6, R8, R18, R21, R22, R23) — el costo por orden
 * porcentual, de punta a punta.
 *
 * 1. `beforeAll`: una empresa nueva con el escenario de reparto (`crearEscenarioReparto`) y un
 *    mensajero de su zona central; el superadmin de prueba; un plan PÚBLICO con costo base 1000.00 al
 *    mes y costo por orden FIJO 100.00 (`crearPlanPublicoConCosto`, `PlanesRepository.crear` real).
 * 2. (R28.1, R21) El superadmin, por pantalla, edita ese plan y pone el modo «Porcentual», 2 % y
 *    mínimo 500. El detalle dice «2.00 % del valor del paquete, mínimo 500.00».
 * 3. (R28.2, R28.3, R22) Lo asigna a la empresa desde el bloque «Plan» de su detalle (modal de
 *    SLT-58), con el inicio del ciclo al menos 5 días atrás y sin tramo (`entradaSinTramo`). El listado de «Empresas» dice, en «Cobro por
 *    orden», «2.00 % (mín. 500.00)» y «del plan».
 * 4. (R28.4, R6, R18) La tienda crea una orden de `monto_cobrar` 100.000 por la carga masiva
 *    (`crearOrden`): la orden congela 2 % / 500 y la deuda de la wallet sigue en «₡0».
 * 5. (R28.5, R8, R18) La orden llega a `entregado` por la vía real (`llevarA` + `gestionar` + cierre
 *    aprobado, ficha 454): un cargo 2000.00 de fuente `plan` y la wallet dice «₡2.000».
 * 6. (R28.6, R23) «Mi plan» dice lo cobrado en el período (2000.00; SLT-86 R28: «período» en lugar de
 *    «ciclo»), 0 órdenes sin estado final y el
 *    total 1000.00 + 2000.00 = 3000.00.
 *
 * ZONA HORARIA: lo cobrado en el ciclo se filtra por la fecha del cargo dentro del ciclo (R24, P1).
 * El inicio del ciclo se pone 5 días atrás, no hoy: así el cargo cae dentro aunque el runner, la
 * sesión de Postgres (`ocurrido_at = now()`) y la hora de la plataforma no compartan zona, y aunque
 * la corrida empiece cerca de medianoche (el mismo margen que el test de integración de R24).
 *
 * Las cifras van escritas a mano, no derivadas de las funciones de producción (precedente de
 * `planes-costeo.spec.ts`): las líneas de «Mi plan» son las de `lineasDelCosteoPorcentual` y el
 * costo base de `ConsumoDelPlan`; la columna, `textoDelCobroVigente`; el detalle,
 * `textoDelCostoPorOrdenPorcentual` (todas en `lib/planes/mensajes.ts`); la deuda, lo que pinta
 * `money()` («₡2.000», sin los «,00»).
 *
 * No toca el valor global: el cargo porcentual nunca cae a él (R9). Todo lleva sufijo aleatorio y
 * nada se borra: dos corridas seguidas sobre la misma base pasan.
 *
 * CÓMO SE CORRE: proyecto `dinero`; `E2E_PUERTO=3044 pnpm exec playwright test
 * e2e/planes-costo-porcentual.spec.ts` sobre una base local desechable, migrada y con
 * `pnpm run db:seed` (`docs/verification.md > El E2E > En local`).
 */

test.describe.configure({ mode: "serial" });

const DIA_MS = 24 * 60 * 60 * 1000;
const MONTO_COBRAR = 100_000;

const TEXTO = {
  // PlanDetalle / PlanForm (TEXTOS_PLAN_FORM).
  editar: "Editar",
  dialogoEditar: "Editar plan",
  formEditar: "Guardar",
  cobroPorOrden: "Cobro por orden",
  porcentual: "Porcentual",
  porcentaje: "Porcentaje",
  minimo: "Mínimo",
  guardado: "Cambios guardados.",
  // `textoDelCostoPorOrdenPorcentual` (R21).
  detalleCosto: "2.00 % del valor del paquete, mínimo 500.00",
  // Bloque «Plan» del detalle de empresa y modal de SLT-58.
  regionPlan: "Plan",
  planAAsignar: "Plan a asignar",
  asignarPlan: "Asignar plan",
  modal: "¿Asignar este plan a la empresa?",
  inicioCiclo: "Inicio del período",
  tipoCobro: "Tipo de cobro",
  mensual: "Mensual",
  // `textoDelCobroVigente` (R22) y la fuente de `CobroPorOrden.tsx`.
  columnaCobro: "2.00 % (mín. 500.00)",
  delPlan: "del plan",
  // «Mi plan» (`ConsumoDelPlan` + `lineasDelCosteoPorcentual`, R23). SLT-86 (R28; decisiones del
  // 2026-11-05 y del 2026-11-06): «Costo base {tipo}: …» del período en curso y «período» en vez de «ciclo».
  costoDelPeriodo: "Costo del período",
  costoBase: "Costo base mensual: 1000.00",
  costoPorOrden: "Costo por orden: 2.00 % del valor del paquete, mínimo 500.00",
  cobradoCero: "Cobrado en el período: 0.00",
  pendientesUna: "Órdenes del período sin estado final: 1",
  cobrado: "Cobrado en el período: 2000.00",
  pendientesCero: "Órdenes del período sin estado final: 0",
  total: "Total del período hasta hoy: 1000.00 + 2000.00 = 3000.00",
} as const;

/**
 * SLT-86 (R5, R12): la fecha de inicio de la primera asignación. Hace al menos 5 días (ver «ZONA HORARIA»
 * arriba) y, además, sin dejar el período mensual en curso como tramo, cuyo costo base dependería del día
 * en que corra el spec: si hace 5 días cae en el mes en curso se usa el día 1 de este mes (aún más atrás);
 * si cae en el mes anterior, el período en curso ya es completo y se usa tal cual.
 */
function entradaSinTramo(): string {
  const haceCinco = fechaCalendarioCR(new Date(Date.now() - 5 * DIA_MS));
  const diaUno = `${fechaCalendarioCR(new Date()).slice(0, 8)}01`;
  return haceCinco < diaUno ? haceCinco : diaUno;
}

/** Lo que pinta `money()`: `money("0.00")` y `money("2000.00")`, escritos a mano. */
const PINTADO = { deudaCero: "₡0", deudaTrasEntrega: "₡2.000" } as const;

const nombreDelPlan = `Plan E2E porcentual ${randomBytes(4).toString("hex")}`;

let r: RepartoE2E | undefined;
let mensajero: MensajeroE2E | undefined;
let planId = "";
let orden: OrdenE2E | undefined;
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;
let paginaMaestro: Page | undefined;

function escenario(): RepartoE2E {
  if (!r) throw new Error("no hay escenario: falló el beforeAll");
  return r;
}

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function maestro(): Page {
  if (!paginaMaestro) throw new Error("no hay página del maestro: falló el beforeAll");
  return paginaMaestro;
}

function laOrden(): OrdenE2E {
  if (!orden) throw new Error("no hay orden: falló el caso que la crea");
  return orden;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(baseReparto()));

  r = await crearEscenarioReparto("slt83-porcentual");
  mensajero = await crearMensajero(r, "central");
  // Costo base con monto y costo por orden fijo: el superadmin lo pasa a porcentual por pantalla.
  planId = await crearPlanPublicoConCosto(baseReparto(), nombreDelPlan, "100.00");

  paginaMaestro = await paginaDe(browser, r.empresa.maestro);

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(baseReparto(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  await contextoSa?.close();
  await paginaMaestro?.context().close();
});

/* -------------------------------------------------------------------------- */
/* Lecturas                                                                    */
/* -------------------------------------------------------------------------- */

/** La deuda con la plataforma tal como la pinta `/wallet` (región `deuda_plataforma`). */
async function deudaEnWallet(page: Page): Promise<string> {
  const res = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(res?.status()).toBeLessThan(400);
  const region = page.locator('[data-region="deuda_plataforma"]');
  await expect(region, "la región de la deuda con la plataforma").toHaveCount(1, { timeout: 60_000 });
  const importe = region.locator(".tabular-nums").first();
  await expect(importe).toBeVisible();
  return (await importe.innerText()).trim();
}

/** Los cargos y reversos de la empresa, leídos por detrás con el dueño. */
async function movimientos(): Promise<string[]> {
  const filas = await baseReparto().cobroPlataformaMovimiento.findMany({
    where: { organizacionId: escenario().empresa.organizacionId },
    orderBy: [{ ocurridoAt: "asc" }, { secuencia: "asc" }],
    select: { ordenId: true, tipo: true, monto: true, fuente: true },
  });
  return filas.map((f) => `${f.ordenId === orden?.id ? "orden" : f.ordenId}:${f.tipo}:${f.monto.toFixed(2)}:${f.fuente}`);
}

/** Abre «Mi plan» del maestro y devuelve la lista «Costo del período». */
async function costoDelPeriodo(page: Page): Promise<Locator> {
  const res = await page.goto("/mi-plan", { waitUntil: "load", timeout: 180_000 });
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByRole("region", { name: "Plan activo", exact: true }).getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible({ timeout: 60_000 });
  const lista = page.getByRole("list", { name: TEXTO.costoDelPeriodo, exact: true });
  await expect(lista).toBeVisible();
  return lista;
}

/* -------------------------------------------------------------------------- */
/* 1–3. El superadmin pone el plan en porcentual y lo asigna                   */
/* -------------------------------------------------------------------------- */

test("el superadmin pone por pantalla el plan en «Porcentual», 2 % y mínimo 500 (R28.1, R21)", async ({}, info) => {
  test.setTimeout(240_000);
  const page = superadmin();
  await page.goto(`/plataforma/planes/${planId}`);
  await page.getByRole("button", { name: TEXTO.editar, exact: true }).click({ timeout: 60_000 });

  const form = page.getByRole("dialog", { name: TEXTO.dialogoEditar }).getByRole("form", { name: TEXTO.formEditar });
  await expect(form).toBeVisible({ timeout: 60_000 });
  const porcentual = form
    .getByRole("radiogroup", { name: TEXTO.cobroPorOrden })
    .getByRole("radio", { name: TEXTO.porcentual, exact: true });
  await porcentual.click();
  await expect(porcentual).toBeChecked();
  await form.getByRole("textbox", { name: TEXTO.porcentaje, exact: true }).fill("2");
  await form.getByRole("textbox", { name: TEXTO.minimo, exact: true }).fill("500");

  const guardar = form.getByRole("button", { name: TEXTO.formEditar, exact: true });
  await expect(guardar).toBeEnabled({ timeout: 60_000 });
  await guardar.click();
  await expect(page.getByRole("status").filter({ hasText: TEXTO.guardado })).toBeVisible({ timeout: 60_000 });

  // Por detrás: el plan quedó porcentual y sin costo fijo (un solo modo, R1).
  const plan = await baseReparto().plan.findUniqueOrThrow({
    where: { id: planId },
    select: { costoPorOrden: true, costoPorOrdenPct: true, costoPorOrdenMinimo: true },
  });
  expect(plan.costoPorOrden).toBeNull();
  expect(plan.costoPorOrdenPct?.toFixed(2)).toBe("2.00");
  expect(plan.costoPorOrdenMinimo?.toFixed(2)).toBe("500.00");

  await expect(page.getByText(TEXTO.detalleCosto, { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: info.outputPath("slt83-plan.png"), fullPage: true });
});

test("lo asigna a la empresa y «Empresas» dice «2.00 % (mín. 500.00)» «del plan» (R28.2, R28.3, R22)", async ({}, info) => {
  test.setTimeout(240_000);
  const page = superadmin();
  const { organizacionId, slug } = escenario().empresa;
  await page.goto(`/plataforma/empresas/${organizacionId}#plan`);

  const bloque = page.getByRole("region", { name: TEXTO.regionPlan, exact: true });
  await bloque.getByRole("combobox", { name: TEXTO.planAAsignar }).click({ timeout: 60_000 });
  await page.getByRole("option", { name: `${nombreDelPlan} (Público)`, exact: true }).click();
  await bloque.getByRole("button", { name: TEXTO.asignarPlan, exact: true }).click();

  const modal = page.getByRole("dialog", { name: TEXTO.modal });
  await expect(modal).toBeVisible({ timeout: 30_000 });
  // Zona horaria: la entrada va al menos 5 días atrás (dentro del rango de SLT-58 R30, ± 1 mes), no hoy;
  // y sin tramo en el período en curso (SLT-86 R12, ver `entradaSinTramo`).
  await modal.getByLabel(TEXTO.inicioCiclo).fill(entradaSinTramo());
  const mensual = modal
    .getByRole("radiogroup", { name: TEXTO.tipoCobro })
    .getByRole("radio", { name: TEXTO.mensual, exact: true });
  await mensual.click();
  await expect(mensual).toBeChecked();
  const confirmar = modal.getByRole("button", { name: TEXTO.asignarPlan, exact: true });
  await expect(confirmar).toBeEnabled({ timeout: 60_000 });
  await confirmar.click();
  await expect(bloque.getByRole("heading", { name: nombreDelPlan, exact: true })).toBeVisible({ timeout: 60_000 });

  const asignada = await baseReparto().organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { planId: true },
  });
  expect(asignada.planId).toBe(planId);

  await page.goto("/plataforma/empresas");
  const fila = page.getByRole("table").locator("tbody tr").filter({ hasText: slug });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila.getByText(TEXTO.columnaCobro, { exact: true })).toBeVisible();
  await expect(fila.getByText(TEXTO.delPlan, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("slt83-empresas.png"), fullPage: true });
});

/* -------------------------------------------------------------------------- */
/* 4–6. La orden, la wallet y «Mi plan»                                        */
/* -------------------------------------------------------------------------- */

test("la empresa crea una orden de 100.000 y la deuda de la wallet no cambia (R28.4, R6, R18)", async () => {
  test.setTimeout(240_000);
  expect(await deudaEnWallet(maestro())).toBe(PINTADO.deudaCero);

  orden = await crearOrden(escenario(), { zona: "central", montoCobrar: MONTO_COBRAR });

  // Por detrás: condiciones congeladas (2 %, 500) y ningún cargo al crear.
  const congeladas = await baseReparto().cobroPlataformaPorcentualOrden.findUniqueOrThrow({
    where: { ordenId: laOrden().id },
    select: { porcentaje: true, minimo: true },
  });
  expect(congeladas.porcentaje.toFixed(2)).toBe("2.00");
  expect(congeladas.minimo?.toFixed(2)).toBe("500.00");
  expect(await movimientos()).toEqual([]);

  expect(await deudaEnWallet(maestro())).toBe(PINTADO.deudaCero);

  // «Mi plan» ya la cuenta como pendiente y aún no hay nada cobrado.
  const lista = await costoDelPeriodo(maestro());
  await expect(lista.getByText(TEXTO.cobradoCero, { exact: true })).toBeVisible();
  await expect(lista.getByText(TEXTO.pendientesUna, { exact: true })).toBeVisible();
});

test("la orden llega a «entregado» y la deuda sube 2.000,00 (R28.5, R8, R18)", async ({}, info) => {
  test.setTimeout(300_000);
  if (!mensajero) throw new Error("no hay mensajero: falló el beforeAll");
  const enReparto = await llevarA(escenario(), laOrden(), "en_reparto", { mensajero });
  await gestionar(escenario(), enReparto, mensajero, { resultado: "entregado" });
  const cierreId = await solicitarCierre(escenario(), mensajero);
  await aprobarCierre(escenario(), cierreId);
  expect(await estadoDe(laOrden())).toBe("entregado");

  // Por detrás: un único cargo, 2 % de 100.000, de fuente `plan`.
  expect(await movimientos()).toEqual(["orden:cargo:2000.00:plan"]);

  expect(await deudaEnWallet(maestro())).toBe(PINTADO.deudaTrasEntrega);
  await maestro().screenshot({ path: info.outputPath("slt83-wallet.png"), fullPage: true });
});

test("«Mi plan» muestra lo cobrado en el período, 0 órdenes sin estado final y el total (R28.6, R23; SLT-86 R28)", async ({}, info) => {
  test.setTimeout(240_000);
  const lista = await costoDelPeriodo(maestro());
  for (const linea of [TEXTO.costoBase, TEXTO.costoPorOrden, TEXTO.cobrado, TEXTO.pendientesCero, TEXTO.total]) {
    await expect(lista.getByText(linea, { exact: true })).toBeVisible();
  }
  await maestro().screenshot({ path: info.outputPath("slt83-mi-plan.png"), fullPage: true });
});
