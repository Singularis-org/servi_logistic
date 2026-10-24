import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { clienteDueno, LogDelServidor } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  codigoEnviadoA,
  conCandadoDelSuperadmin,
  enlacesDelMenu,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SL-32 T17 — dos empresas desde la pantalla «Empresas» (R29–R35, R37).
 *
 * 1. Con el superadmin de T9 (el mismo setup: el índice permite uno solo), abre «Empresas» con su
 *    formulario y sin aviso.
 * 2. Crea la empresa A y la B desde el formulario, con slugs, emails y documentos aleatorios. Las
 *    dos aparecen en el listado con su maestro.
 * 3. Repetir el slug de A, el email de su maestro y su documento muestra cada error junto a su
 *    campo, y de lo que intentó esta corrida solo existen A y B.
 * 4. Un slug inválido muestra el error sin crear nada.
 * 5. Cada maestro entra por «¿Olvidaste tu contraseña?» con el código del emisor de consola, y
 *    después por `/login` con OTP. «Empresas» le da 404 (R35).
 * 6. Ningún maestro ve el ítem «Empresas».
 *
 * Los textos que se afirman son los literales de la propuesta aprobada de T12 (`design.md`).
 *
 * CÓMO SE CORRE: igual que `superadmin-arranque.spec.ts` (base local desechable, y el servidor de
 * Playwright con su log en `E2E_LOG_SERVIDOR`).
 *
 * La base puede traer empresas de otras corridas (SL-44 A1: datos únicos por corrida, sin borrar,
 * y dos corridas seguidas en verde, R27). Por eso el listado se comprueba por los slugs de ESTA
 * corrida y nunca por un recuento total, y no se afirma el estado vacío: su texto y la ausencia de
 * la tabla los cubre `tests/components/empresas-module.test.tsx` («sin empresas pinta el estado
 * vacío y no la tabla»). Nada se borra al terminar.
 */

test.describe.configure({ mode: "serial" });

const TEXTO = {
  aviso: "Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?» y su email.",
  vacio: "Aún no hay empresas. Crea la primera con el formulario.",
  errorSlug: "Ya hay una empresa con ese slug.",
  errorEmail: "Ese email ya pertenece a otro usuario.",
  errorDocumento: "Ese documento ya pertenece a otro usuario.",
  errorCampo: "Revisa este campo.",
} as const;

type Letra = "A" | "B";

interface DatosDeAlta {
  nombre: string;
  slug: string;
  maestroNombre: string;
  email: string;
  telefono: string;
  documento: string;
}

function aleatorio(): string {
  return randomBytes(5).toString("hex");
}

function datosNuevos(letra: string): DatosDeAlta {
  const s = aleatorio();
  return {
    nombre: `Empresa E2E ${letra} ${s}`,
    slug: `e2e-${letra.toLowerCase()}-${s}`,
    maestroNombre: `Maestro ${letra} ${s}`,
    email: `maestro-${letra.toLowerCase()}-${s}@example.test`,
    telefono: "88880000",
    documento: `e2e-${letra.toLowerCase()}-${s}`,
  };
}

let dueno: PrismaClient | null = null;
let contextoSa: BrowserContext | null = null;
let sa: Page | null = null;
const altas: Partial<Record<Letra, DatosDeAlta>> = {};
/** Todo slug que esta corrida mandó al formulario: de ellos, solo A y B deben existir. */
const slugsIntentados = new Set<string>();

function superadmin(): Page {
  if (!sa) throw new Error("no hay página del superadmin: falló el beforeAll");
  return sa;
}

function alta(letra: Letra): DatosDeAlta {
  const d = altas[letra];
  if (!d) throw new Error(`no hay alta de ${letra}: falló el paso 2`);
  return d;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  dueno = clienteDueno();
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
  // Sin borrado: lo creado lleva sufijo aleatorio y la corrida siguiente no lo busca (A1).
  await contextoSa?.close();
  await dueno?.$disconnect();
});

/* -------------------------------------------------------------------------- */
/* El formulario                                                               */
/* -------------------------------------------------------------------------- */

function formulario(page: Page) {
  const form = page.getByRole("form", { name: "Crear empresa" });
  const empresa = form.getByRole("group", { name: "Empresa", exact: true });
  const maestro = form.getByRole("group", { name: "Primer maestro", exact: true });
  return {
    form,
    nombre: empresa.getByLabel("Nombre", { exact: true }),
    slug: empresa.getByLabel("Slug", { exact: true }),
    maestroNombre: maestro.getByLabel("Nombre", { exact: true }),
    email: maestro.getByLabel("Email", { exact: true }),
    telefono: maestro.getByLabel("Teléfono", { exact: true }),
    tipo: maestro.getByRole("combobox", { name: "Tipo de documento" }),
    documento: maestro.getByLabel("Documento", { exact: true }),
    boton: form.getByRole("button", { name: "Crear empresa" }),
  };
}

async function enviarAlta(page: Page, d: DatosDeAlta): Promise<void> {
  slugsIntentados.add(d.slug);
  const f = formulario(page);
  await f.nombre.fill(d.nombre);
  await f.slug.fill(d.slug);
  await f.maestroNombre.fill(d.maestroNombre);
  await f.email.fill(d.email);
  await f.telefono.fill(d.telefono);
  await f.tipo.click();
  await page.getByRole("option", { name: "cedula", exact: true }).click();
  await f.documento.fill(d.documento);
  await f.boton.click();
}

/** Las filas del cuerpo del listado (sin la cabecera). */
function filasDelListado(page: Page) {
  return page.getByRole("table").locator("tbody tr");
}

/**
 * De todo lo que esta corrida mandó al formulario, el listado y la base tienen A y B, una fila cada
 * una, y nada más. Las empresas de otras corridas no cuentan.
 */
async function soloExistenAyB(page: Page): Promise<void> {
  const creadas = new Set([alta("A").slug, alta("B").slug]);
  for (const slug of slugsIntentados) {
    await expect(filasDelListado(page).filter({ hasText: slug })).toHaveCount(creadas.has(slug) ? 1 : 0);
  }
  const enBase = await dueno!.organizacion.findMany({ where: { slug: { in: [...slugsIntentados] } }, select: { slug: true } });
  expect(enBase.map((o) => o.slug).sort()).toEqual([...creadas].sort());
}

async function esperarErrorEn(campo: ReturnType<typeof formulario>[keyof ReturnType<typeof formulario>], texto: string) {
  await expect(campo).toHaveAttribute("aria-invalid", "true");
  await expect(campo).toHaveAccessibleDescription(new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

/* -------------------------------------------------------------------------- */
/* Pasos 1-4: el superadmin                                                    */
/* -------------------------------------------------------------------------- */

test("1. «Empresas» abre con el formulario de alta y sin aviso (R29)", async () => {
  const page = superadmin();
  await page.goto("/plataforma/empresas");
  await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
  await expect(formulario(page).boton).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29)", async () => {
  test.setTimeout(120_000);
  const page = superadmin();
  for (const letra of ["A", "B"] as const) {
    const d = datosNuevos(letra);
    await enviarAlta(page, d);
    await expect(page.getByRole("status")).toHaveText(TEXTO.aviso);
    altas[letra] = d;

    const fila = filasDelListado(page).filter({ hasText: d.slug });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText(d.nombre);
    await expect(fila.getByRole("listitem")).toHaveText(`${d.maestroNombre} · ${d.email}`);
    // Tras el éxito el formulario queda vacío para la siguiente (propuesta de T12).
    await expect(formulario(page).slug).toHaveValue("");
  }
  // Con al menos A y B en la base, el listado no puede pintar el estado vacío.
  await expect(page.getByText(TEXTO.vacio)).toHaveCount(0);
  await soloExistenAyB(page);

  const enBase = await dueno!.organizacion.findMany({
    where: { slug: { in: [alta("A").slug, alta("B").slug] } },
    select: { slug: true, usuarios: { select: { email: true, organizacionId: true, rol: { select: { value: true } } } } },
  });
  expect(enBase).toHaveLength(2);
  for (const o of enBase) {
    expect(o.usuarios).toHaveLength(1);
    expect(o.usuarios[0].rol.value).toBe("maestro");
  }
});

test("3. repetir el slug, el email o el documento de A marca su campo y no crea nada (R31, R32, R33)", async () => {
  test.setTimeout(120_000);
  const page = superadmin();
  const a = alta("A");
  const casos = [
    { repetido: { slug: a.slug }, campo: "slug", texto: TEXTO.errorSlug },
    { repetido: { email: a.email }, campo: "email", texto: TEXTO.errorEmail },
    { repetido: { documento: a.documento }, campo: "documento", texto: TEXTO.errorDocumento },
  ] as const;

  for (const caso of casos) {
    await page.reload();
    await enviarAlta(page, { ...datosNuevos("C"), ...caso.repetido });
    const f = formulario(page);
    await esperarErrorEn(f[caso.campo], caso.texto);
    await expect(page.getByText(caso.texto, { exact: true })).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.reload();
    await soloExistenAyB(page);
  }
});

test("4. un slug inválido marca el campo sin crear nada (R34)", async () => {
  const page = superadmin();
  await page.reload();
  const d = { ...datosNuevos("D"), slug: "Slug Con Espacios" };
  await enviarAlta(page, d);
  await esperarErrorEn(formulario(page).slug, TEXTO.errorCampo);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.reload();
  await soloExistenAyB(page);
  expect(await dueno!.usuario.count({ where: { email: d.email } })).toBe(0);
});

/* -------------------------------------------------------------------------- */
/* Pasos 5-6: cada maestro                                                     */
/* -------------------------------------------------------------------------- */

for (const letra of ["A", "B"] as const) {
  test(`5-6. el maestro de ${letra} entra con «¿Olvidaste tu contraseña?», «Empresas» le da 404 y no la ve (R37, R35)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const d = alta(letra);
    const password = `Aa1!${randomBytes(12).toString("base64url")}`;

    await page.goto("/login");
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
    await page.waitForURL("**/recuperar-contrasena");

    const log = LogDelServidor.desdeEntorno();
    await page.getByLabel("Correo electrónico").fill(d.email);
    await page.getByRole("button", { name: "Enviar código" }).click();
    const campoCodigo = page.getByLabel("Código de verificación");
    await expect(campoCodigo).toBeVisible({ timeout: 60_000 });
    await campoCodigo.fill(await codigoEnviadoA(log, d.email));
    await page.getByRole("button", { name: "Verificar código" }).click();

    await page.getByLabel("Nueva contraseña", { exact: true }).fill(password);
    await page.getByLabel("Confirmar contraseña", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Restablecer contraseña" }).click();
    await expect(page.getByText("Contraseña actualizada")).toBeVisible({ timeout: 60_000 });

    await entrarConOtp(page, d.email, password);
    const menu = await enlacesDelMenu(page);
    expect(menu.length).toBeGreaterThan(0);
    expect(menu).not.toContain("Empresas");

    await page.goto("/plataforma/empresas");
    await expect(page.getByRole("heading", { level: 1, name: NO_ENCONTRADO })).toBeVisible();
    await expect(page.getByRole("form", { name: "Crear empresa" })).toHaveCount(0);
    await expect(page.getByText(alta(letra === "A" ? "B" : "A").slug)).toHaveCount(0);
  });
}
