import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS, nombreDelModulo } from "../lib/modulos/catalogo";
import { inicioDelDiaPlataforma } from "../lib/planes/ciclo";
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
 * SLT-214 «Planes: beneficios de texto con ícono» T11 (R26) — el recorrido del superadmin en el navegador.
 *
 * 1. Crear (R26.1): «Nuevo plan» por pasos; en «Beneficios», cuatro con «Agregar beneficio», el segundo con el
 *    ícono «Soporte». «Revisar y crear» los lista en orden y «Crear plan» los guarda en ese orden.
 * 2. Listado (R26.2): la fila del plan muestra los 3 primeros y «Mostrar más» (`aria-expanded="false"`); al
 *    pulsarlo se ven los cuatro y el botón pasa a «Mostrar menos» (`aria-expanded="true"`).
 * 3. Detalle (R26.3): «Versión vigente» lista los cuatro, en orden.
 * 4. Editar (R26.4): el plan se asigna por detrás a una empresa mensual (como `planes-borrador`), y en «Editar»
 *    se quita el cuarto beneficio y se agrega otro. «A partir de» el 1 del mes siguiente (F) y «Programar
 *    cambio»: el detalle dice «Cambio programado desde F» con «Se agrega: …» y «Se quita: …», y «Versión
 *    vigente» y la base siguen con los cuatro de antes.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/planes-beneficios.spec.ts` (proyecto `aislamiento`, arrastra
 * `plataforma-vacia`). Base local desechable, migrada y con `pnpm run db:seed`. Todo lleva sufijo aleatorio y se
 * busca por él, nunca por recuento. Al final archiva el plan público que crea: el catálogo es global.
 */

test.describe.configure({ mode: "serial" });

const sufijo = randomBytes(4).toString("hex");
const nombrePlan = `Plan E2E beneficios ${sufijo}`;
const COSTO_BASE = "1000";
const COSTO_POR_ORDEN = "100";

/** Los cuatro beneficios del alta, en orden; el segundo con el ícono «Soporte», los demás con «Check». */
const BENEFICIOS = [
  `Acceso anticipado ${sufijo}`,
  `Soporte 24 h ${sufijo}`,
  `Features nuevas ${sufijo}`,
  `Reportes mensuales ${sufijo}`,
] as const;
/** El que se agrega al editar, en lugar del cuarto. */
const BENEFICIO_NUEVO = `Gestor dedicado ${sufijo}`;

const TEXTO = {
  guardarYContinuar: "Guardar y continuar",
  agregarBeneficio: "Agregar beneficio",
  textoDelBeneficio: (n: number) => `Texto del beneficio ${n}`,
  iconoDelBeneficio: (n: number) => `Ícono del beneficio ${n}`,
  quitarBeneficio: (n: number) => `Quitar beneficio ${n}`,
  soporte: "Soporte",
  beneficios: "Beneficios",
  mostrarMas: "Mostrar más",
  mostrarMenos: "Mostrar menos",
  verPlan: (nombre: string) => `Ver el plan ${nombre}`,
  creado: (nombre: string) => `Plan «${nombre}» creado.`,
  vigente: "Versión vigente",
  pendiente: "Cambio programado",
  programado: (fecha: string) => `Cambio programado desde ${fecha}`,
  seAgrega: (texto: string) => `Se agrega: ${texto}`,
  seQuita: (texto: string) => `Se quita: ${texto}`,
} as const;

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

/** Los textos de los beneficios del plan en la base, por `posicion`. */
async function beneficiosEnLaBase(id: string): Promise<{ texto: string; icono: string }[]> {
  return db().planBeneficio.findMany({
    where: { planId: id },
    orderBy: { posicion: "asc" },
    select: { texto: true, icono: true },
  });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  empresa = await crearEmpresaE2E("beneficios");
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

/** «Agregar beneficio» y escribe el texto en la fila `n` (1-based), que es la nueva. */
async function agregarBeneficio(form: Locator, n: number, texto: string): Promise<void> {
  await form.getByRole("button", { name: TEXTO.agregarBeneficio, exact: true }).click();
  const campo = form.getByRole("textbox", { name: TEXTO.textoDelBeneficio(n), exact: true });
  await expect(campo).toBeVisible({ timeout: 30_000 });
  await campo.fill(texto);
}

/** Los `<li>` de la lista «Beneficios» dentro de `ambito`. */
function itemsDeBeneficios(ambito: Locator): Locator {
  return ambito.getByRole("list", { name: TEXTO.beneficios, exact: true }).getByRole("listitem");
}

function filaDelCatalogo(page: Page, nombre: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("link", { name: TEXTO.verPlan(nombre), exact: true }) });
}

test("R26: crear un plan con 4 beneficios, verlos en el listado con «Mostrar más» y en el detalle, en orden", async () => {
  test.setTimeout(240_000);
  const page = superadmin();
  await page.goto("/plataforma/planes");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo plan" });
  const form = dialogo.getByRole("form", { name: "Crear plan" });
  await expect(form).toBeVisible({ timeout: 60_000 });

  // R26.1: los pasos hasta «Beneficios», como `planes-borrador`.
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

  // Cuatro beneficios; el segundo con el ícono «Soporte» (R8).
  for (const [i, texto] of BENEFICIOS.entries()) await agregarBeneficio(form, i + 1, texto);
  const icono2 = form.getByRole("combobox", { name: TEXTO.iconoDelBeneficio(2), exact: true });
  await icono2.click();
  await page.getByRole("option", { name: TEXTO.soporte, exact: true }).click();
  await expect(icono2).toContainText(TEXTO.soporte);

  // SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (R7, R9): «Niveles» tras «Beneficios», sin niveles.
  await guardarYContinuar(form, "Niveles");
  // «Revisar y crear» los lista en orden (R14) y «Crear plan» los guarda (R15).
  await guardarYContinuar(form, "Revisar y crear");
  await expect(itemsDeBeneficios(form)).toHaveText([...BENEFICIOS]);
  const crear = form.getByRole("button", { name: "Crear plan", exact: true });
  await expect(crear).toBeEnabled({ timeout: 60_000 });
  await crear.click();
  await expect(page.getByRole("status").filter({ hasText: TEXTO.creado(nombrePlan) })).toBeVisible({ timeout: 60_000 });

  const plan = await db().plan.findFirstOrThrow({ where: { nombre: nombrePlan }, select: { id: true } });
  planId = plan.id;
  expect(await beneficiosEnLaBase(planId)).toEqual([
    { texto: BENEFICIOS[0], icono: "check" },
    { texto: BENEFICIOS[1], icono: "soporte" },
    { texto: BENEFICIOS[2], icono: "check" },
    { texto: BENEFICIOS[3], icono: "check" },
  ]);

  // R26.2: en el listado, los 3 primeros y «Mostrar más»; se despliega el cuarto y se vuelve a plegar (R20, R21).
  await page.goto("/plataforma/planes");
  const fila = filaDelCatalogo(page, nombrePlan);
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(itemsDeBeneficios(fila)).toHaveText(BENEFICIOS.slice(0, 3));
  const mostrarMas = fila.getByRole("button", { name: TEXTO.mostrarMas, exact: true });
  await expect(mostrarMas).toHaveAttribute("aria-expanded", "false");
  await mostrarMas.click();
  await expect(itemsDeBeneficios(fila)).toHaveText([...BENEFICIOS]);
  const mostrarMenos = fila.getByRole("button", { name: TEXTO.mostrarMenos, exact: true });
  await expect(mostrarMenos).toHaveAttribute("aria-expanded", "true");
  await mostrarMenos.click();
  await expect(itemsDeBeneficios(fila)).toHaveText(BENEFICIOS.slice(0, 3));

  // R26.3: en el detalle, los cuatro y en orden (R22).
  await fila.getByRole("link", { name: TEXTO.verPlan(nombrePlan), exact: true }).click();
  await page.waitForURL(`**/plataforma/planes/${planId}`, { timeout: 60_000 });
  const vigente = page.getByRole("region", { name: TEXTO.vigente, exact: true });
  await expect(itemsDeBeneficios(vigente)).toHaveText([...BENEFICIOS], { timeout: 60_000 });
});

test("R26: editar los beneficios programa el cambio con su fecha sin cambiar todavía los del plan", async () => {
  test.setTimeout(240_000);
  if (!empresa || planId === "") throw new Error("SLT-214 T11: falta el plan del caso anterior");
  const page = superadmin();
  const f = primeroDelMesSiguiente();

  // Por detrás: el plan pasa a tener una empresa mensual, así el cambio se programa con su fecha (R16).
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
  if (asignado.estado !== "ok") throw new Error(`SLT-214 T11: asignar el plan no lo dejó asignado: ${JSON.stringify(asignado)}`);

  // R26.4: «Editar», hasta «Beneficios» (R13: abre con los del plan); se quita el cuarto y se agrega otro.
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
  for (const [i, texto] of BENEFICIOS.entries()) {
    await expect(form.getByRole("textbox", { name: TEXTO.textoDelBeneficio(i + 1), exact: true })).toHaveValue(texto);
  }
  await form.getByRole("button", { name: TEXTO.quitarBeneficio(4), exact: true }).click();
  await expect(form.getByRole("textbox", { name: TEXTO.textoDelBeneficio(4), exact: true })).toHaveCount(0);
  await agregarBeneficio(form, 4, BENEFICIO_NUEVO);
  // SLT-215 (R7): al editar, «Niveles» va antes de «Cuándo rige».
  await guardarYContinuar(form, "Niveles");
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

  // El cambio queda programado con su fecha y dice qué beneficios se agregan y cuáles se quitan (R25).
  const pendiente = page.getByRole("region", { name: TEXTO.pendiente, exact: true });
  await expect(pendiente).toContainText(TEXTO.programado(f), { timeout: 60_000 });
  await expect(pendiente.getByRole("listitem").filter({ hasText: TEXTO.seAgrega(BENEFICIO_NUEVO) })).toHaveCount(1);
  await expect(pendiente.getByRole("listitem").filter({ hasText: TEXTO.seQuita(BENEFICIOS[3]) })).toHaveCount(1);

  // Los del plan no cambian al programar (R16): ni en «Versión vigente» ni en la base.
  const vigente = page.getByRole("region", { name: TEXTO.vigente, exact: true });
  await expect(itemsDeBeneficios(vigente)).toHaveText([...BENEFICIOS]);
  expect((await beneficiosEnLaBase(planId)).map((b) => b.texto)).toEqual([...BENEFICIOS]);
});
