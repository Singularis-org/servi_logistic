import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import { inicioDelDiaPlataforma } from "../lib/planes/ciclo";
import { textoDeLosNiveles, textoDelNivel, type Nivel } from "../lib/planes/niveles";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearEmpresaE2E, type EmpresaE2E } from "../tests/fabricas/e2e";

import { clienteDueno } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-215 «Planes: niveles de beneficio por volumen de órdenes» T11 (R38) — el recorrido del superadmin en el
 * navegador.
 *
 * 1. Crear (R38.1): «Nuevo plan» por pasos; en «Niveles», dos con «Agregar nivel»: el 1 en «Porcentaje» y el 2 en
 *    «Monto fijo». «Revisar y crear» los lista en orden y «Crear plan» los guarda en ese orden.
 * 2. Listado (R38.2): la columna «Niveles» de la fila del plan los muestra, uno por línea y en orden.
 * 3. Editar (R38.3): el plan se asigna por detrás a una empresa mensual (como `planes-beneficios`), y en «Editar»
 *    se cambia el monto del nivel 2 y se agrega un nivel 3. «A partir de» el 1 del mes siguiente (F) y «Programar
 *    cambio»: el detalle dice «Cambio programado desde F» con la línea «Niveles por volumen: antes → después»; en
 *    el listado la columna «Niveles» sigue con los dos de antes y «Cambio» dice «Desde F»; la base, igual.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/planes-niveles.spec.ts` (proyecto `aislamiento`, arrastra
 * `plataforma-vacia`). Base local desechable, migrada y con `pnpm run db:seed`. Todo lleva sufijo aleatorio y se
 * busca por él, nunca por recuento. Al final archiva el plan público que crea: el catálogo es global.
 */

test.describe.configure({ mode: "serial" });

const sufijo = randomBytes(4).toString("hex");
const nombrePlan = `Plan E2E niveles ${sufijo}`;
const COSTO_BASE = "1000";
const COSTO_POR_ORDEN = "100";

/** Los dos niveles del alta: el 1 en porcentaje, el 2 en monto. */
const NIVELES: readonly Nivel[] = [
  { meta: 50, descuento: { tipo: "porcentaje", porcentaje: "5" } },
  { meta: 150, descuento: { tipo: "monto", monto: "500" } },
];
/** Los de la edición: el 2 pasa a 800 y se agrega un 3 en porcentaje. */
const NIVELES_EDITADOS: readonly Nivel[] = [
  NIVELES[0],
  { meta: 150, descuento: { tipo: "monto", monto: "800" } },
  { meta: 300, descuento: { tipo: "porcentaje", porcentaje: "10" } },
];

const TEXTO = {
  guardarYContinuar: "Guardar y continuar",
  niveles: "Niveles",
  sinNivelesEnElPaso: "Este plan no tiene niveles.",
  agregarNivel: "Agregar nivel",
  metaDelNivel: (n: number) => `Meta de órdenes al mes del nivel ${n}`,
  tipoDeDescuentoDelNivel: (n: number) => `Tipo de descuento del nivel ${n}`,
  porcentaje: "Porcentaje",
  montoFijo: "Monto fijo",
  descuentoDelNivel: (n: number) => `Descuento del nivel ${n}`,
  verPlan: (nombre: string) => `Ver el plan ${nombre}`,
  creado: (nombre: string) => `Plan «${nombre}» creado.`,
  pendiente: "Cambio programado",
  programado: (fecha: string) => `Cambio programado desde ${fecha}`,
  cambioDesde: (fecha: string) => `Desde ${fecha}`,
  nivelesPorVolumen: (antes: readonly Nivel[], despues: readonly Nivel[]) =>
    `Niveles por volumen: ${textoDeLosNiveles(antes)} → ${textoDeLosNiveles(despues)}`,
} as const;

/** Las líneas de la columna «Niveles» y de «Revisar»: «Nivel n: desde M órdenes, −…», en orden (R21). */
function lineas(niveles: readonly Nivel[]): string[] {
  return niveles.map((n, i) => textoDelNivel(i + 1, n));
}

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
let empresa: EmpresaE2E | null = null;
let nombreEmpresa = "";
let superadminId = "";
let planId = "";

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

/** Los niveles del plan en la base, por número de nivel, con los importes a dos decimales. */
async function nivelesEnLaBase(id: string): Promise<{ meta: number; pct: string | null; monto: string | null }[]> {
  const filas = await db().planNivel.findMany({
    where: { planId: id },
    orderBy: { nivel: "asc" },
    select: { meta: true, descuentoPct: true, descuentoMonto: true },
  });
  return filas.map((f) => ({
    meta: f.meta,
    pct: f.descuentoPct?.toFixed(2) ?? null,
    monto: f.descuentoMonto?.toFixed(2) ?? null,
  }));
}

const NIVELES_EN_LA_BASE = [
  { meta: 50, pct: "5.00", monto: null },
  { meta: 150, pct: null, monto: "500.00" },
];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  empresa = await crearEmpresaE2E("niveles");
  nombreEmpresa = (
    await db().organizacion.findUniqueOrThrow({ where: { id: empresa.organizacionId }, select: { nombre: true } })
  ).nombre;

  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));
  const usuario = await db().usuario.findFirstOrThrow({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
    select: { id: true },
  });
  superadminId = usuario.id;

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(db(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  // El catálogo es global: el plan público sale del carrusel de «Mi plan» de los demás specs.
  if (dueno && superadminId !== "" && planId !== "") await new PlanesRepository(dueno).archivar(planId, superadminId);
  await contextoSa?.close();
  await dueno?.$disconnect();
});

/** Pulsa «Guardar y continuar» y espera a que el paso `proximo` esté en pantalla (su título es el `h3`). */
async function guardarYContinuar(form: Locator, proximo: string): Promise<void> {
  await form.getByRole("button", { name: TEXTO.guardarYContinuar, exact: true }).click();
  await expect(form.getByRole("heading", { level: 3, name: proximo, exact: true })).toBeVisible({ timeout: 30_000 });
}

/**
 * «Agregar nivel» y rellena la fila `n` (1-based), que es la nueva: meta, tipo (la fila nace en «Porcentaje»; con
 * monto se elige «Monto fijo») y valor.
 */
async function agregarNivel(form: Locator, n: number, nivel: Nivel): Promise<void> {
  await form.getByRole("button", { name: TEXTO.agregarNivel, exact: true }).click();
  const meta = form.getByLabel(TEXTO.metaDelNivel(n), { exact: true });
  await expect(meta).toBeVisible({ timeout: 30_000 });
  await meta.fill(String(nivel.meta));
  const tipo = form.getByRole("radiogroup", { name: TEXTO.tipoDeDescuentoDelNivel(n), exact: true });
  await expect(tipo.getByRole("radio", { name: TEXTO.porcentaje, exact: true })).toBeChecked();
  if (nivel.descuento.tipo === "monto") {
    await tipo.getByRole("radio", { name: TEXTO.montoFijo, exact: true }).click();
    await expect(tipo.getByRole("radio", { name: TEXTO.montoFijo, exact: true })).toBeChecked();
  }
  const valor = nivel.descuento.tipo === "monto" ? nivel.descuento.monto : nivel.descuento.porcentaje;
  await form.getByLabel(TEXTO.descuentoDelNivel(n), { exact: true }).fill(valor);
}

function filaDelCatalogo(page: Page, nombre: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: TEXTO.verPlan(nombre), exact: true }) });
}

/** Las líneas de la columna «Niveles» de una fila del catálogo: las únicas que empiezan por «Nivel n:». */
function nivelesDeLaFila(fila: Locator): Locator {
  return fila.getByRole("listitem").filter({ hasText: /^Nivel \d+: / });
}

test("R38: crear un plan con 2 niveles, uno en porcentaje y otro en monto, y verlos en orden en el listado", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo plan" });
  const form = dialogo.getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });

  // R38.1: los pasos hasta «Niveles», como `planes-beneficios`.
  await expect(form.getByRole("heading", { level: 3, name: "General", exact: true })).toBeVisible();
  await form.getByRole("textbox", { name: /^Nombre/ }).fill(nombrePlan);
  await form.getByRole("radio", { name: "Público", exact: true }).click();
  await guardarYContinuar(form, "Precio y descuentos");
  await form.getByRole("radio", { name: "Con monto", exact: true }).click();
  await form.getByLabel("Costo base mensual", { exact: true }).fill(COSTO_BASE);
  await guardarYContinuar(form, "Cobro por orden");
  await form.getByLabel("Costo por orden", { exact: true }).fill(COSTO_POR_ORDEN);
  await guardarYContinuar(form, "Topes");
  await guardarYContinuar(form, "Módulos");
  for (const modulo of ORDEN_MODULOS) {
    await form.getByRole("checkbox", { name: nombreDelModulo(modulo), exact: true }).check();
  }
  await guardarYContinuar(form, "Beneficios");
  await guardarYContinuar(form, TEXTO.niveles);

  // El paso abre vacío (R9) y se agregan los dos niveles (R8): el 1 en porcentaje, el 2 en monto.
  await expect(form.getByText(TEXTO.sinNivelesEnElPaso, { exact: true })).toBeVisible();
  for (const [i, nivel] of NIVELES.entries()) await agregarNivel(form, i + 1, nivel);

  // «Revisar y crear» los lista en orden (R14) y «Crear plan» los guarda (R15).
  await guardarYContinuar(form, "Revisar y crear");
  await expect(form.getByRole("list", { name: TEXTO.niveles, exact: true }).getByRole("listitem")).toHaveText(
    lineas(NIVELES),
  );
  const crear = form.getByRole("button", { name: "Crear plan", exact: true });
  await expect(crear).toBeEnabled({ timeout: 60_000 });
  await crear.click();
  await expect(page.getByRole("status").filter({ hasText: TEXTO.creado(nombrePlan) })).toBeVisible({ timeout: 60_000 });

  const plan = await db().plan.findFirstOrThrow({ where: { nombre: nombrePlan }, select: { id: true } });
  planId = plan.id;
  expect(await nivelesEnLaBase(planId)).toEqual(NIVELES_EN_LA_BASE);

  // R38.2: la columna «Niveles» del listado, uno por línea y en orden (R21).
  await page.goto("/plataforma/planes");
  const fila = filaDelCatalogo(page, nombrePlan);
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(nivelesDeLaFila(fila)).toHaveText(lineas(NIVELES));
});

test("R38: editar los niveles programa el cambio con su fecha sin cambiar todavía la columna «Niveles»", async () => {
  test.setTimeout(240_000);
  if (!empresa || planId === "") throw new Error("SLT-215 T11: falta el plan del caso anterior");
  const page = superadmin();
  const f = primeroDelMesSiguiente();

  // Por detrás: el plan pasa a tener una empresa mensual, así el cambio se programa con su fecha.
  const ahora = new Date();
  const hoy = fechaCalendarioCR(ahora);
  const efecto = { clase: "inicio", fecha: hoy, desde: inicioDelDiaPlataforma(hoy), elegida: false } as const;
  const asignado = await new PlanesRepository(db()).asignar(
    empresa.organizacionId,
    planId,
    superadminId,
    efecto,
    "mensual",
    ahora,
  );
  if (asignado.estado !== "ok") throw new Error(`SLT-215 T11: asignar el plan no lo dejó asignado: ${JSON.stringify(asignado)}`);

  // R38.3: «Editar», hasta «Niveles» (R13: abre con los del plan); el 2 pasa a 800 y se agrega un 3.
  await page.goto(`/plataforma/planes/${planId}`);
  await page.getByRole("button", { name: "Editar", exact: true }).click({ timeout: 60_000 });
  const dialogo = page.getByRole("dialog", { name: "Editar plan" });
  const form = dialogo.getByRole("form", { name: "Guardar" });
  await expect(form.getByRole("heading", { level: 3, name: "General", exact: true })).toBeVisible({ timeout: 60_000 });
  await guardarYContinuar(form, "Precio y descuentos");
  await guardarYContinuar(form, "Cobro por orden");
  await guardarYContinuar(form, "Topes");
  await guardarYContinuar(form, "Módulos");
  await guardarYContinuar(form, "Beneficios");
  await guardarYContinuar(form, TEXTO.niveles);
  for (const [i, nivel] of NIVELES.entries()) {
    await expect(form.getByLabel(TEXTO.metaDelNivel(i + 1), { exact: true })).toHaveValue(String(nivel.meta));
  }
  await expect(
    form
      .getByRole("radiogroup", { name: TEXTO.tipoDeDescuentoDelNivel(2), exact: true })
      .getByRole("radio", { name: TEXTO.montoFijo, exact: true }),
  ).toBeChecked();
  const valor2 = form.getByLabel(TEXTO.descuentoDelNivel(2), { exact: true });
  await valor2.fill("800");
  await expect(valor2).toHaveValue("800");
  await agregarNivel(form, 3, NIVELES_EDITADOS[2]);
  await guardarYContinuar(form, "Cuándo rige");

  // «A partir de» F: la empresa mensual lo recibe en F.
  await form.getByLabel("A partir de", { exact: true }).fill(f);
  const filaEmpresa = form.getByRole("table").getByRole("row").filter({ hasText: nombreEmpresa });
  await expect(filaEmpresa.getByRole("cell")).toHaveText([nombreEmpresa, "Mensual", f], { timeout: 60_000 });

  await guardarYContinuar(form, "Revisar y programar");
  const programar = form.getByRole("button", { name: "Programar cambio", exact: true });
  await expect(programar).toBeEnabled({ timeout: 60_000 });
  await programar.click();
  await expect(dialogo).toBeHidden({ timeout: 60_000 });

  // El cambio queda programado con su fecha y dice cómo cambian los niveles (R20).
  const pendiente = page.getByRole("region", { name: TEXTO.pendiente, exact: true });
  await expect(pendiente).toContainText(TEXTO.programado(f), { timeout: 60_000 });
  await expect(
    pendiente.getByRole("listitem").filter({ hasText: TEXTO.nivelesPorVolumen(NIVELES, NIVELES_EDITADOS) }),
  ).toHaveCount(1);

  // La columna «Niveles» no cambia al programar (R16, R21): sigue con los dos de antes, y «Cambio» dice «Desde F».
  await page.goto("/plataforma/planes");
  const fila = filaDelCatalogo(page, nombrePlan);
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(TEXTO.cambioDesde(f), { timeout: 60_000 });
  await expect(nivelesDeLaFila(fila)).toHaveText(lineas(NIVELES));
  expect(await nivelesEnLaBase(planId)).toEqual(NIVELES_EN_LA_BASE);
});
