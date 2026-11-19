import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { test, expect, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";

import { money } from "../lib/config/moneda";
import { inicioDelDiaPlataforma } from "../lib/planes/ciclo";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import { fechaCalendarioCR } from "../lib/utils/fecha-cr";
import { crearEmpresaE2E, crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { fuentesDePagina, objetos, paginas, textoLegible, textosDePagina } from "../tests/unit/pdf/pdf-inspector";

import { crearZonaE2E } from "./_aislamiento-datos";
import { clienteDueno } from "./_dos-empresas-fixture";
import { crearOrdenesDirectas, crearPlanPublicoConCosto } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-119 T7.1 (R19; design §9) — el E2E diferido de SLT-118: las facturas de la plataforma en el navegador.
 *
 * 1. Datos (dueño): una empresa nueva con su maestro, un `admin`, una zona y una tienda. Un plan público con costo
 *    base 1 000 mensual y 300,00 por orden (`crearPlanPublicoConCosto`), asignado desde hoy con
 *    `PlanesRepository.asignar` (como `mi-plan-cambiar-plan.spec.ts`). Dos órdenes por detrás con la empresa fijada
 *    y una de ellas eliminada: los triggers escriben dos cargos y un reverso (como `cobro-plataforma-sl40.spec.ts`).
 * 2. En curso: el maestro abre «Mi plan» y ve la fila «En curso» con órdenes «₡300» (300 + 300 − 300); en su
 *    detalle, tres líneas con las guías de las dos órdenes: dos «Cargo» de «₡300» y un «Reverso» de «-₡300».
 * 3. Cierre: el dueño llama `factura_plataforma_cerrar(org, fin_natural_at + 6 min)` con el `fin_natural_at` de la
 *    en curso. ARTIFICIO ACEPTADO (design §9): el reloj se adelanta solo para esta empresa desechable; nadie crea
 *    órdenes para ella después (caerían en un intervalo ya cerrado).
 * 4. Cerrada: el maestro recarga y ve «N.º 1», «Emitida», la cuota y el total de la fila de la base (la cuota
 *    depende del día del mes y no se escribe a mano; los importes de las órdenes sí). La nueva en curso va encima.
 * 5. Superadmin: en el detalle de la empresa elige la pestaña «Facturación» y ve la misma «N.º 1» y las mismas
 *    tres líneas.
 * 6. Admin: `/mi-plan` → 404 «no encontrado» (SLT-91), sin la sección de facturas.
 *
 * Las descargas de la factura cerrada: SLT-136 T8.1 (R33), enmendado por SLT-199 T5.2 (R25; design §10), que
 * cambia el Excel por el anexo de movimientos en PDF. Los botones son «Descargar factura» y «Descargar anexo»:
 * - en el paso 2, el detalle de la en curso no muestra ninguno de los dos;
 * - en el paso 4, el maestro descarga los dos PDF (`page.waitForEvent("download")`): `factura-1-<empresa>.pdf` y
 *   `factura-1-<empresa>-anexo.pdf`, los dos con más de 0 bytes y empezando por `%PDF`; el anexo se relee con
 *   `tests/unit/pdf/pdf-inspector.ts` (el texto con el `/ToUnicode` del propio documento): las remisiones de los
 *   tres movimientos y «Total neto (3 movimientos)»;
 * - en el paso 5, el superadmin descarga la factura desde «Facturación».
 * La campanita no se mira aquí: el cierre va por la función SQL, no por el repositorio (R21 está en integración).
 *
 * Al final archiva el plan público que creó: el catálogo es global.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test e2e/facturas-plataforma.spec.ts` (proyecto `dinero`). Base local
 * desechable, migrada y con `pnpm run db:seed`. El OTP del superadmin sale del log del servidor.
 */

test.describe.configure({ mode: "serial" });

const PANTALLA_DE_ERROR = "No pudimos cargar esta pantalla";
const TEXTO = {
  seccion: "Facturas de la empresa",
  enCurso: "En curso",
  emitida: "Emitida",
  numeroUno: "N.º 1",
  sinNumero: "—",
  lineas: "Cargos y reversos",
  cargo: "Cargo",
  reverso: "Reverso",
  pestanaFacturacion: "Facturación",
  errorLista: "No se pudieron cargar las facturas",
  errorDetalle: "No se pudo cargar la factura",
  descargarFactura: "Descargar factura",
  descargarAnexo: "Descargar anexo",
  errorDescarga: "No se pudo descargar la factura",
  totalNetoAnexo: "Total neto (3 movimientos)",
} as const;
/** Lo que pinta `money`, escrito a mano: 300 + 300 − 300 y cada línea con su signo. */
const PINTADO = { ordenes: "₡300", cargo: "₡300", reverso: "-₡300" } as const;

const sufijo = randomBytes(4).toString("hex");
const nombrePlan = `Plan E2E facturas ${sufijo}`;

let dueno: PrismaClient | null = null;
let empresa: EmpresaE2E | null = null;
let superadminId = "";
let planId = "";
/** Las guías de las dos órdenes, en texto (como las pinta la tabla). */
let guias: string[] = [];
/** SLT-136: las remisiones de las dos órdenes, en el mismo orden que `guias`. */
let remisiones: string[] = [];
/** SLT-199 R24: el nombre de la empresa en la base, para los nombres de archivo. */
let nombreEmpresa = "";
const sesiones: { maestro?: Cookie[]; admin?: Cookie[] } = {};
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;

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

  empresa = await crearEmpresaE2E("facturas");
  const admin = await crearUsuarioE2E(empresa, "admin");
  const zona = await crearZonaE2E(db(), empresa);
  const tienda = await crearUsuarioE2E(empresa, "adminTienda");
  sesiones.maestro = await sesionDe(browser, empresa.maestro);
  sesiones.admin = await sesionDe(browser, admin);

  // El superadmin de prueba es el actor del plan y el que abre el detalle de la empresa.
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));
  const fila = await db().usuario.findFirstOrThrow({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
    select: { id: true },
  });
  superadminId = fila.id;

  // Costo base 1 000 mensual (el de la fixture) y 300,00 por orden, desde las 00:00 de hoy (SLT-86 R2).
  planId = await crearPlanPublicoConCosto(db(), nombrePlan, "300.00");
  const ahora = new Date();
  const hoy = fechaCalendarioCR(ahora);
  const efecto = { clase: "inicio", fecha: hoy, desde: inicioDelDiaPlataforma(hoy), elegida: false } as const;
  const asignado = await new PlanesRepository(db()).asignar(
    laEmpresa().organizacionId,
    planId,
    superadminId,
    efecto,
    "mensual",
    ahora,
  );
  if (asignado.estado !== "ok") throw new Error(`SLT-119 T7.1: asignar el plan no lo dejó asignado: ${JSON.stringify(asignado)}`);

  // Dos órdenes (dos cargos) y una eliminada (su reverso), como dueño y con la empresa fijada: los triggers.
  const conZona = { organizacionId: laEmpresa().organizacionId, tiendaId: tienda.id, zonaId: zona.id };
  const ordenes = await crearOrdenesDirectas(db(), conZona, 2);
  await db().$transaction(async (tx) => {
    await fijarEmpresa(tx, laEmpresa().organizacionId);
    await tx.orden.update({ where: { id: ordenes[1]! }, data: { deletedAt: new Date() } });
  });
  const filas = await db().orden.findMany({
    where: { id: { in: ordenes } },
    select: { id: true, numGuia: true, numRemision: true },
  });
  guias = ordenes.map((id) => String(filas.find((f) => f.id === id)?.numGuia ?? ""));
  expect(guias.every((g) => g !== ""), "las órdenes no tienen guía").toBe(true);
  remisiones = ordenes.map((id) => filas.find((f) => f.id === id)?.numRemision ?? "");
  expect(remisiones.every((r) => r !== ""), "las órdenes no tienen remisión").toBe(true);
  const org = await db().organizacion.findUniqueOrThrow({
    where: { id: laEmpresa().organizacionId },
    select: { nombre: true },
  });
  nombreEmpresa = org.nombre;

  // El rastro que la factura debe enseñar: dos cargos y un reverso de 300,00.
  const movs = await db().cobroPlataformaMovimiento.findMany({
    where: { organizacionId: laEmpresa().organizacionId },
    select: { ordenId: true, tipo: true, monto: true },
  });
  expect(movs.map((m) => `${ordenes.indexOf(m.ordenId)}:${m.tipo}:${m.monto.toFixed(2)}`).sort()).toEqual([
    "0:cargo:300.00",
    "1:cargo:300.00",
    "1:reverso:300.00",
  ]);

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(db(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(sa!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
});

test.afterAll(async () => {
  await contextoSa?.close();
  // El catálogo es global: el plan sale del carrusel de los demás. La empresa lo conserva (R6 de SL-24).
  if (dueno && superadminId !== "" && planId !== "") await new PlanesRepository(dueno).archivar(planId, superadminId);
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

/** La sección «Facturas de la empresa» y las filas de su tabla. */
function seccionDeFacturas(page: Page): Locator {
  return page.getByRole("region", { name: TEXTO.seccion, exact: true });
}

function filas(page: Page): Locator {
  return seccionDeFacturas(page).locator("tbody tr");
}

/** El texto de cada celda de una fila, recortado. */
async function celdas(fila: Locator): Promise<string[]> {
  return (await fila.locator("td").allInnerTexts()).map((t) => t.trim());
}

/**
 * Abre el detalle de la fila y devuelve las líneas como «guía · tipo · valor», ordenadas (dos líneas pueden tener
 * el mismo instante: el orden entre ellas no es lo que se prueba aquí).
 */
async function lineasDelDetalle(page: Page, fila: Locator): Promise<{ panel: Locator; lineas: string[] }> {
  await fila.getByRole("button", { name: /^Ver detalle de la factura / }).click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const region = panel.getByRole("region", { name: TEXTO.lineas, exact: true });
  await expect(region.locator("tbody tr")).toHaveCount(3, { timeout: 60_000 });
  await expect(panel.getByText(TEXTO.errorDetalle)).toHaveCount(0);
  const lineas: string[] = [];
  for (const tr of await region.locator("tbody tr").all()) {
    const [, guia, tipo, valor] = await celdas(tr);
    lineas.push(`${guia} · ${tipo} · ${valor}`);
  }
  return { panel, lineas: lineas.sort() };
}

/**
 * SLT-199 R24, escrito aparte de `nombreArchivoFactura` para no probar la función con ella misma: el nombre de la
 * empresa en minúsculas, sin tildes y con guiones.
 */
function nombreDeArchivo(documento: "factura" | "anexo"): string {
  const slug = nombreEmpresa
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return documento === "anexo" ? `factura-1-${slug}-anexo.pdf` : `factura-1-${slug}.pdf`;
}

/** SLT-136: pulsa un botón de descarga del panel y devuelve el nombre sugerido y los bytes del archivo. */
async function descargarDesde(page: Page, panel: Locator, boton: string): Promise<{ nombre: string; bytes: Buffer }> {
  const [descarga] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    panel.getByRole("button", { name: boton, exact: true }).click(),
  ]);
  const ruta = await descarga.path();
  await expect(panel.getByText(TEXTO.errorDescarga)).toHaveCount(0);
  return { nombre: descarga.suggestedFilename(), bytes: await readFile(ruta) };
}

/** SLT-136: el PDF no está vacío y es un PDF. */
function esPdf(bytes: Buffer): void {
  expect(bytes.length).toBeGreaterThan(0);
  expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
}

/**
 * SLT-199 R25: todos los textos del PDF, página a página, leídos con la fuente que declara el propio documento (los
 * de la fuente embebida, por su `/ToUnicode`).
 */
function textosDelPdf(bytes: Buffer): string[] {
  const pdf = new Uint8Array(bytes);
  const n = paginas(objetos(pdf)).length;
  return Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(pdf, i);
    return textosDePagina(pdf, i).map((t) => textoLegible(t, fuentes.get(t.fuenteRes)));
  }).flat();
}

/** SLT-199 R25: las remisiones de los tres movimientos (la segunda orden tiene cargo y reverso), ordenadas. */
function remisionesEsperadas(): string[] {
  return [remisiones[0]!, remisiones[1]!, remisiones[1]!].sort();
}

function lineasEsperadas(): string[] {
  return [
    `${guias[0]} · ${TEXTO.cargo} · ${PINTADO.cargo}`,
    `${guias[1]} · ${TEXTO.cargo} · ${PINTADO.cargo}`,
    `${guias[1]} · ${TEXTO.reverso} · ${PINTADO.reverso}`,
  ].sort();
}

test("el maestro ve la factura en curso en «Mi plan» con su total parcial y sus tres líneas, sin descargas (R19; SLT-199 R25)", async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, ctx, estado, errores5xx } = await abrirCon(browser, sesiones.maestro, "/mi-plan");
  try {
    expect(estado).toBeLessThan(400);
    await expect(page.getByText(PANTALLA_DE_ERROR)).toHaveCount(0);
    await expect(seccionDeFacturas(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(TEXTO.errorLista)).toHaveCount(0);

    const enCurso = filas(page).filter({ hasText: TEXTO.enCurso });
    await expect(enCurso).toHaveCount(1);
    const [numero, , plan, ordenes, , , estadoFila] = await celdas(enCurso);
    expect(numero).toBe(TEXTO.sinNumero);
    expect(plan).toBe(nombrePlan);
    expect(ordenes).toBe(PINTADO.ordenes);
    expect(estadoFila).toBe(TEXTO.enCurso);

    const { panel, lineas } = await lineasDelDetalle(page, enCurso);
    expect(lineas).toEqual(lineasEsperadas());
    // SLT-199 R25: la en curso no se descarga.
    await expect(panel.getByRole("button", { name: TEXTO.descargarFactura })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: TEXTO.descargarAnexo })).toHaveCount(0);
    expect(errores5xx).toEqual([]);
  } finally {
    await ctx.close();
  }
});

/** La fila cerrada de la base, para comparar la cuota y el total sin escribirlos a mano. */
interface Cerrada {
  cuotas: string;
  total: string;
}
let cerrada: Cerrada | null = null;

test("el cierre emite la «N.º 1»: el maestro la ve «Emitida» y descarga la factura y el anexo (R19; SLT-199 R24, R25)", async ({ browser }) => {
  test.setTimeout(300_000);
  const org = laEmpresa().organizacionId;
  // ARTIFICIO ACEPTADO (design §9): el reloj del cierre, 6 minutos después del fin natural de la en curso.
  const [{ n }] = await db().$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."organizacion_id" = ${org} AND f."estado" = 'en_curso'`;
  expect(n, "el cierre no cerró ninguna factura").toBeGreaterThanOrEqual(1);

  const fila = await db().facturaPlataforma.findFirstOrThrow({
    where: { organizacionId: org, estado: "cerrada", numero: 1 },
    select: { cuota: true, primeraCuota: true, total: true, totalOrdenes: true },
  });
  expect(fila.totalOrdenes?.toFixed(2)).toBe("300.00");
  const cuotas = [fila.cuota, fila.primeraCuota].filter((c): c is Prisma.Decimal => c !== null);
  cerrada = {
    cuotas: money(cuotas.length === 0 ? null : cuotas.reduce((a, b) => a.add(b), new Prisma.Decimal(0)).toFixed(2)),
    total: money(fila.total?.toFixed(2) ?? null),
  };
  expect(await db().facturaPlataforma.count({ where: { organizacionId: org, estado: { not: "cerrada" } } })).toBe(1);

  const { page, ctx, estado, errores5xx } = await abrirCon(browser, sesiones.maestro, "/mi-plan");
  try {
    expect(estado).toBeLessThan(400);
    await expect(seccionDeFacturas(page)).toBeVisible({ timeout: 60_000 });
    await expect(filas(page)).toHaveCount(2);
    // La nueva en curso, encima; la emitida, debajo.
    expect((await celdas(filas(page).nth(0)))[6]).toBe(TEXTO.enCurso);
    const [numero, , plan, ordenes, cuotasFila, total, estadoFila] = await celdas(filas(page).nth(1));
    expect(numero).toBe(TEXTO.numeroUno);
    expect(plan).toBe(nombrePlan);
    expect(ordenes).toBe(PINTADO.ordenes);
    expect(cuotasFila).toBe(cerrada.cuotas);
    expect(total).toBe(cerrada.total);
    expect(estadoFila).toBe(TEXTO.emitida);

    const { panel, lineas } = await lineasDelDetalle(page, filas(page).nth(1));
    await expect(panel.getByRole("heading", { name: `Factura ${TEXTO.numeroUno}`, exact: true })).toBeVisible();
    expect(lineas).toEqual(lineasEsperadas());

    // SLT-199 R24, R25: el maestro descarga los dos PDF de la «N.º 1».
    const facturaPdf = await descargarDesde(page, panel, TEXTO.descargarFactura);
    expect(facturaPdf.nombre).toBe(nombreDeArchivo("factura"));
    esPdf(facturaPdf.bytes);
    const anexo = await descargarDesde(page, panel, TEXTO.descargarAnexo);
    expect(anexo.nombre).toBe(nombreDeArchivo("anexo"));
    esPdf(anexo.bytes);
    // El anexo se relee: una fila por movimiento con su remisión y el total neto de los tres.
    const textosAnexo = textosDelPdf(anexo.bytes);
    expect(textosAnexo.filter((t) => remisiones.includes(t)).sort()).toEqual(remisionesEsperadas());
    expect(textosAnexo).toContain(TEXTO.totalNetoAnexo);
    expect(errores5xx).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test("el superadmin ve la misma «N.º 1» y las mismas líneas en la pestaña «Facturación» y descarga la factura (R19, R12; SLT-199 R25)", async () => {
  test.setTimeout(240_000);
  expect(cerrada, "no hay fila cerrada: falló el test anterior").not.toBeNull();
  const page = sa!;
  const respuesta = await page.goto(`/plataforma/empresas/${laEmpresa().organizacionId}`, {
    waitUntil: "load",
    timeout: 180_000,
  });
  expect(respuesta?.status()).toBeLessThan(400);
  await expect(page.getByText(PANTALLA_DE_ERROR)).toHaveCount(0);
  const pestana = page.getByRole("tab", { name: TEXTO.pestanaFacturacion, exact: true });
  await pestana.click();
  await expect(pestana).toHaveAttribute("aria-selected", "true");
  await expect(seccionDeFacturas(page)).toBeVisible({ timeout: 60_000 });

  const emitida = filas(page).filter({ hasText: TEXTO.numeroUno });
  await expect(emitida).toHaveCount(1);
  const [numero, , plan, ordenes, cuotasFila, total, estadoFila] = await celdas(emitida);
  expect(numero).toBe(TEXTO.numeroUno);
  expect(plan).toBe(nombrePlan);
  expect(ordenes).toBe(PINTADO.ordenes);
  expect(cuotasFila).toBe(cerrada!.cuotas);
  expect(total).toBe(cerrada!.total);
  expect(estadoFila).toBe(TEXTO.emitida);

  const { panel, lineas } = await lineasDelDetalle(page, emitida);
  await expect(panel.getByRole("heading", { name: `Factura ${TEXTO.numeroUno}`, exact: true })).toBeVisible();
  expect(lineas).toEqual(lineasEsperadas());

  // SLT-199 R25: el superadmin descarga la factura de la misma «N.º 1».
  const pdf = await descargarDesde(page, panel, TEXTO.descargarFactura);
  expect(pdf.nombre).toBe(nombreDeArchivo("factura"));
  esPdf(pdf.bytes);
});

test("el admin de la empresa recibe «no encontrado» en «Mi plan», sin facturas (R19, SLT-91)", async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, ctx, estado } = await abrirCon(browser, sesiones.admin, "/mi-plan");
  try {
    expect(estado, "el admin no recibe un 404 HTTP").toBe(404);
    await expect(page.getByText(NO_ENCONTRADO).first()).toBeVisible();
    await expect(seccionDeFacturas(page)).toHaveCount(0);
    expect(await page.content(), "el admin ve el nombre del plan").not.toContain(nombrePlan);
  } finally {
    await ctx.close();
  }
});
