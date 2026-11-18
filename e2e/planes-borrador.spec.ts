import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import { inicioDelDiaPlataforma } from "../lib/planes/ciclo";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import type { TipoCobro } from "../lib/types/planes";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearEmpresaE2E, type EmpresaE2E } from "../tests/fabricas/e2e";

import { clienteDueno } from "./_dos-empresas-fixture";
import { crearPlanPublicoConCosto } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-144 T6.1 (R30; design §11) — el superadmin crea y edita un plan por pasos con el borrador del servidor.
 *
 * 1. Datos: dos empresas nuevas (`crearEmpresaE2E`) y un plan público con costo concreto
 *    (`crearPlanPublicoConCosto`), asignado por el repositorio real a las dos con tipos de cobro distintos:
 *    «Mensual» a M y «Anual» a N. El superadmin de prueba entra con OTP.
 * 2. Crear (R30.1, R30.2): «Nuevo plan», tres pasos con «Guardar y continuar» y se cierra el panel. El plan
 *    está en «Borradores» como «Plan nuevo»; «Retomar» lo abre en «Topes» (el primer paso sin guardar), con los
 *    tres pasos ✓ y los mismos valores. Se termina con «Crear plan»: sale de «Borradores» y está en el catálogo.
 * 3. Editar (R30.3): en el detalle del plan con empresas, cuatro pasos guardados y se cierra el panel. En la
 *    lista, la marca «Cambio en borrador» y la fila «Cambio de <plan>» en «Borradores». «Editar» otra vez retoma
 *    con el aviso «Borrador de …», en «Módulos» y con el tope guardado.
 * 4. «Cuándo rige» (R30.4): «A partir de» el 1 del mes siguiente (F); la tabla dice cuándo recibe el cambio
 *    cada empresa: M en F (F abre su período mensual) y N el 1 de enero siguiente (o F, si F es el 1 de enero).
 * 5. Programar (R30.5): el detalle dice «Cambio programado desde F» y la marca ya no está en la lista.
 *
 * Las fechas esperadas se calculan a mano aquí, no con `fechaDeRecepcion`: con la misma función el test sería
 * una tautología. Los textos son los literales del spec (design §9).
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/planes-borrador.spec.ts` (proyecto `aislamiento`, arrastra
 * `plataforma-vacia`). Base local desechable, migrada y con `pnpm run db:seed`. Todo lleva sufijo aleatorio y se
 * busca por él, nunca por recuento: dos corridas seguidas sobre la misma base pasan. Al final archiva los dos
 * planes públicos que deja, como `mi-plan-cambiar-plan`: el catálogo es global.
 */

test.describe.configure({ mode: "serial" });

const sufijo = randomBytes(4).toString("hex");
/** El plan que se crea por pasos (R30.1, R30.2). */
const nombreNuevo = `Plan E2E borrador ${sufijo}`;
/** El plan con dos empresas que se edita por pasos (R30.3–R30.5). */
const nombreConEmpresas = `Plan E2E borrador editar ${sufijo}`;
const COSTO_BASE = "1000";
const COSTO_POR_ORDEN = "100";
const TOPE_MENSAJEROS = "5";

const TEXTO = {
  guardarYContinuar: "Guardar y continuar",
  borradorQueda: "El borrador queda guardado. Puedes retomarlo luego.",
  borradores: "Borradores",
  planNuevo: "Plan nuevo",
  cambioDe: (plan: string) => `Cambio de ${plan}`,
  retomar: "Retomar",
  cambioEnBorrador: "Cambio en borrador",
  estado: (n: number, m: number) => `Borrador · ${n} de ${m} pasos guardados`,
  guardado: (paso: string) => `${paso} (guardado)`,
  /** `borradorDe(q, f)` con `f` en `AAAA-MM-DD HH:mm` (`fechaHora`). */
  borradorDe: /^Borrador de .+, guardado el \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
  verPlan: (nombre: string) => `Ver el plan ${nombre}`,
  creado: (nombre: string) => `Plan «${nombre}» creado.`,
  programado: (fecha: string) => `Cambio programado desde ${fecha}`,
  recepciones: "0 de 2 empresas ya lo recibieron",
} as const;

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
let empresaM: EmpresaE2E | null = null;
let empresaN: EmpresaE2E | null = null;
let nombreM = "";
let nombreN = "";
let superadminId = "";
let planConEmpresasId = "";
let planNuevoId = "";

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function db(): PrismaClient {
  if (!dueno) throw new Error("sin cliente de base: falló el beforeAll");
  return dueno;
}

/** El 1 del mes siguiente al de hoy en la plataforma: la F del cambio (dentro de «hoy … hoy + 12 meses»). */
function primeroDelMesSiguiente(): string {
  const [anio, mes] = fechaCalendarioCR(new Date()).split("-").map(Number);
  return mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;
}

/** Cuándo recibe el cambio una empresa anual: el 1 de enero en o después de F. */
function primeroDeEneroDesde(f: string): string {
  return f.endsWith("-01-01") ? f : `${Number(f.slice(0, 4)) + 1}-01-01`;
}

async function asignar(empresa: EmpresaE2E, tipo: TipoCobro): Promise<void> {
  const ahora = new Date();
  const hoy = fechaCalendarioCR(ahora);
  const efecto = { clase: "inicio", fecha: hoy, desde: inicioDelDiaPlataforma(hoy), elegida: false } as const;
  const r = await new PlanesRepository(db()).asignar(
    empresa.organizacionId,
    planConEmpresasId,
    superadminId,
    efecto,
    tipo,
    ahora,
  );
  if (r.estado !== "ok") throw new Error(`SLT-144 T6.1: asignar el plan no lo dejó asignado: ${JSON.stringify(r)}`);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  empresaM = await crearEmpresaE2E("borrador-m");
  empresaN = await crearEmpresaE2E("borrador-n");
  nombreM = (await db().organizacion.findUniqueOrThrow({ where: { id: empresaM.organizacionId }, select: { nombre: true } })).nombre;
  nombreN = (await db().organizacion.findUniqueOrThrow({ where: { id: empresaN.organizacionId }, select: { nombre: true } })).nombre;

  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));
  const usuario = await db().usuario.findFirstOrThrow({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
    select: { id: true },
  });
  superadminId = usuario.id;

  // El plan con dos empresas de tipos de cobro distintos (R30.4).
  planConEmpresasId = await crearPlanPublicoConCosto(db(), nombreConEmpresas, "100.00");
  await asignar(empresaM, "mensual");
  await asignar(empresaN, "anual");

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(db(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  // El catálogo es global: los dos planes públicos salen del carrusel de «Mi plan» de los demás specs.
  if (dueno && superadminId !== "") {
    const repo = new PlanesRepository(dueno);
    for (const id of [planNuevoId, planConEmpresasId].filter((p) => p !== "")) await repo.archivar(id, superadminId);
  }
  await contextoSa?.close();
  await dueno?.$disconnect();
});

/** Pulsa «Guardar y continuar» y espera a que el paso `proximo` esté en pantalla (su título es el `h3`). */
async function guardarYContinuar(form: Locator, proximo: string): Promise<void> {
  await form.getByRole("button", { name: TEXTO.guardarYContinuar, exact: true }).click();
  await expect(form.getByRole("heading", { level: 3, name: proximo, exact: true })).toBeVisible({ timeout: 30_000 });
}

/** El botón de un paso en la lista «Pasos». */
function botonDelPaso(form: Locator, nombre: string): Locator {
  return form.getByRole("navigation", { name: "Pasos" }).getByRole("button", { name: nombre, exact: true });
}

/** Elige un paso de la lista y espera su título. */
async function irAlPaso(form: Locator, nombre: string, titulo: string): Promise<void> {
  await botonDelPaso(form, nombre).click();
  await expect(form.getByRole("heading", { level: 3, name: titulo, exact: true })).toBeVisible({ timeout: 30_000 });
}

/** Cierra el panel con su «Cerrar» y espera a que se vaya. */
async function cerrarPanel(dialogo: Locator): Promise<void> {
  await dialogo.getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
}

function filaDelCatalogo(page: Page, nombre: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: TEXTO.verPlan(nombre), exact: true }) });
}

function seccionBorradores(page: Page): Locator {
  return page.getByRole("region", { name: TEXTO.borradores, exact: true });
}

test("R30: crear y editar un plan por pasos con borrador — crear, cerrar, retomar desde «Borradores» y «Crear plan»", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo plan" });
  const form = dialogo.getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });
  await expect(form).toContainText(TEXTO.estado(0, 5));

  // R30.1: General, Precio y Cobro por orden, cada uno con «Guardar y continuar».
  await expect(form.getByRole("heading", { level: 3, name: "General", exact: true })).toBeVisible();
  await form.getByRole("textbox", { name: /^Nombre/ }).fill(nombreNuevo);
  await form.getByRole("radio", { name: "Público", exact: true }).click();
  await guardarYContinuar(form, "Precio y descuentos");
  await form.getByRole("radio", { name: "Con monto", exact: true }).click();
  await form.getByLabel("Costo base mensual", { exact: true }).fill(COSTO_BASE);
  await guardarYContinuar(form, "Cobro por orden");
  await form.getByLabel("Costo por orden", { exact: true }).fill(COSTO_POR_ORDEN);
  await guardarYContinuar(form, "Topes");
  await expect(form).toContainText(TEXTO.estado(3, 5));
  await cerrarPanel(dialogo);

  // Cerrar con pasos guardados avisa (R13) y la sección «Borradores» trae el plan nuevo (R24).
  await expect(page.getByRole("status").filter({ hasText: TEXTO.borradorQueda })).toBeVisible({ timeout: 30_000 });
  const fila = seccionBorradores(page).getByRole("row").filter({ hasText: nombreNuevo });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(TEXTO.planNuevo);
  await expect(filaDelCatalogo(page, nombreNuevo)).toHaveCount(0);

  // «Retomar»: el mismo borrador, en el primer paso sin guardar, con los tres ✓ y los mismos valores.
  await fila.getByRole("button", { name: TEXTO.retomar, exact: true }).click();
  const retomado = page.getByRole("dialog", { name: "Nuevo plan" }).getByRole("form", { name: "Crear plan" });
  await expect(retomado.getByRole("heading", { level: 3, name: "Topes", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(retomado).toContainText(TEXTO.estado(3, 5));
  for (const paso of ["General", "Precio y descuentos", "Cobro por orden"]) {
    await expect(botonDelPaso(retomado, TEXTO.guardado(paso))).toBeVisible();
  }
  await irAlPaso(retomado, TEXTO.guardado("General"), "General");
  await expect(retomado.getByRole("textbox", { name: /^Nombre/ })).toHaveValue(nombreNuevo);
  await expect(retomado.getByRole("radio", { name: "Público", exact: true })).toBeChecked();
  await irAlPaso(retomado, TEXTO.guardado("Precio y descuentos"), "Precio y descuentos");
  await expect(retomado.getByRole("radio", { name: "Con monto", exact: true })).toBeChecked();
  await expect(retomado.getByLabel("Costo base mensual", { exact: true })).toHaveValue(COSTO_BASE);
  await irAlPaso(retomado, TEXTO.guardado("Cobro por orden"), "Cobro por orden");
  await expect(retomado.getByLabel("Costo por orden", { exact: true })).toHaveValue(COSTO_POR_ORDEN);

  // R30.2: el resto de pasos y «Crear plan».
  await irAlPaso(retomado, "Topes", "Topes");
  await guardarYContinuar(retomado, "Módulos");
  for (const modulo of ORDEN_MODULOS) {
    await retomado.getByRole("checkbox", { name: nombreDelModulo(modulo), exact: true }).check();
  }
  await guardarYContinuar(retomado, "Revisar y crear");
  await expect(retomado).toContainText(TEXTO.estado(5, 5));
  const crear = retomado.getByRole("button", { name: "Crear plan", exact: true });
  await expect(crear).toBeEnabled({ timeout: 60_000 });
  await crear.click();

  await expect(page.getByRole("status").filter({ hasText: TEXTO.creado(nombreNuevo) })).toBeVisible({ timeout: 60_000 });
  await expect(filaDelCatalogo(page, nombreNuevo)).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByRole("row").filter({ hasText: nombreNuevo }).filter({ hasText: TEXTO.planNuevo })).toHaveCount(0, {
    timeout: 60_000,
  });

  // Por detrás: el plan existe con los valores de los pasos guardados y su borrador ya no está.
  const plan = await db().plan.findFirstOrThrow({
    where: { nombre: nombreNuevo },
    select: { id: true, visibilidad: true, costoPorOrden: true },
  });
  planNuevoId = plan.id;
  expect(plan.visibilidad).toBe("publico");
  expect(plan.costoPorOrden?.toFixed(2)).toBe("100.00");
});

test("R30: crear y editar un plan por pasos con borrador — editar con empresas, retomar, fecha de cada empresa y programar", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  const f = primeroDelMesSiguiente();
  const detalle = `/plataforma/planes/${planConEmpresasId}`;

  // R30.3: cuatro pasos guardados y se cierra el panel.
  await page.goto(detalle);
  await page.getByRole("button", { name: "Editar", exact: true }).click({ timeout: 60_000 });
  const dialogo = page.getByRole("dialog", { name: "Editar plan" });
  const form = dialogo.getByRole("form", { name: "Guardar" });
  await expect(form.getByRole("heading", { level: 3, name: "General", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(form).toContainText(TEXTO.estado(0, 6));
  await guardarYContinuar(form, "Precio y descuentos");
  await guardarYContinuar(form, "Cobro por orden");
  await guardarYContinuar(form, "Topes");
  await form.getByRole("textbox", { name: "Usuarios activos con el rol Mensajero" }).fill(TOPE_MENSAJEROS);
  await guardarYContinuar(form, "Módulos");
  await expect(form).toContainText(TEXTO.estado(4, 6));
  await cerrarPanel(dialogo);
  await expect(page.getByRole("status").filter({ hasText: TEXTO.borradorQueda })).toBeVisible({ timeout: 30_000 });

  // En la lista: la marca junto al plan y la fila del cambio en «Borradores» (R24, R25).
  await page.goto("/plataforma/planes");
  await expect(filaDelCatalogo(page, nombreConEmpresas)).toContainText(TEXTO.cambioEnBorrador, { timeout: 60_000 });
  await expect(seccionBorradores(page).getByRole("row").filter({ hasText: TEXTO.cambioDe(nombreConEmpresas) })).toHaveCount(1);

  // «Editar» otra vez: se retoma con el aviso, en el primer paso sin guardar y con el tope guardado (R14, R15).
  await page.goto(detalle);
  await page.getByRole("button", { name: "Editar", exact: true }).click({ timeout: 60_000 });
  const retomado = page.getByRole("dialog", { name: "Editar plan" }).getByRole("form", { name: "Guardar" });
  await expect(retomado.getByRole("heading", { level: 3, name: "Módulos", exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(retomado.getByText(TEXTO.borradorDe)).toBeVisible();
  await expect(retomado).toContainText(TEXTO.estado(4, 6));
  await irAlPaso(retomado, TEXTO.guardado("Topes"), "Topes");
  await expect(retomado.getByRole("textbox", { name: "Usuarios activos con el rol Mensajero" })).toHaveValue(TOPE_MENSAJEROS);
  await irAlPaso(retomado, "Módulos", "Módulos");
  await guardarYContinuar(retomado, "Cuándo rige");

  // R30.4: «A partir de» F; la tabla dice cuándo recibe el cambio cada empresa.
  await retomado.getByRole("radio", { name: "A partir de", exact: true }).click();
  await retomado.getByLabel("Fecha", { exact: true }).fill(f);
  const tabla = retomado.getByRole("table");
  await expect(tabla.getByRole("columnheader", { name: "Recibe el cambio el", exact: true })).toBeVisible({ timeout: 60_000 });
  const filaM = tabla.getByRole("row").filter({ hasText: nombreM });
  const filaN = tabla.getByRole("row").filter({ hasText: nombreN });
  await expect(filaM).toHaveCount(1, { timeout: 60_000 });
  await expect(filaM.getByRole("cell")).toHaveText([nombreM, "Mensual", f]);
  await expect(filaN.getByRole("cell")).toHaveText([nombreN, "Anual", primeroDeEneroDesde(f)]);

  // R30.5: programar.
  await guardarYContinuar(retomado, "Revisar y programar");
  await expect(retomado).toContainText(TEXTO.estado(6, 6));
  const programar = retomado.getByRole("button", { name: "Programar cambio", exact: true });
  await expect(programar).toBeEnabled({ timeout: 60_000 });
  await programar.click();

  await expect(page.getByRole("dialog", { name: "Editar plan" })).toBeHidden({ timeout: 60_000 });
  const pendiente = page.getByRole("region", { name: "Cambio programado", exact: true });
  await expect(pendiente).toContainText(TEXTO.programado(f), { timeout: 60_000 });
  await expect(pendiente).toContainText(TEXTO.recepciones);

  await page.goto("/plataforma/planes");
  const filaPlan = filaDelCatalogo(page, nombreConEmpresas);
  await expect(filaPlan).toHaveCount(1, { timeout: 60_000 });
  await expect(filaPlan).not.toContainText(TEXTO.cambioEnBorrador);
  await expect(page.getByRole("row").filter({ hasText: TEXTO.cambioDe(nombreConEmpresas) })).toHaveCount(0);
});
