import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { fechaLegible } from "../lib/planes/mora";
import { sumarDiasCalendario } from "../lib/utils/calendario-zona";
import { crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import { altaDeEmpresa, clienteDueno, prepararAcceso, sembrarDatos, type DatosSembrados, type Empresa } from "./_dos-empresas-fixture";
import { asignarPlanCustom, crearOrdenesDirectas, enlazarDistritoDeLaPlantilla } from "./_planes-fixture";
import { asegurarSuperadmin, conCandadoDelSuperadmin, entrarComoSuperadmin } from "./_superadmin-fixture";
import { abrirCon } from "./_escenarios/pulsar";

// SLT-255 · T5.1 (design §7; R23, con R3, R8, R9, R11, R13 y R14) — la prórroga del pago, de punta a punta:
//
// Siembra (dueño), la de `mora-congelamiento.spec.ts`: una empresa con su maestro y un `admin`, un plan custom con
// 500,00 por orden, dos órdenes con cargo y su factura cerrada con el atajo SQL (`factura_plataforma_cerrar` con el
// fin natural + 6 min). Su fecha límite `FL` y su `vence_at` (00:00 de la plataforma de `FL + 1`) se leen de
// `factura_plataforma_mora` con la gracia global por defecto. La fecha hasta de la prórroga es `H = FL + 2`: posterior
// a `FL` (design §7) y dentro del tope de la pantalla (hoy + 60), que se comprueba con el `max` del campo.
//
// El reloj de la madrugada es el ARTIFICIO de SLT-121 §11: `organizacion_mora_congelar` se llama con un `ahora`
// adelantado solo para esta empresa desechable: `vence_at` + 30 min (00:30 de `FL + 1`, la factura ya vencida y la
// fecha dentro de la prórroga) y `vence_at` + (`H` − `FL`) días + 30 min (00:30 de `H + 1`).
//
// Pasos:
// 1. El superadmin abre la empresa en Plataforma > Empresas, pulsa «Dar plazo hasta…», pone motivo y `H` y confirma
//    (R3, R13). La sección pasa a «Con prórroga hasta el …» y el historial trae «Dio o cambió la prórroga de pago» (R14).
// 2. La corrida de `FL + 1` no congela: `descongelada_a_mano` y `congelada_at` sigue NULL (R8).
// 3. El maestro y el `admin` ven «Tienes prórroga de pago hasta el …» (R11). El banner se lee con el reloj real: la
//    factura no está vencida en tiempo real, pero cumple `fechaLimite <= H`.
// 4. La corrida de `H + 1` congela (R9).
// 5. El maestro ve «Empresa congelada por falta de pago».
//
// Los textos esperados van escritos a mano (SL-45 §12.3). Corre en el proyecto `dinero`, en serie (`workers: 1`);
// usa el superadmin de prueba con su candado.

test.describe.configure({ mode: "serial" });

const TEXTO = {
  seccionMora: "Plazo de pago y mora",
  historialMora: "Historial de la mora",
  darPlazo: "Dar plazo hasta…",
  tituloDialogo: "Dar prórroga de pago",
  confirmarDialogo: "Dar plazo",
  conProrroga: (hasta: string) => `Con prórroga hasta el ${fechaLegible(hasta)}`,
  prorrogaFijada: "Dio o cambió la prórroga de pago",
  /** R11: el banner de la prórroga (`MORA_TEXTOS.banner.conPlazo`). */
  bannerProrroga: (hasta: string) =>
    `Tienes prórroga de pago hasta el ${fechaLegible(hasta)}. Si no pagas, la operación se congela la madrugada siguiente.`,
  /** SLT-121 R24: el banner de la empresa congelada (`MORA_TEXTOS.banner.congelada`). */
  bannerCongelada:
    "Empresa congelada por falta de pago. Puedes ver tus datos, cambiar tu cuenta y pagar a la plataforma desde la wallet.",
} as const;

/** La gracia que se pasa a las funciones de la base (la global por defecto, `GRACIA_GLOBAL_POR_DEFECTO`). */
const GRACIA_SIEMBRA = 7;
/** Días de la prórroga más allá de la fecha límite de la factura. */
const DIAS_TRAS_FL = 2;

/** La factura cerrada, como la ve `factura_plataforma_mora`. */
interface FacturaMora {
  id: string;
  /** `AAAA-MM-DD`. */
  fechaLimite: string;
}

let dueno: PrismaClient | undefined;
let empresa: Empresa | undefined;
let datos: DatosSembrados | undefined;
let factura: FacturaMora | undefined;
/** La fecha hasta de la prórroga, `AAAA-MM-DD`. */
let hasta = "";
const motivo = `SLT-255 E2E ${randomUUID().slice(0, 8)}`;
let sesionAdmin: Cookie[] | undefined;
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

function f(): FacturaMora {
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
 * Cierra la factura en curso de la empresa como dueño (el atajo de `mora-congelamiento.spec.ts`) y devuelve su id.
 * Lanza si no cerró exactamente una.
 */
async function cerrarFacturaEnCurso(organizacionId: string): Promise<string> {
  await db().$queryRaw`SELECT factura_plataforma_cerrar(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp)`;
  const enCurso = await db().facturaPlataforma.findFirst({
    where: { organizacionId, estado: "en_curso" },
    select: { id: true },
  });
  if (enCurso === null) throw new Error(`SLT-255 E2E: la empresa ${organizacionId} no tiene factura en curso`);
  const [{ n }] = await db().$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."id" = ${enCurso.id}`;
  if (n !== 1) throw new Error(`SLT-255 E2E: el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
  return enCurso.id;
}

/** La fila de la factura en `factura_plataforma_mora`, leída con el reloj real. */
async function leerFacturaMora(organizacionId: string, facturaId: string): Promise<FacturaMora> {
  const filas = await db().$queryRaw<{ id: string; fecha_limite: string; vencida: boolean }[]>`
    SELECT m."factura_id" AS id, m."fecha_limite"::text AS fecha_limite, m."vencida"
      FROM factura_plataforma_mora(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp, ${GRACIA_SIEMBRA}::int) m
     WHERE m."factura_id" = ${facturaId}`;
  if (filas.length !== 1) throw new Error(`SLT-255 E2E: la factura ${facturaId} no está en la mora (saldo 0)`);
  // Control: en tiempo real la factura todavía no está vencida (el banner de R11 se lee con el reloj real).
  expect(filas[0].vencida, "la factura ya está vencida en tiempo real").toBe(false);
  return { id: filas[0].id, fechaLimite: filas[0].fecha_limite };
}

/**
 * La corrida de madrugada para esta empresa: `organizacion_mora_congelar` con un `ahora` a las 00:30 de la plataforma
 * del día `fechaLimite + 1 + diasTras` (`vence_at` son las 00:00 de `fechaLimite + 1`). Devuelve el JSON.
 */
async function corridaDeMadrugada(diasTras: number): Promise<Record<string, unknown>> {
  const [{ r }] = await db().$queryRaw<{ r: Record<string, unknown> }[]>`
    SELECT organizacion_mora_congelar(
             ${e().organizacionId},
             m."vence_at" + make_interval(days => ${diasTras}::int) + interval '30 minutes',
             ${GRACIA_SIEMBRA}::int) AS r
      FROM factura_plataforma_mora(${e().organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp, ${GRACIA_SIEMBRA}::int) m
     WHERE m."factura_id" = ${f().id}`;
  return r;
}

async function moraDeLaOrganizacion(): Promise<{ congeladaAt: Date | null; descongeladaHasta: string | null }> {
  const o = await db().organizacion.findUniqueOrThrow({
    where: { id: e().organizacionId },
    select: { congeladaAt: true, descongeladaHasta: true },
  });
  return {
    congeladaAt: o.congeladaAt,
    descongeladaHasta: o.descongeladaHasta === null ? null : o.descongeladaHasta.toISOString().slice(0, 10),
  };
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

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db()));

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  empresa = (await altaDeEmpresa("A", `slt255-maestro-${randomUUID().slice(0, 8)}@example.test`)).empresa;
  await prepararAcceso(db(), e(), userAgent);
  datos = await sembrarDatos(db(), e());
  const conZona = { organizacionId: e().organizacionId, tiendaId: d().tiendaId, zonaId: d().zonaId };
  await enlazarDistritoDeLaPlantilla(db(), conZona);
  const admin = await crearUsuarioE2E(comoEmpresaE2E(e()), "admin");

  await asignarPlanCustom(db(), e().organizacionId, "500.00");
  const ordenes = await crearOrdenesDirectas(db(), conZona, 2);
  const cargos = await db().cobroPlataformaMovimiento.findMany({
    where: { ordenId: { in: ordenes }, tipo: "cargo" },
    select: { monto: true },
  });
  // Control de no vacuidad: las dos órdenes llevan su cargo y la factura tiene saldo.
  expect(cargos.map((c) => c.monto.toFixed(2))).toEqual(["500.00", "500.00"]);
  const facturaId = await cerrarFacturaEnCurso(e().organizacionId);
  factura = await leerFacturaMora(e().organizacionId, facturaId);
  hasta = sumarDiasCalendario(f().fechaLimite, DIAS_TRAS_FL);
  console.log(`MEDIDO factura ${f().id}: fecha límite=${f().fechaLimite}; prórroga hasta=${hasta}`);

  contextoM = await browser.newContext({ userAgent });
  paginaM = await entrarComoMaestro(contextoM, e());
  sesionAdmin = await sesionDe(browser, admin);

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

function seccionMora(page: Page): Locator {
  return page.getByRole("region", { name: TEXTO.seccionMora, exact: true });
}

/** El banner de la prórroga: tono aviso, `role="status"` (`AvisoMora`). */
function bannerProrroga(page: Page): Locator {
  return page.getByRole("status").filter({ hasText: TEXTO.bannerProrroga(hasta) });
}

/** El banner de la congelada (el `role="alert"` del anunciador de rutas de Next no lleva este texto). */
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

/* -------------------------------------------------------------------------- */
/* La prórroga                                                                 */
/* -------------------------------------------------------------------------- */

test("1. el superadmin da la prórroga desde Plataforma > Empresas: «Con prórroga hasta el …» y la fila del historial (R3, R13, R14, R23)", async () => {
  test.setTimeout(240_000);
  const page = sa!;
  const r = await page.goto(`/plataforma/empresas/${e().organizacionId}`, { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  const mora = seccionMora(page);
  await expect(mora).toBeVisible({ timeout: 60_000 });
  // La factura tiene saldo y no está vencida en tiempo real: «En plazo».
  await expect(mora.locator("[data-estado-mora]")).toHaveAttribute("data-estado-mora", "en_plazo");

  const dialogo = page.getByRole("dialog");
  await abrirCon(mora.getByRole("button", { name: TEXTO.darPlazo, exact: true }), dialogo);
  await expect(dialogo.getByRole("heading", { name: TEXTO.tituloDialogo, exact: true })).toBeVisible();
  const campoHasta = dialogo.getByLabel(/^Hasta/);
  // R6: la fecha elegida cae dentro del tope de la pantalla (`AAAA-MM-DD` se compara como texto).
  const max = await campoHasta.getAttribute("max");
  expect(max, "el campo «Hasta» no trae su tope").not.toBeNull();
  expect(hasta <= (max ?? ""), `la prórroga ${hasta} pasa del tope ${max}`).toBe(true);
  await dialogo.getByLabel(/^Motivo/).fill(motivo);
  await campoHasta.fill(hasta);
  await dialogo.getByRole("button", { name: TEXTO.confirmarDialogo, exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });

  // R3: la prórroga queda escrita y la empresa sigue sin congelar.
  await expect.poll(async () => (await moraDeLaOrganizacion()).descongeladaHasta, { timeout: 30_000 }).toBe(hasta);
  expect((await moraDeLaOrganizacion()).congeladaAt).toBeNull();

  await page.reload({ waitUntil: "load", timeout: 180_000 });
  const moraTras = seccionMora(page);
  await expect(moraTras).toBeVisible({ timeout: 60_000 });
  const estado = moraTras.locator("[data-estado-mora]");
  await expect(estado).toHaveAttribute("data-estado-mora", "con_plazo");
  await expect(estado).toHaveText(TEXTO.conProrroga(hasta));
  const historial = moraTras.getByRole("table", { name: TEXTO.historialMora, exact: true });
  await expect(historial.locator("tbody tr").filter({ hasText: TEXTO.prorrogaFijada })).toHaveCount(1);
});

test("2. la corrida de madrugada dentro de la prórroga, con la factura vencida, no congela (R8, R23)", async () => {
  const r = await corridaDeMadrugada(0);
  console.log(`MEDIDO corrida de ${sumarDiasCalendario(f().fechaLimite, 1)} 00:30 → ${JSON.stringify(r)}`);
  expect(r.resultado, JSON.stringify(r)).toBe("descongelada_a_mano");
  expect((await moraDeLaOrganizacion()).congeladaAt).toBeNull();
});

test("3. el maestro y el admin ven «Tienes prórroga de pago hasta el …» (R11, R23)", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = paginaM!;
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(bannerProrroga(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(bannerProrroga(page)).toHaveText(TEXTO.bannerProrroga(hasta));
  await expect(bannerCongelada(page)).toHaveCount(0);

  const { page: paginaA, ctx } = await paginaCon(browser, sesionAdmin, "/ordenes");
  try {
    await expect(bannerProrroga(paginaA)).toHaveCount(1, { timeout: 60_000 });
    await expect(bannerProrroga(paginaA)).toHaveText(TEXTO.bannerProrroga(hasta));
  } finally {
    await ctx.close();
  }
});

/* -------------------------------------------------------------------------- */
/* Pasada la prórroga                                                          */
/* -------------------------------------------------------------------------- */

test("4. la corrida de la madrugada siguiente a la fecha hasta congela la empresa (R9, R23)", async () => {
  const r = await corridaDeMadrugada(DIAS_TRAS_FL);
  console.log(`MEDIDO corrida de ${sumarDiasCalendario(hasta, 1)} 00:30 → ${JSON.stringify(r)}`);
  expect(r.resultado, JSON.stringify(r)).toBe("congelada");
  expect((await moraDeLaOrganizacion()).congeladaAt).not.toBeNull();
});

test("5. el maestro ve «Empresa congelada por falta de pago» (R23)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(bannerCongelada(page)).toHaveCount(1, { timeout: 60_000 });
  await expect(bannerCongelada(page)).toHaveText(TEXTO.bannerCongelada);
  await expect(bannerProrroga(page)).toHaveCount(0);
});
