import { randomBytes, randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";

import { hashApiKey } from "../lib/utils/api-key-hash";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import { altaDeEmpresa, clienteDueno, prepararAcceso, sembrarDatos, type DatosSembrados, type Empresa } from "./_dos-empresas-fixture";
import { asignarPlanCustom, crearOrdenesDirectas, csvDeUnaFila, enlazarDistritoDeLaPlantilla } from "./_planes-fixture";
import { asegurarSuperadmin, conCandadoDelSuperadmin, entrarComoSuperadmin } from "./_superadmin-fixture";
import { abrirCon } from "./_escenarios/pulsar";

// SLT-121 · T5.1 (design §11; R35, con R10, R12, R13, R14, R19, R24 y R32) — la mora, de punta a punta:
//
// Siembra (dueño): una empresa con su maestro, un `admin`, una tienda (`adminTienda`) y una API key cuyo secreto
// conocemos; un plan custom con 500,00 por orden, dos órdenes con cargo y su factura cerrada con el atajo SQL de
// `facturas-plataforma.spec.ts` / `pago-plataforma-confirmacion.spec.ts` (`factura_plataforma_cerrar` con el
// fin natural + 6 min). La empresa se congela llamando a `organizacion_mora_congelar` con un `ahora` dentro de la
// franja (00:30 de la plataforma) del día en que la factura ya está vencida: `vence_at` + 30 min, leído de
// `factura_plataforma_mora` con la misma gracia. ARTIFICIO ACEPTADO, el mismo que el del cierre: el reloj se
// adelanta solo para esta empresa desechable. (El design §11 pedía mover el `hasta` de la factura 8 días atrás;
// `factura_plataforma_inmutable` no deja cambiar una cerrada, ni al dueño.)
//
// Pasos:
// 1. El maestro y el admin entran con la empresa congelada (R10) y ven «Empresa congelada por falta de pago» (R24).
// 2. La tienda intenta crear una orden por la carga masiva: el lote vuelve 403 con «Empresa suspendida por falta de
//    pago.», la pantalla muestra ese mismo texto y la orden no existe (R12, R14). La tienda y no el `admin`: el
//    `admin` no tiene pantalla para crear órdenes (la carga masiva es solo de `adminTienda`, `app/(app)/ordenes/page.tsx`).
// 3. Con la key de la empresa, `POST /api/ordenes/api-key/carga` → 403 con el cuerpo exacto de R13 y sin orden, y
//    `GET /api/ordenes/api-key` → 200.
// 4. El maestro registra el pago a la plataforma del total desde la wallet (R11).
// 5. El superadmin lo confirma en el detalle de la empresa. «Plazo de pago y mora» pasa de «Congelada» a «Al día» y
//    su historial trae la fila «Descongeló la operación por un pago» (R19, R30, R32).
// 6. El maestro y el admin ya no ven el banner, y la tienda crea la orden por la carga masiva.
//
// La PWA del mensajero no se recorre (design §11). R18 lo cubre `dos-empresas-humo.spec.ts`, que se corre aparte.
// Los textos esperados van escritos a mano (SL-45 §12.3). Corre en el proyecto `dinero`, en serie (`workers: 1`);
// usa el superadmin de prueba con su candado.

test.describe.configure({ mode: "serial" });

const TEXTO = {
  /** R24: el banner de la empresa congelada (`MORA_TEXTOS.banner.congelada`). */
  bannerCongelada:
    "Empresa congelada por falta de pago. Puedes ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet.",
  /** R13, R14: el mensaje exacto de la API y de la carga masiva. */
  suspendida: "Empresa suspendida por falta de pago.",
  boton: "Registrar pago a la plataforma",
  concepto: "Pago a la plataforma",
  pagosPorConfirmar: "Pagos por confirmar",
  confirmar: "Confirmar…",
  confirmarPago: "Confirmar pago",
  vacio: "No hay pagos por confirmar",
  seccionMora: "Plazo de pago y mora",
  historialMora: "Historial de la mora",
  alDia: "Al día",
  descongeladaPorPago: "Descongeló la operación por un pago",
} as const;

/** La gracia que se pasa a las funciones de la base en la siembra (la global por defecto). */
const GRACIA_SIEMBRA = 7;

interface Factura {
  id: string;
  numero: number;
  total: Prisma.Decimal;
}

let dueno: PrismaClient | undefined;
let empresa: Empresa | undefined;
let datos: DatosSembrados | undefined;
let factura: Factura | undefined;
let clave = "";
let base = "";
const sesiones: { admin?: Cookie[]; tienda?: Cookie[] } = {};
let contextoM: BrowserContext | undefined;
let paginaM: Page | undefined;
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;

function db(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function e(): Empresa {
  if (!empresa) throw new Error("no hay alta de la empresa: falló el beforeAll");
  return empresa;
}

function d(): DatosSembrados {
  if (!datos) throw new Error("no hay datos sembrados: falló el beforeAll");
  return datos;
}

function f(): Factura {
  if (!factura) throw new Error("no hay factura cerrada: falló el beforeAll");
  return factura;
}

function comoEmpresaE2E(em: Empresa): EmpresaE2E {
  return {
    organizacionId: em.organizacionId,
    maestro: { id: em.maestroId, email: em.email, password: em.password, nombre: `Maestro ${em.letra}` },
    slug: em.slug,
  };
}

/**
 * Cierra la factura en curso de la empresa como dueño y devuelve la cerrada (el atajo de
 * `pago-plataforma-confirmacion.spec.ts`): un cierre con la hora de la base la abre o la alinea; luego se cierra con
 * su fin natural + 6 minutos. Lanza si no cerró exactamente una.
 */
async function cerrarFacturaEnCurso(organizacionId: string): Promise<Factura> {
  await db().$queryRaw`SELECT factura_plataforma_cerrar(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp)`;
  const enCurso = await db().facturaPlataforma.findFirst({
    where: { organizacionId, estado: "en_curso" },
    select: { id: true },
  });
  if (enCurso === null) throw new Error(`SLT-121 E2E: la empresa ${organizacionId} no tiene factura en curso`);
  const [{ n }] = await db().$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."id" = ${enCurso.id}`;
  if (n !== 1) throw new Error(`SLT-121 E2E: el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
  const cerrada = await db().facturaPlataforma.findUniqueOrThrow({
    where: { id: enCurso.id },
    select: { id: true, estado: true, numero: true, total: true },
  });
  if (cerrada.estado !== "cerrada" || cerrada.numero === null || cerrada.total === null) {
    throw new Error(`SLT-121 E2E: la factura ${cerrada.id} no quedó cerrada: ${JSON.stringify(cerrada)}`);
  }
  return { id: cerrada.id, numero: cerrada.numero, total: cerrada.total };
}

/**
 * Congela la empresa como lo hace la corrida de madrugada: `organizacion_mora_congelar` con un `ahora` a las 00:30
 * de la plataforma del día en que su factura vence (`vence_at` son las 00:00 de ese día). Devuelve el JSON.
 */
async function congelarEnLaMadrugada(organizacionId: string): Promise<Record<string, unknown>> {
  const [{ r }] = await db().$queryRaw<{ r: Record<string, unknown> }[]>`
    SELECT organizacion_mora_congelar(${organizacionId}, m."vence_at" + interval '30 minutes', ${GRACIA_SIEMBRA}::int) AS r
      FROM factura_plataforma_mora(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp, ${GRACIA_SIEMBRA}::int) m
     ORDER BY m."vence_at" DESC
     LIMIT 1`;
  return r;
}

/** Fija el secreto de la API key sembrada (la técnica de `guia-api-ejemplos-ejecutables.spec.ts`). */
async function fijarClave(organizacionId: string, identificador: string): Promise<string> {
  const secreto = `svl_${randomBytes(32).toString("base64url")}`;
  const n = await db().$transaction(async (tx) => {
    await fijarEmpresa(tx, organizacionId);
    return tx.apiKey.updateMany({
      where: { identificador },
      data: { keyHash: hashApiKey(secreto), keyPrefix: secreto.slice(0, 12) },
    });
  });
  if (n.count !== 1) throw new Error("SLT-121 E2E: no se pudo fijar el secreto de la API key");
  return secreto;
}

async function congeladaAt(organizacionId: string): Promise<Date | null> {
  const o = await db().organizacion.findUniqueOrThrow({ where: { id: organizacionId }, select: { congeladaAt: true } });
  return o.congeladaAt;
}

async function ordenesConRemision(numRemision: string): Promise<string[]> {
  const filas = await db().orden.findMany({ where: { numRemision }, select: { organizacionId: true } });
  return filas.map((o) => o.organizacionId);
}

async function ordenesDeLaEmpresa(): Promise<number> {
  return db().orden.count({ where: { organizacionId: e().organizacionId } });
}

async function entrarComoMaestro(ctx: BrowserContext, em: Empresa): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill('input[type="email"]', em.email);
  await page.fill('input[type="password"]', em.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  return page;
}

test.beforeAll(async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  if (!baseURL) throw new Error("SLT-121 E2E: falta baseURL en playwright.config.ts");
  base = baseURL.replace(/\/$/, "");
  dueno = clienteDueno();
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  // Todo lo que escribe la app (altas de usuarios, la clave, el plan) va ANTES de congelar.
  empresa = (await altaDeEmpresa("A", `slt121-maestro-${randomUUID().slice(0, 8)}@example.test`)).empresa;
  await prepararAcceso(db(), e(), userAgent);
  datos = await sembrarDatos(db(), e());
  clave = await fijarClave(e().organizacionId, d().marcadores.apiKey);
  const conZona = { organizacionId: e().organizacionId, tiendaId: d().tiendaId, zonaId: d().zonaId };
  await enlazarDistritoDeLaPlantilla(db(), conZona);
  const admin = await crearUsuarioE2E(comoEmpresaE2E(e()), "admin");
  const tienda = await crearUsuarioE2E(comoEmpresaE2E(e()), "adminTienda");

  await asignarPlanCustom(db(), e().organizacionId, "500.00");
  const ordenes = await crearOrdenesDirectas(db(), conZona, 2);
  const cargos = await db().cobroPlataformaMovimiento.findMany({
    where: { ordenId: { in: ordenes }, tipo: "cargo" },
    select: { monto: true },
  });
  // Control de no vacuidad: las dos órdenes llevan su cargo y la factura tiene saldo.
  expect(cargos.map((c) => c.monto.toFixed(2))).toEqual(["500.00", "500.00"]);
  factura = await cerrarFacturaEnCurso(e().organizacionId);
  expect(f().total.greaterThan(0), `el total ${f().total.toFixed(2)} debe pasar de 0`).toBe(true);

  // R7, R35 (1): la empresa con la factura vencida se congela.
  const r = await congelarEnLaMadrugada(e().organizacionId);
  expect(r.resultado, `la siembra no congeló: ${JSON.stringify(r)}`).toBe("congelada");
  expect(await congeladaAt(e().organizacionId)).not.toBeNull();
  console.log(`MEDIDO factura N.º ${f().numero}: total=${f().total.toFixed(2)}; congelar → ${JSON.stringify(r)}`);

  // R10: con la empresa congelada, todos entran por el /login real.
  contextoM = await browser.newContext({ userAgent });
  paginaM = await entrarComoMaestro(contextoM, e());
  sesiones.admin = await sesionDe(browser, admin);
  sesiones.tienda = await sesionDe(browser, tienda);

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await entrarComoSuperadmin(sa!, db());
  });
});

test.afterAll(async () => {
  await contextoSa?.close();
  await contextoM?.close();
  await dueno?.$disconnect();
});

/* -------------------------------------------------------------------------- */
/* Ayudas de pantalla                                                          */
/* -------------------------------------------------------------------------- */

/** El banner de la mora (el `role="alert"` del anunciador de rutas de Next no lleva este texto). */
function bannerCongelada(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: TEXTO.bannerCongelada });
}

/** Abre `ruta` con la sesión dada en un contexto nuevo. */
async function paginaCon(
  browser: Browser,
  sesion: Cookie[] | undefined,
  ruta: string,
): Promise<{ page: Page; ctx: BrowserContext }> {
  expect(sesion?.length ?? 0, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
  const ctx = await browser.newContext();
  await ctx.addCookies(sesion ?? []);
  const page = await ctx.newPage();
  const r = await page.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  expect(r?.status(), `${ruta}: estado HTTP`).toBeLessThan(400);
  return { page, ctx };
}

/** Abre la carga masiva de `/ordenes` y sube el `.csv` de una fila (el molde de `dos-empresas-humo.spec.ts`). */
async function subirUnaFila(page: Page, numRemision: string): Promise<Locator> {
  const r = await page.goto("/ordenes", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status(), "/ordenes: estado HTTP").toBeLessThan(400);
  await page.getByRole("button", { name: "Carga masiva", exact: true }).click({ timeout: 60_000 });
  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[type="file"]').setInputFiles({
    name: `carga-${numRemision}.csv`,
    mimeType: "text/csv",
    buffer: csvDeUnaFila(numRemision),
  });
  return dialogo;
}

function tarjetaCaja(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-bolsillo="empresa"]') });
}

function regionDeuda(page: Page): Locator {
  return tarjetaCaja(page).locator('[data-region="deuda_plataforma"]');
}

function seccionMora(page: Page): Locator {
  return page.getByRole("region", { name: TEXTO.seccionMora, exact: true });
}

async function llamarApi(metodo: string, ruta: string, cuerpo?: unknown): Promise<{ status: number; json: unknown; texto: string }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${clave}` };
  if (cuerpo !== undefined) headers["Content-Type"] = "application/json";
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  return { status: r.status, json, texto };
}

/* -------------------------------------------------------------------------- */
/* Congelada                                                                   */
/* -------------------------------------------------------------------------- */

test("1. con la empresa congelada, el maestro y el admin entran y ven «Empresa congelada por falta de pago» (R10, R24, R35)", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = paginaM!;
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(bannerCongelada(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(bannerCongelada(page)).toHaveText(TEXTO.bannerCongelada);

  const { page: paginaA, ctx } = await paginaCon(browser, sesiones.admin, "/ordenes");
  try {
    await expect(bannerCongelada(paginaA)).toHaveCount(1, { timeout: 60_000 });
  } finally {
    await ctx.close();
  }
});

test("2. la tienda intenta crear una orden por la carga masiva: 403 «Empresa suspendida…», el mismo texto en pantalla y ninguna orden (R12, R14, R35)", async ({ browser }) => {
  test.setTimeout(300_000);
  const rem = `SLT121-C-${randomBytes(5).toString("hex")}`;
  const antes = await ordenesDeLaEmpresa();
  const ctx = await browser.newContext();
  await ctx.addCookies(sesiones.tienda ?? []);
  const page = await ctx.newPage();
  try {
    const respuestaChunk = page.waitForResponse((resp) => resp.url().includes("/api/ordenes/carga-masiva/chunk"), {
      timeout: 120_000,
    });
    const dialogo = await subirUnaFila(page, rem);
    const chunk = await respuestaChunk;
    expect(chunk.status()).toBe(403);
    const cuerpo = (await chunk.json()) as { message?: string; details?: { codigo?: string } };
    expect(cuerpo.message).toBe(TEXTO.suspendida);
    expect(cuerpo.details?.codigo).toBe("empresa_congelada");

    const error = dialogo.getByRole("alert");
    await expect(error).toBeVisible({ timeout: 60_000 });
    // R14: la pantalla pinta el texto exacto de la API, no el genérico «estado 403».
    await expect(error).toHaveText(TEXTO.suspendida);
    await expect(dialogo.getByRole("button", { name: /^Confirmar y cargar/ })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
  expect(await ordenesConRemision(rem)).toEqual([]);
  expect(await ordenesDeLaEmpresa()).toBe(antes);
});

test("3. la API por key responde 403 con el cuerpo de R13 a una carga, sin orden, y 200 a una consulta (R13, R35)", async () => {
  test.setTimeout(120_000);
  const rem = `SLT121-API-${randomBytes(5).toString("hex")}`;
  const antes = await ordenesDeLaEmpresa();
  const carga = await llamarApi("POST", "/api/ordenes/api-key/carga", {
    ordenes: [
      {
        num_remision: rem,
        destinatario: "Ana",
        telefono: "88881234",
        provincia: "San José",
        canton: "San José",
        distrito: "Carmen",
        producto: "Caja",
      },
    ],
  });
  expect(carga.status, carga.texto).toBe(403);
  expect(carga.json).toEqual({
    status: "error",
    code: "FORBIDDEN",
    message: TEXTO.suspendida,
    details: { codigo: "empresa_congelada" },
  });
  expect(await ordenesConRemision(rem)).toEqual([]);
  expect(await ordenesDeLaEmpresa()).toBe(antes);

  const consulta = await llamarApi("GET", "/api/ordenes/api-key");
  expect(consulta.status, consulta.texto).toBe(200);
});

/* -------------------------------------------------------------------------- */
/* El pago y su confirmación                                                   */
/* -------------------------------------------------------------------------- */

test("4. el maestro registra el pago a la plataforma del total desde la wallet (R11, R35)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(tarjetaCaja(page)).toHaveCount(1, { timeout: 60_000 });

  const dialog = page.getByRole("dialog");
  await abrirCon(regionDeuda(page).getByRole("button", { name: TEXTO.boton, exact: true }), dialog);
  await expect(dialog.getByRole("radio", { name: TEXTO.concepto })).toBeChecked();
  const monto = f().total.toFixed(2);
  await dialog.getByLabel(/^Monto/).fill(monto);
  await dialog.getByLabel(/^Referencia del pago/).fill("SLT-121 transferencia");
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  const pagos = await db().walletMovimiento.findMany({
    where: { organizacionId: e().organizacionId, categoria: "egreso_pago_plataforma" },
    select: { tipo: true, monto: true },
  });
  expect(pagos.map((p) => `${p.tipo}:${p.monto.toFixed(2)}`)).toEqual([`egreso:${monto}`]);
  // R20: un pago por confirmar no descongela.
  expect(await congeladaAt(e().organizacionId)).not.toBeNull();
});

test("5. el superadmin confirma el pago y «Plazo de pago y mora» pasa a «Al día» con la fila «descongelada por pago» (R19, R30, R32, R35)", async () => {
  test.setTimeout(240_000);
  const page = sa!;
  const r = await page.goto(`/plataforma/empresas/${e().organizacionId}`, { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  const mora = seccionMora(page);
  await expect(mora).toBeVisible({ timeout: 60_000 });
  await expect(mora.locator("[data-estado-mora]")).toHaveAttribute("data-estado-mora", "congelada");

  const seccion = page.getByRole("region", { name: TEXTO.pagosPorConfirmar, exact: true });
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  const filas = seccion.locator("tbody tr");
  await expect(filas).toHaveCount(1);
  const dialogo = page.getByRole("dialog");
  await abrirCon(filas.first().getByRole("button", { name: TEXTO.confirmar, exact: true }), dialogo);
  await expect(dialogo.getByLabel(`Aplicar · N.º ${f().numero}`, { exact: true })).toHaveValue(f().total.toFixed(2));
  const confirmar = dialogo.getByRole("button", { name: TEXTO.confirmarPago, exact: true });
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
  await expect(seccion).toContainText(TEXTO.vacio, { timeout: 30_000 });

  // R19: descongelada en la misma transacción que la confirmación.
  expect(await congeladaAt(e().organizacionId)).toBeNull();

  // Releída la página: «Al día» y la fila del historial.
  await page.reload({ waitUntil: "load", timeout: 180_000 });
  const moraTras = seccionMora(page);
  await expect(moraTras).toBeVisible({ timeout: 60_000 });
  const estado = moraTras.locator("[data-estado-mora]");
  await expect(estado).toHaveAttribute("data-estado-mora", "al_dia");
  await expect(estado).toHaveText(TEXTO.alDia);
  const historial = moraTras.getByRole("table", { name: TEXTO.historialMora, exact: true });
  await expect(historial.locator("tbody tr").filter({ hasText: TEXTO.descongeladaPorPago })).toHaveCount(1);
});

/* -------------------------------------------------------------------------- */
/* Descongelada                                                                */
/* -------------------------------------------------------------------------- */

test("6. sin banner para el maestro ni el admin, y la tienda vuelve a crear la orden por la carga masiva (R24, R35)", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = paginaM!;
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(tarjetaCaja(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(bannerCongelada(page)).toHaveCount(0);

  const { page: paginaA, ctx: ctxA } = await paginaCon(browser, sesiones.admin, "/ordenes");
  try {
    await expect(paginaA.getByRole("button", { name: "Carga masiva", exact: true })).toHaveCount(0);
    await expect(bannerCongelada(paginaA)).toHaveCount(0);
  } finally {
    await ctxA.close();
  }

  const rem = `SLT121-OK-${randomBytes(5).toString("hex")}`;
  const ctx = await browser.newContext();
  await ctx.addCookies(sesiones.tienda ?? []);
  const paginaT = await ctx.newPage();
  const errores5xx: number[] = [];
  paginaT.on("response", (resp) => {
    if (resp.status() >= 500) errores5xx.push(resp.status());
  });
  try {
    const dialogo = await subirUnaFila(paginaT, rem);
    const confirmar = dialogo.getByRole("button", { name: /^Confirmar y cargar/ });
    await expect(confirmar, "la vista previa no llegó").toHaveText("Confirmar y cargar 1 nueva", { timeout: 120_000 });
    await confirmar.click();
    await expect(dialogo.getByText(rem).first(), "el resumen no muestra la remisión creada").toBeVisible({
      timeout: 120_000,
    });
  } finally {
    await ctx.close();
  }
  expect(await ordenesConRemision(rem)).toEqual([e().organizacionId]);
  expect(errores5xx).toEqual([]);
});
