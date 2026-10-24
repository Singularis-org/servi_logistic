import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { clienteDueno, LogDelServidor } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  codigoEnviadoA,
  conCandadoDelSuperadmin,
  enlaceEnviadoA,
  enlacesDelMenu,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SL-32 T17 — dos empresas desde la pantalla «Empresas» (R29–R35, R37).
 *
 * 1. Con el superadmin de T9 (el mismo setup: el índice permite uno solo), abre «Empresas» y ve el
 *    estado vacío.
 * 2. Crea la empresa A y la B desde el formulario, con slugs, emails y documentos aleatorios. Las
 *    dos aparecen en el listado con su maestro.
 * 3. Repetir el slug de A, el email de su maestro y su documento muestra cada error junto a su
 *    campo, y el listado sigue con dos empresas.
 * 4. Un slug inválido muestra el error sin crear nada.
 * 5. SL-41 T12: el maestro de A crea su contraseña con el enlace de bienvenida, leído de la línea
 *    de depuración del emisor de consola. Un segundo uso del enlace muestra el genérico (R18, R19,
 *    R21). El de B entra por «¿Olvidaste tu contraseña?» con el código, que sigue vivo (SL-32 R38).
 *    Los dos entran después por `/login` con OTP. «Empresas» les da 404 (R35).
 * 6. Ningún maestro ve el ítem «Empresas».
 * 7. SL-41 (R38): con los dos maestros ya con contraseña, ninguna fila lleva «Reenviar bienvenida».
 *
 * Los textos que se afirman son los literales de la propuesta aprobada de T12 (`design.md`).
 *
 * CÓMO SE CORRE: igual que `superadmin-arranque.spec.ts` (base local desechable y SIN empresas,
 * sin `SMTP_*`, y el dev server con su log en `SL17_HUMO_LOG_SERVIDOR`). SL-41: el dev server
 * necesita además `NEXT_PUBLIC_APP_URL`; sin ella no hay enlace (R40) y el paso 2 falla al leerlo.
 * Al terminar borra lo que creó, para que la corrida siguiente vuelva a ver el estado vacío.
 */

test.describe.configure({ mode: "serial" });

const TEXTO = {
  // SL-41 (R26): sin `SMTP_*` la bienvenida sale por consola, así que la action dice `sin_correo`.
  avisoNoEnviada:
    "Empresa creada, pero el correo de bienvenida no salió. Reenvíalo con «Reenviar bienvenida» en la fila de la empresa.",
  avisoSinCorreo: "El correo no está configurado en este entorno.",
  reenviar: "Reenviar bienvenida",
  creaTuContrasena: "Crea tu contraseña",
  enlaceInvalido: "El enlace no es válido o ya venció.",
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
/** SL-41: el valor de `#enlace=` de la bienvenida de cada alta, leído del log en el paso 2. */
const enlaces: Partial<Record<Letra, string>> = {};
/** Todo slug que esta corrida pudo crear, para borrarlo al final aunque un paso falle a medias. */
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
  if ((await dueno.organizacion.count()) > 0) {
    throw new Error("SL-32 T17: la base ya tiene empresas y el paso 1 exige el estado vacío. Usa una base desechable.");
  }
  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(dueno!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(superadmin(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
  await superadmin().waitForURL("**/plataforma/empresas", { timeout: 60_000 });
});

test.afterAll(async () => {
  await contextoSa?.close();
  if (dueno && slugsIntentados.size > 0) {
    // La base es desechable, pero el paso 1 de la corrida siguiente necesita volver a verla vacía.
    const ids = (
      await dueno.organizacion.findMany({ where: { slug: { in: [...slugsIntentados] } }, select: { id: true } })
    ).map((o) => o.id);
    await dueno.usuarioPreferencia.deleteMany({ where: { organizacionId: { in: ids } } });
    // Lo que deja el acceso de los pasos 5-6; sus FK a `usuario` no son en cascada.
    const deMaestros = { usuario: { organizacionId: { in: ids } } };
    await dueno.loginAttempt.deleteMany({ where: deMaestros });
    await dueno.trustedDevice.deleteMany({ where: deMaestros });
    await dueno.emailOtpChallenge.deleteMany({ where: deMaestros });
    await dueno.usuario.deleteMany({ where: { organizacionId: { in: ids } } });
    await dueno.premioRanking.deleteMany({ where: { organizacionId: { in: ids } } });
    await dueno.organizacion.deleteMany({ where: { id: { in: ids } } });
  }
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

/** Cualquier aviso del alta: el de éxito o la advertencia de SL-41 empiezan igual. */
function avisoDeAlta(page: Page) {
  return page.getByText(/^Empresa creada/);
}

/** Las filas del cuerpo del listado (sin la cabecera). */
function filasDelListado(page: Page) {
  return page.getByRole("table").locator("tbody tr");
}

async function esperarErrorEn(campo: ReturnType<typeof formulario>[keyof ReturnType<typeof formulario>], texto: string) {
  await expect(campo).toHaveAttribute("aria-invalid", "true");
  await expect(campo).toHaveAccessibleDescription(new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

/* -------------------------------------------------------------------------- */
/* Pasos 1-4: el superadmin                                                    */
/* -------------------------------------------------------------------------- */

test("1. «Empresas» abre en el estado vacío (R29)", async () => {
  const page = superadmin();
  await page.goto("/plataforma/empresas");
  await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
  await expect(page.getByText(TEXTO.vacio, { exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(avisoDeAlta(page)).toHaveCount(0);
});

test("2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29)", async () => {
  test.setTimeout(120_000);
  const page = superadmin();
  for (const letra of ["A", "B"] as const) {
    const d = datosNuevos(letra);
    // El log se abre ANTES del alta: solo cuenta lo que el servidor escriba desde aquí.
    const log = LogDelServidor.desdeEntorno();
    await enviarAlta(page, d);
    const aviso = page.getByRole("alert").filter({ hasText: TEXTO.avisoNoEnviada });
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText(TEXTO.avisoSinCorreo);
    altas[letra] = d;
    enlaces[letra] = await enlaceEnviadoA(log, d.email);

    const fila = filasDelListado(page).filter({ hasText: d.slug });
    await expect(fila).toHaveCount(1);
    await expect(fila).toContainText(d.nombre);
    await expect(fila.getByRole("listitem")).toHaveText(`${d.maestroNombre} · ${d.email}`);
    // R29/R38: el maestro aún no tiene contraseña propia, así que la fila ofrece el reenvío.
    await expect(fila.getByRole("button", { name: TEXTO.reenviar })).toBeVisible();
    // Tras el éxito el formulario queda vacío para la siguiente (propuesta de T12).
    await expect(formulario(page).slug).toHaveValue("");
  }
  await expect(filasDelListado(page)).toHaveCount(2);
  await expect(page.getByText(TEXTO.vacio)).toHaveCount(0);

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
    await expect(avisoDeAlta(page)).toHaveCount(0);
    await page.reload();
    await expect(filasDelListado(page)).toHaveCount(2);
  }
  expect(await dueno!.organizacion.count()).toBe(2);
});

test("4. un slug inválido marca el campo sin crear nada (R34)", async () => {
  const page = superadmin();
  await page.reload();
  const d = { ...datosNuevos("D"), slug: "Slug Con Espacios" };
  await enviarAlta(page, d);
  await esperarErrorEn(formulario(page).slug, TEXTO.errorCampo);
  await expect(avisoDeAlta(page)).toHaveCount(0);
  await page.reload();
  await expect(filasDelListado(page)).toHaveCount(2);
  expect(await dueno!.organizacion.count()).toBe(2);
  expect(await dueno!.usuario.count({ where: { email: d.email } })).toBe(0);
});

/* -------------------------------------------------------------------------- */
/* Pasos 5-6: cada maestro                                                     */
/* -------------------------------------------------------------------------- */

function enlace(letra: Letra): string {
  const e = enlaces[letra];
  if (!e) throw new Error(`no hay enlace de bienvenida de ${letra}: falló el paso 2`);
  return e;
}

/** Abre el enlace de bienvenida y rellena «Crea tu contraseña» con `password`. */
async function usarEnlace(page: Page, letra: Letra, password: string): Promise<void> {
  // Desde otra ruta: un `goto` que solo cambia el fragmento no vuelve a montar el formulario.
  await page.goto("/login");
  await page.goto(`/recuperar-contrasena#enlace=${enlace(letra)}`);
  await expect(page.getByRole("heading", { name: TEXTO.creaTuContrasena })).toBeVisible({ timeout: 60_000 });
  // R21: el secreto ya no está en la barra.
  expect(new URL(page.url()).hash).toBe("");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(password);
  await page.getByLabel("Confirmar contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Crear contraseña" }).click();
}

/** SL-41 (R18, R19): A crea la contraseña con el enlace, y el enlace ya usado no vale. */
async function contrasenaPorEnlace(page: Page, password: string): Promise<void> {
  await usarEnlace(page, "A", password);
  await expect(page.getByText("Contraseña creada")).toBeVisible({ timeout: 60_000 });

  await usarEnlace(page, "A", `Bb2!${randomBytes(12).toString("base64url")}`);
  // Filtrado: el anunciador de rutas de Next también es un `role="alert"`.
  await expect(page.getByRole("alert").filter({ hasText: TEXTO.enlaceInvalido })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Pedir un código por correo" })).toBeVisible();
}

/** SL-32 (R38): B la crea por «¿Olvidaste tu contraseña?» con el código del emisor de consola. */
async function contrasenaPorCodigo(page: Page, d: DatosDeAlta, password: string): Promise<void> {
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
}

for (const letra of ["A", "B"] as const) {
  const via = letra === "A" ? "el enlace de bienvenida" : "«¿Olvidaste tu contraseña?»";
  test(`5-6. el maestro de ${letra} crea su contraseña con ${via}, «Empresas» le da 404 y no la ve (R18, R19, R35)`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const d = alta(letra);
    const password = `Aa1!${randomBytes(12).toString("base64url")}`;

    if (letra === "A") {
      await contrasenaPorEnlace(page, password);
    } else {
      await contrasenaPorCodigo(page, d, password);
    }

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

test("7. con las dos contraseñas creadas, ninguna fila ofrece «Reenviar bienvenida» (R38)", async () => {
  const page = superadmin();
  await page.goto("/plataforma/empresas");
  await expect(filasDelListado(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: TEXTO.reenviar })).toHaveCount(0);
});
