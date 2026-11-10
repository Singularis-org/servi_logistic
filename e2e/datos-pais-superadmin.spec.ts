import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { getCountryCallingCode, getExampleNumber, type CountryCode } from "libphonenumber-js/max";
import ejemplosMoviles from "libphonenumber-js/mobile/examples";

import { paisDelCatalogo } from "../lib/constants/paises-iso-3166-1";

import { clienteDueno } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  AVISO_EMPRESA_CREADA,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-81 T4.1 (design §11.1; R25) — el superadmin da de alta un país con sus datos y un tipo de
 * documento, y el alta de empresa de ese país ofrece su prefijo y exactamente sus tipos activos.
 *
 * 1. País: el primero de `CANDIDATOS` que aún no esté dado de alta en la base. Son códigos reales que
 *    libphonenumber conoce (R26 rechaza los de prueba `XA`–`XZ`: no tienen prefijo oficial). Así dos
 *    corridas seguidas sobre la misma base pasan sin borrar nada; si la lista se agota, el spec falla
 *    y lo dice.
 * 2. Datos: el prefijo es el oficial (`getCountryCallingCode`); los dígitos nacionales y el teléfono
 *    del maestro salen del número de ejemplo de libphonenumber-js (sin dependencia nueva). La zona es
 *    la primera que el selector ofrece al escribir «America». Un tipo «Documento E2E <sufijo>», solo
 *    dígitos, de 8 a 10.
 * 3. `/plataforma/geografia` → «Nuevo país» con todo eso → la sección «Datos del país» lo muestra
 *    completo (sin «Datos incompletos») y la tabla trae el tipo.
 * 4. `/plataforma/empresas` → alta con ese país: el teléfono del maestro lleva `+<prefijo>`, el
 *    selector de tipo ofrece exactamente el tipo creado y el alta sale bien.
 *
 * El alta de empresa no exige geografía cargada en el país (`OrganizacionService.validarConElPais`
 * solo pide prefijo, dígitos, zona y un tipo activo, SLT-42 R6): no se carga ninguna división.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/datos-pais-superadmin.spec.ts` (proyecto
 * `aislamiento`, arrastra `plataforma-vacia`). Base local desechable, migrada y con
 * `pnpm run db:seed`.
 */

test.describe.configure({ mode: "serial" });

/** Países reales, con prefijo oficial y número de ejemplo, que ni la migración ni el seed dan de alta. */
const CANDIDATOS = ["PA", "GT", "HN", "SV", "NI", "DO", "PY", "UY", "BO", "PE", "CL", "AR", "VE", "MX", "ES", "PT"] as const;

const sufijo = randomBytes(4).toString("hex");
const NOMBRE_DEL_TIPO = `Documento E2E ${sufijo}`;
const LARGO_MIN = 8;
const LARGO_MAX = 10;

interface PaisDelE2E {
  id: string;
  nombre: string;
  prefijo: string;
  digitos: number;
  telefono: string;
}

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
let paisE2E: PaisDelE2E | null = null;
let zonaElegida = "";

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function pais(): PaisDelE2E {
  if (!paisE2E) throw new Error("no hay país elegido: falló el beforeAll");
  return paisE2E;
}

/** El primer candidato que la base aún no tiene, con su prefijo oficial y su número de ejemplo. */
async function elegirPais(db: PrismaClient): Promise<PaisDelE2E> {
  const ya = await db.pais.findMany({ where: { id: { in: [...CANDIDATOS] } }, select: { id: true } });
  const dados = new Set(ya.map((p) => p.id));
  const id = CANDIDATOS.find((c) => !dados.has(c));
  if (id === undefined) {
    throw new Error(
      `Todos los países candidatos (${CANDIDATOS.join(", ")}) ya están dados de alta en esta base: recréala o amplía CANDIDATOS.`,
    );
  }
  const delCatalogo = paisDelCatalogo(id);
  if (delCatalogo === null) throw new Error(`El catálogo ISO no tiene ${id}`);
  const ejemplo = getExampleNumber(id as CountryCode, ejemplosMoviles);
  if (!ejemplo) throw new Error(`libphonenumber-js no trae número de ejemplo para ${id}`);
  return {
    id,
    nombre: delCatalogo.nombre,
    prefijo: getCountryCallingCode(id as CountryCode),
    digitos: ejemplo.nationalNumber.length,
    telefono: ejemplo.nationalNumber,
  };
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDueno();
  paisE2E = await elegirPais(dueno);

  await conCandadoDelSuperadmin(() => asegurarSuperadmin(dueno!));
  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(dueno!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  // Sin borrado: el país queda dado de alta y la corrida siguiente elige otro candidato.
  await contextoSa?.close();
  await dueno?.$disconnect();
});

const NIVELES = [
  ["Nivel 1, en singular", "Provincia"],
  ["Nivel 1, en plural", "Provincias"],
  ["Nivel 2, en singular", "Distrito"],
  ["Nivel 2, en plural", "Distritos"],
  ["Nivel 3, en singular", "Barrio"],
  ["Nivel 3, en plural", "Barrios"],
] as const;

test("R25: «Nuevo país» con prefijo, dígitos, zona y un tipo deja el país completo", async () => {
  test.setTimeout(180_000);
  const page = superadmin();
  const p = pais();

  await page.goto("/plataforma/geografia");
  await page.getByRole("button", { name: "Nuevo país" }).click();
  const dialogo = page.getByRole("dialog", { name: "Nuevo país" });
  await expect(dialogo).toBeVisible({ timeout: 60_000 });

  // R26: al elegir el país, el prefijo llega cargado con el oficial.
  await dialogo.getByRole("combobox", { name: /^País/ }).fill(p.id);
  await page.getByRole("option", { name: `${p.nombre} (${p.id})`, exact: true }).click();
  await expect(dialogo.getByLabel(/^Prefijo telefónico/)).toHaveValue(p.prefijo);

  for (const [campo, valor] of NIVELES) {
    await dialogo.getByLabel(new RegExp(`^${campo}`)).fill(valor);
  }
  await dialogo.getByLabel(/^Dígitos nacionales/).fill(String(p.digitos));

  await dialogo.getByRole("combobox", { name: /^Zona horaria/ }).fill("America");
  const zona = page.getByRole("option").first();
  zonaElegida = (await zona.innerText()).trim();
  expect(zonaElegida, "el selector no ofreció ninguna zona de America").toMatch(/^America\//);
  await zona.click();

  const tipo = dialogo.getByRole("group", { name: "Tipo de documento 1" });
  await tipo.getByLabel(/^Documento/).fill(NOMBRE_DEL_TIPO);
  await tipo.getByLabel(/^Largo mínimo/).fill(String(LARGO_MIN));
  await tipo.getByLabel(/^Largo máximo/).fill(String(LARGO_MAX));

  await dialogo.getByRole("button", { name: "Dar de alta" }).click();
  await expect(dialogo).toHaveCount(0, { timeout: 60_000 });
  await page.waitForURL(`**/plataforma/geografia?pais=${p.id}`, { timeout: 60_000 });

  // La sección muestra los cuatro datos y no dice que falte nada (R2, R3).
  const datos = page.getByRole("region", { name: "Datos del país" });
  await expect(datos).toBeVisible({ timeout: 60_000 });
  await expect(datos.getByText("Datos incompletos", { exact: false })).toHaveCount(0);
  await expect(datos.locator("dd").nth(0)).toHaveText(`+${p.prefijo}`);
  await expect(datos.locator("dd").nth(1)).toHaveText(String(p.digitos));
  await expect(datos.locator("dd").nth(2)).toHaveText(zonaElegida);
  const filas = datos.getByRole("table", { name: `Tipos de documento de ${p.nombre}` }).locator("tbody tr");
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText(NOMBRE_DEL_TIPO);
  await expect(filas.first().getByRole("switch", { name: `Activo: ${NOMBRE_DEL_TIPO}` })).toBeChecked();
});

test("R25: el alta de empresa de ese país muestra su prefijo y exactamente su tipo, y sale bien", async () => {
  test.setTimeout(180_000);
  const page = superadmin();
  const p = pais();
  const slug = `e2e-pais-${sufijo}`;

  await page.goto("/plataforma/empresas");
  const form = page.getByRole("form", { name: "Crear empresa" });
  const empresa = form.getByRole("group", { name: "Empresa", exact: true });
  const maestro = form.getByRole("group", { name: "Primer maestro", exact: true });
  await expect(form).toBeVisible({ timeout: 60_000 });

  await empresa.getByLabel("Nombre", { exact: true }).fill(`Empresa E2E país ${sufijo}`);
  await empresa.getByLabel("Slug", { exact: true }).fill(slug);
  await empresa.getByRole("combobox", { name: "País" }).click();
  await page.getByRole("option", { name: p.nombre, exact: true }).click();

  // R20: el prefijo del país elegido, delante del teléfono.
  await expect(maestro.getByTestId("prefijo-telefonico")).toHaveText(`+${p.prefijo}`);

  // R20: exactamente los tipos activos del país, por su nombre.
  await maestro.getByRole("combobox", { name: "Tipo de documento" }).click();
  const opciones = page.getByRole("listbox").getByRole("option");
  await expect(opciones).toHaveCount(1);
  await expect(opciones.first()).toHaveText(NOMBRE_DEL_TIPO);
  await opciones.first().click();

  await maestro.getByLabel("Nombre", { exact: true }).fill(`Maestro E2E ${sufijo}`);
  await maestro.getByLabel("Email", { exact: true }).fill(`maestro-pais-${sufijo}@example.test`);
  await maestro.getByLabel("Teléfono", { exact: true }).fill(p.telefono);
  // Solo dígitos, entre 8 y 10: 9 dígitos del sufijo aleatorio.
  await maestro.getByLabel("Documento", { exact: true }).fill(String(parseInt(sufijo, 16) % 1_000_000_000).padStart(9, "0"));
  await form.getByRole("button", { name: "Crear empresa" }).click();

  await expect(page.getByRole("alert").filter({ hasText: AVISO_EMPRESA_CREADA })).toHaveCount(1, { timeout: 60_000 });
  const fila = page.getByRole("table").locator("tbody tr").filter({ hasText: slug });
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(p.nombre);

  // Por detrás: la empresa es de ese país y su maestro lleva el tipo creado.
  const org = await dueno!.organizacion.findUniqueOrThrow({ where: { slug }, select: { id: true, paisId: true } });
  expect(org.paisId).toBe(p.id);
  const maestroGuardado = await dueno!.usuario.findFirstOrThrow({
    where: { organizacionId: org.id },
    select: { telefono: true, tipoIdentificacion: { select: { nombre: true, paisId: true } } },
  });
  expect(maestroGuardado.tipoIdentificacion).toEqual({ nombre: NOMBRE_DEL_TIPO, paisId: p.id });
  expect(maestroGuardado.telefono).toBe(p.telefono);
});
