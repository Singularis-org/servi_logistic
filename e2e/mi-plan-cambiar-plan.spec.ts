import { randomBytes } from "node:crypto";

import { test, expect, type Browser, type BrowserContext, type Cookie, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { fechaDeEfectoPorDefecto, inicioDelDiaPlataforma } from "../lib/planes/ciclo";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearEmpresaE2E, crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import { clienteDueno } from "./_dos-empresas-fixture";
import { crearPlanPublicoConCosto } from "./_planes-fixture";
import { asegurarSuperadmin, conCandadoDelSuperadmin, NO_ENCONTRADO, SUPERADMIN_DE_PRUEBA } from "./_superadmin-fixture";

/**
 * SLT-99 T8.1 (R22; también R3, R8, R16, R19) — el maestro cambia de plan desde «Mi plan» y cancela el cambio.
 *
 * 1. Datos: una empresa nueva (`crearEmpresaE2E`) con un `admin`. El superadmin de prueba crea dos planes
 *    públicos con costo concreto (`crearPlanPublicoConCosto`, `PlanesRepository.crear` real) y asigna el
 *    primero a la empresa, mensual y desde hoy (`PlanesRepository.asignar`, como la primera asignación de
 *    `planes-superadmin`, que ya recorre esas pantallas).
 * 2. El maestro abre `/mi-plan`: el panel «Plan activo» con su plan; en el carrusel, la tarjeta del activo abre su
 *    detalle con «Activo desde» de hoy (R8).
 * 3. Elige el otro plan, «Cambiar a {plan}», y la confirmación dice el corte: el inicio del próximo período de
 *    cobro de la empresa, `fechaDeEfectoPorDefecto("mensual", ahora)` (R10, R19). Confirma: ve «Desde el {corte}:
 *    {plan} · Mensual» con «Cancelar cambio» (R16), y por detrás el pendiente es ese y el plan activo no cambió.
 * 4. «Cancelar cambio», confirmado: el pendiente ya no se ve y por detrás no queda pendiente (R16).
 * 5. El `admin` de la misma empresa recibe 404 con «no encontrado» en `/mi-plan` (SLT-91 R3).
 *
 * Al final archiva los dos planes que creó: el catálogo es global y otro spec no debe verlos en su carrusel.
 *
 * Los textos esperados se escriben a mano (son los literales del spec): derivarlos de los componentes haría el
 * test una tautología.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/mi-plan-cambiar-plan.spec.ts` (proyecto `aislamiento`, arrastra
 * `plataforma-vacia`). Base local desechable, migrada y con `pnpm run db:seed`. Todo lleva sufijo aleatorio.
 */

test.describe.configure({ mode: "serial" });

const PANTALLA_DE_ERROR = "No pudimos cargar esta pantalla";
const sufijo = randomBytes(4).toString("hex");
const nombreActivo = `Plan E2E activo ${sufijo}`;
const nombreDestino = `Plan E2E destino ${sufijo}`;

let dueno: PrismaClient | null = null;
let empresa: EmpresaE2E | null = null;
let superadminId = "";
let activoId = "";
let destinoId = "";
/** El día de la asignación (la entrada del plan) y el corte que la pantalla tiene que proponer. */
let hoy = "";
let corte = "";
const sesiones: { maestro?: Cookie[]; admin?: Cookie[] } = {};

function db(): PrismaClient {
  if (!dueno) throw new Error("sin cliente de base: falló el beforeAll");
  return dueno;
}

function laEmpresa(): EmpresaE2E {
  if (!empresa) throw new Error("no hay empresa: falló el beforeAll");
  return empresa;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  empresa = await crearEmpresaE2E("mi-plan-cambio");
  const admin = await crearUsuarioE2E(empresa, "admin");
  sesiones.maestro = await sesionDe(browser, empresa.maestro);
  sesiones.admin = await sesionDe(browser, admin);

  // El superadmin de prueba es el actor de los planes: `PlanesRepository` congela su nombre en el rastro.
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));
  const sa = await db().usuario.findFirstOrThrow({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
    select: { id: true },
  });
  superadminId = sa.id;

  activoId = await crearPlanPublicoConCosto(db(), nombreActivo, "100");
  destinoId = await crearPlanPublicoConCosto(db(), nombreDestino, "150");

  // La primera asignación, mensual y desde las 00:00 de hoy en la plataforma (SLT-86 R2).
  const ahora = new Date();
  hoy = fechaCalendarioCR(ahora);
  const efecto = { clase: "inicio", fecha: hoy, desde: inicioDelDiaPlataforma(hoy), elegida: false } as const;
  const asignado = await new PlanesRepository(db()).asignar(
    laEmpresa().organizacionId,
    activoId,
    superadminId,
    efecto,
    "mensual",
    ahora,
  );
  if (asignado.estado !== "ok") throw new Error(`SLT-99 T8: asignar el plan no lo dejó asignado: ${JSON.stringify(asignado)}`);
  // R10: el corte de una empresa mensual es el 1 del mes siguiente en la plataforma.
  corte = fechaDeEfectoPorDefecto("mensual", new Date());
});

test.afterAll(async () => {
  // El catálogo es global: los dos planes salen del carrusel de los demás. La empresa los conserva (R6 de SL-24).
  if (dueno && superadminId !== "") {
    const repo = new PlanesRepository(dueno);
    for (const id of [activoId, destinoId].filter((p) => p !== "")) await repo.archivar(id, superadminId);
  }
  await dueno?.$disconnect();
});

/** Abre `ruta` con la sesión dada en un contexto nuevo. */
async function abrirCon(
  browser: Browser,
  sesion: Cookie[] | undefined,
  ruta: string,
): Promise<{ page: Page; ctx: BrowserContext; estado: number | null; errores5xx: number[] }> {
  expect(sesion?.length ?? 0, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
  const ctx = await browser.newContext();
  await ctx.addCookies(sesion ?? []);
  const page = await ctx.newPage();
  const errores5xx: number[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500) errores5xx.push(r.status());
  });
  const respuesta = await page.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  return { page, ctx, estado: respuesta?.status() ?? null, errores5xx };
}

/**
 * Elige la tarjeta de un plan en el carrusel. Con teclado: el catálogo es global y la tarjeta puede quedar fuera
 * de la parte visible del carrusel, donde un clic no llega; el foco sí.
 */
async function elegirTarjeta(page: Page, nombre: string): Promise<void> {
  const tarjeta = page.getByRole("button", { name: nombre, exact: true });
  await tarjeta.press("Enter");
  await expect(tarjeta).toHaveAttribute("aria-pressed", "true");
}

test("el maestro ve su plan activo, cambia a otro plan público, ve el pendiente al corte y lo cancela (R22)", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  expect(corte, "no hay corte: falló el beforeAll").not.toBe("");
  const { page, ctx, estado, errores5xx } = await abrirCon(browser, sesiones.maestro, "/mi-plan");
  try {
    expect(estado).toBeLessThan(400);
    await expect(page.getByText(PANTALLA_DE_ERROR)).toHaveCount(0);

    // R3: el panel del plan activo.
    const panel = page.getByRole("region", { name: "Plan activo", exact: true });
    await expect(panel.getByRole("heading", { name: nombreActivo, exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(panel).toContainText("Activo");

    // R8: el detalle del activo dice desde cuándo lo tiene la empresa, sin «Cambiar a».
    await elegirTarjeta(page, nombreActivo);
    const detalleActivo = page.getByRole("region", { name: `Detalles de ${nombreActivo}`, exact: true });
    const activoDesde = detalleActivo.locator("dt", { hasText: "Activo desde" }).locator("xpath=following-sibling::dd[1]");
    await expect(activoDesde).toHaveText(hoy);
    await expect(detalleActivo.getByRole("button", { name: /^Cambiar a/ })).toHaveCount(0);

    // R19: la confirmación con el corte, sin elegir fecha.
    await elegirTarjeta(page, nombreDestino);
    const detalleDestino = page.getByRole("region", { name: `Detalles de ${nombreDestino}`, exact: true });
    await detalleDestino.getByRole("button", { name: `Cambiar a ${nombreDestino}`, exact: true }).click();
    const confirmacion = page.getByRole("dialog", { name: `¿Cambiar a ${nombreDestino}?` });
    await expect(confirmacion).toBeVisible({ timeout: 30_000 });
    await expect(confirmacion).toContainText(
      `Tu plan cambia a ${nombreDestino} el ${corte}. Hasta entonces sigues con ${nombreActivo}.`,
    );
    await expect(confirmacion.locator("input, select, textarea")).toHaveCount(0);
    await confirmacion.getByRole("button", { name: "Confirmar cambio", exact: true }).click();
    await expect(confirmacion).toBeHidden({ timeout: 60_000 });

    // R11, R16: el pendiente al corte, con «Cancelar cambio»; el plan activo sigue siendo el mismo.
    const pendiente = page.getByText(`Desde el ${corte}: ${nombreDestino} · Mensual`, { exact: true });
    await expect(pendiente).toBeVisible({ timeout: 60_000 });
    await expect(panel.getByRole("heading", { name: nombreActivo, exact: true })).toBeVisible();
    const programado = await db().organizacion.findUniqueOrThrow({
      where: { id: laEmpresa().organizacionId },
      select: { planId: true, planCambioPlanId: true, planCambioTipoCobro: true },
    });
    expect(programado.planId, "el cambio no debe tocar el plan activo antes del corte").toBe(activoId);
    expect(programado.planCambioPlanId).toBe(destinoId);
    expect(programado.planCambioTipoCobro).toBe("mensual");

    // R16: «Cancelar cambio» pide confirmación y, confirmado, el pendiente desaparece.
    await page.getByRole("button", { name: "Cancelar cambio", exact: true }).click();
    const cancelar = page.getByRole("dialog", { name: `¿Cancelar el cambio a ${nombreDestino} programado para el ${corte}?` });
    await expect(cancelar).toBeVisible({ timeout: 30_000 });
    await cancelar.getByRole("button", { name: "Cancelar cambio", exact: true }).click();
    await expect(pendiente).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Cancelar cambio", exact: true })).toHaveCount(0);

    const cancelado = await db().organizacion.findUniqueOrThrow({
      where: { id: laEmpresa().organizacionId },
      select: { planId: true, planCambioPlanId: true },
    });
    expect(cancelado.planId).toBe(activoId);
    expect(cancelado.planCambioPlanId, "cancelar dejó un pendiente").toBeNull();
    expect(errores5xx).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("el admin de la misma empresa recibe «no encontrado» en «Mi plan» (R22, SLT-91 R3)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, ctx, estado } = await abrirCon(browser, sesiones.admin, "/mi-plan");
  try {
    expect(estado, "el admin no recibe un 404 HTTP").toBe(404);
    await expect(page.getByText(NO_ENCONTRADO).first()).toBeVisible();
    expect(await page.content(), "el admin ve el nombre del plan").not.toContain(nombreActivo);
  } finally {
    await ctx.close();
  }
});
