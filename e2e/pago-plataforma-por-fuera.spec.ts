import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { Prisma, type PrismaClient } from "@prisma/client";

import { altaDeEmpresa, clienteDueno, prepararAcceso, sembrarDatos, type Empresa } from "./_dos-empresas-fixture";
import { asignarPlanCustom, crearOrdenesDirectas } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";
import { abrirCon } from "./_escenarios/pulsar";

// SLT-143 (T5.1, design §9; R34, R36) — el pago hecho por fuera y la anulación de un pago confirmado, de punta
// a punta:
//
// 1. Datos (dueño): una empresa con su maestro, un plan custom con costo por orden (no toca el global del
//    cobro), dos órdenes con cargo y el cierre de su factura en curso. El total sale de la fila de la base.
// 2. Maestro: anota la cifra de la caja y la de la deuda.
// 3. Superadmin: en el detalle de la empresa, «Registrar pago hecho por fuera…». Monto = total − 100, referencia
//    «Transferencia del día», sin tocar el reparto propuesto, «Registrar pago». El pago aparece en «Pagos
//    confirmados» con «Registrado por la plataforma».
// 4. Maestro: la deuda y la caja bajan en el monto. En el libro, la fila «Pago a la plataforma» dice «Registrado
//    por la plataforma» y la referencia. «Anular…» responde «No tenés permiso para anular este registro.».
// 5. Superadmin: «Anular…» con el motivo «Registrado por error». El pago sale de «Pagos confirmados».
// 6. Maestro: la deuda y la caja vuelven a las cifras del paso 2. El contra-asiento dice «Anulado por la
//    plataforma» en «Registró», y el detalle del pago anulado dice «por la plataforma» y el motivo (R36).
//
// El cierre de la factura usa el artificio de SLT-119 §9, como `pago-plataforma-confirmacion.spec.ts`: como
// dueño, `factura_plataforma_cerrar(org, fin_natural_at + 6 min)`, solo para esta empresa desechable.
//
// Los textos esperados van escritos a mano (SL-45 §12.3, «Literal: contrato o polizón»). Corre en el proyecto
// `dinero`, en serie (`workers: 1`); usa el superadmin de prueba con su candado.

test.describe.configure({ mode: "serial" });

const TEXTO = {
  rotuloDebe: "Lo que la empresa debe a la plataforma",
  concepto: "Pago a la plataforma",
  referencia: "Transferencia del día",
  pagosConfirmados: "Pagos confirmados",
  registrarPorFuera: "Registrar pago hecho por fuera…",
  dialogoRegistrar: "Registrar pago hecho por fuera",
  registrarPago: "Registrar pago",
  registradoPorLaPlataforma: "Registrado por la plataforma",
  anuladoPorLaPlataforma: "Anulado por la plataforma",
  porLaPlataforma: "por la plataforma",
  anular: "Anular…",
  anularPago: "Anular pago",
  vacioConfirmados: "No hay pagos confirmados",
  motivoPlataforma: "Registrado por error",
  motivoMaestro: "SLT-143 E2E: intento de anular un pago registrado por la plataforma",
  anulacionProhibida: "No tenés permiso para anular este registro.",
} as const;

/** Lo que pinta `money(...)` de lo que queda tras el pago por fuera: el total menos el pago. */
const PINTADO_RESTO = "₡100";

interface Factura {
  id: string;
  numero: number;
  total: Prisma.Decimal;
}

let dueno: PrismaClient | undefined;
let empresa: Empresa | undefined;
let factura: Factura | undefined;
/** El monto del pago por fuera: el total de la factura menos 100, con dos decimales. */
let montoPago = "";
let deudaAntes = "";
let principalAntes = "";
let contextoM: BrowserContext | undefined;
let paginaM: Page | undefined;
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function e(): Empresa {
  if (!empresa) throw new Error("no hay alta de la empresa: falló el beforeAll");
  return empresa;
}

function f(): Factura {
  if (!factura) throw new Error("no hay factura cerrada: falló el beforeAll");
  return factura;
}

/**
 * Cierra la factura en curso de la empresa como dueño y devuelve la cerrada. Primero un cierre con la hora de
 * la base la abre o la alinea; luego se cierra con su fin natural + 6 minutos. Lanza si no cerró exactamente una.
 */
async function cerrarFacturaEnCurso(db: PrismaClient, organizacionId: string): Promise<Factura> {
  await db.$queryRaw`SELECT factura_plataforma_cerrar(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp)`;
  const enCurso = await db.facturaPlataforma.findFirst({
    where: { organizacionId, estado: "en_curso" },
    select: { id: true },
  });
  if (enCurso === null) throw new Error(`SLT-143 E2E: la empresa ${organizacionId} no tiene factura en curso`);
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."id" = ${enCurso.id}`;
  if (n !== 1) throw new Error(`SLT-143 E2E: el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
  const cerrada = await db.facturaPlataforma.findUniqueOrThrow({
    where: { id: enCurso.id },
    select: { id: true, estado: true, numero: true, total: true },
  });
  if (cerrada.estado !== "cerrada" || cerrada.numero === null || cerrada.total === null) {
    throw new Error(`SLT-143 E2E: la factura ${cerrada.id} no quedó cerrada: ${JSON.stringify(cerrada)}`);
  }
  return { id: cerrada.id, numero: cerrada.numero, total: cerrada.total };
}

/** Los movimientos del pago a la plataforma y su contra-asiento, leídos por detrás con el dueño. */
async function pagosEnElLibro(db: PrismaClient, org: string): Promise<string[]> {
  const filas = await db.walletMovimiento.findMany({
    where: { organizacionId: org, categoria: "egreso_pago_plataforma" },
    orderBy: { createdAt: "asc" },
    select: { tipo: true, monto: true },
  });
  return filas.map((x) => `${x.tipo}:${x.monto.toFixed(2)}`);
}

async function elPago(db: PrismaClient, org: string): Promise<{ id: string }> {
  return db.walletMovimiento.findFirstOrThrow({
    where: { organizacionId: org, categoria: "egreso_pago_plataforma" },
    select: { id: true },
  });
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
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(base()));

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  // 1. La empresa, su plan con costo por orden, dos órdenes con cargo y su factura cerrada.
  empresa = (await altaDeEmpresa("A", `slt143-maestro-${randomUUID().slice(0, 8)}@example.test`)).empresa;
  await prepararAcceso(base(), e(), userAgent);
  const datos = await sembrarDatos(base(), e());
  await asignarPlanCustom(base(), e().organizacionId, "500.00");
  const ordenes = await crearOrdenesDirectas(
    base(),
    { organizacionId: e().organizacionId, tiendaId: datos.tiendaId, zonaId: datos.zonaId },
    2,
  );
  const cargos = await base().cobroPlataformaMovimiento.findMany({
    where: { ordenId: { in: ordenes }, tipo: "cargo" },
    select: { monto: true },
  });
  // Control de no vacuidad: las dos órdenes llevan su cargo.
  expect(cargos.map((c) => c.monto.toFixed(2))).toEqual(["500.00", "500.00"]);
  factura = await cerrarFacturaEnCurso(base(), e().organizacionId);
  expect(f().total.greaterThan(100), `el total ${f().total.toFixed(2)} debe pasar de 100`).toBe(true);
  montoPago = f().total.minus(100).toFixed(2);
  console.log(`MEDIDO factura N.º ${f().numero}: total=${f().total.toFixed(2)} pago=${montoPago}`);

  contextoM = await browser.newContext({ userAgent });
  paginaM = await entrarComoMaestro(contextoM, e());

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(base(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(sa!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
});

test.afterAll(async () => {
  await contextoSa?.close();
  await contextoM?.close();
  await dueno?.$disconnect();
});

/* -------------------------------------------------------------------------- */
/* La wallet del maestro                                                       */
/* -------------------------------------------------------------------------- */

function tarjetaCaja(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-bolsillo="empresa"]') });
}

function regionDeuda(page: Page): Locator {
  return tarjetaCaja(page).locator('[data-region="deuda_plataforma"]');
}

function importeDeLaDeuda(page: Page): Locator {
  return regionDeuda(page).locator(".tabular-nums").first();
}

function cifraPrincipal(page: Page): Locator {
  return tarjetaCaja(page).locator("section").first().locator(".tabular-nums").first();
}

async function abrirWallet(page: Page): Promise<void> {
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(tarjetaCaja(page)).toHaveCount(1, { timeout: 60_000 });
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** El «Ver» del pago a la plataforma en el libro; con `anulado`, el de la fila ya anulada. */
function verDelPago(page: Page, anulado: boolean): Locator {
  const cola = anulado ? " · Anulado$" : "$";
  return page.getByRole("button", { name: new RegExp(`^Ver «${escapar(TEXTO.concepto)}» del .*${cola}`) });
}

/* -------------------------------------------------------------------------- */
/* El superadmin                                                               */
/* -------------------------------------------------------------------------- */

async function abrirDetalleDeEmpresa(page: Page): Promise<Locator> {
  await page.goto(`/plataforma/empresas/${e().organizacionId}`);
  const seccion = page.getByRole("region", { name: TEXTO.pagosConfirmados, exact: true });
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  return seccion;
}

test("2. el maestro anota la caja y la deuda antes del pago por fuera (R34)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  await abrirWallet(page);
  await expect(regionDeuda(page)).toHaveAttribute("aria-label", TEXTO.rotuloDebe);
  await expect(importeDeLaDeuda(page)).toBeVisible();
  await expect(cifraPrincipal(page)).toBeVisible();
  deudaAntes = (await importeDeLaDeuda(page).innerText()).trim();
  principalAntes = (await cifraPrincipal(page).innerText()).trim();
  console.log(`MEDIDO antes: deuda=${deudaAntes} principal=${principalAntes}`);
  expect(deudaAntes).not.toBe(PINTADO_RESTO);
  expect(await pagosEnElLibro(base(), e().organizacionId)).toEqual([]);
});

test("3. el superadmin registra un pago por fuera con el reparto propuesto (R1, R4, R16, R17, R34)", async () => {
  test.setTimeout(240_000);
  const page = sa!;
  const seccion = await abrirDetalleDeEmpresa(page);
  await expect(seccion).toContainText(TEXTO.vacioConfirmados);

  const dialogo = page.getByRole("dialog", { name: TEXTO.dialogoRegistrar });
  await abrirCon(seccion.getByRole("button", { name: TEXTO.registrarPorFuera, exact: true }), dialogo);
  await dialogo.getByLabel(/^Monto/).fill(montoPago);
  await dialogo.getByLabel(/^Referencia del pago/).fill(TEXTO.referencia);
  // R4: el reparto propuesto pone todo el pago en la única factura; no se toca.
  await expect(dialogo.getByLabel(`Aplicar · N.º ${f().numero}`, { exact: true })).toHaveValue(montoPago);
  const registrar = dialogo.getByRole("button", { name: TEXTO.registrarPago, exact: true });
  await expect(registrar).toBeEnabled();
  await registrar.click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });

  // R16: la fila del pago, con la marca de la plataforma, la referencia y su aplicación a la factura.
  const filas = seccion.locator("tbody tr");
  await expect(filas).toHaveCount(1, { timeout: 30_000 });
  const fila = filas.first();
  await expect(fila).toContainText(TEXTO.registradoPorLaPlataforma);
  await expect(fila).toContainText(TEXTO.referencia);
  await expect(fila).toContainText(`N.º ${f().numero}: `);
  await expect(fila.getByRole("button", { name: TEXTO.anular, exact: true })).toBeVisible();

  // Por detrás: un egreso por el monto, confirmado por fuera, con una aplicación entera a la factura.
  expect(await pagosEnElLibro(base(), e().organizacionId)).toEqual([`egreso:${montoPago}`]);
  const confirmaciones = await base().pagoPlataformaConfirmacion.findMany({
    where: { organizacionId: e().organizacionId },
    select: { porFuera: true, aplicaciones: { select: { facturaId: true, monto: true } } },
  });
  expect(
    confirmaciones.map((c) => ({
      porFuera: c.porFuera,
      aplicaciones: c.aplicaciones.map((a) => `${a.facturaId}:${a.monto.toFixed(2)}`),
    })),
  ).toEqual([{ porFuera: true, aplicaciones: [`${f().id}:${montoPago}`] }]);
});

test("4. en la wallet bajan la deuda y la caja, la fila lleva la marca y el maestro no puede anularlo (R2, R13, R15, R34)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(PINTADO_RESTO, { timeout: 30_000 });
  await expect(cifraPrincipal(page)).not.toHaveText(principalAntes);
  console.log(
    `MEDIDO tras el pago por fuera: deuda ${deudaAntes} → ${await importeDeLaDeuda(page).innerText()}, ` +
      `principal ${principalAntes} → ${await cifraPrincipal(page).innerText()}`,
  );

  // R13: la fila «Pago a la plataforma» dice «Registrado por la plataforma» y la referencia.
  const ver = verDelPago(page, false);
  await expect(ver).toHaveCount(1, { timeout: 30_000 });
  const fila = page.getByRole("row").filter({ has: ver });
  await expect(fila).toContainText(TEXTO.referencia);
  await expect(fila).toContainText(TEXTO.registradoPorLaPlataforma, { timeout: 30_000 });

  // R15: el maestro no lo anula.
  const panel = page.getByRole("dialog", { name: TEXTO.concepto });
  await abrirCon(ver, panel);
  await panel.getByRole("button", { name: TEXTO.anular, exact: true }).click();
  const anular = page.getByRole("dialog", { name: /^Anular / });
  await expect(anular).toBeVisible();
  await anular.getByLabel(/^Motivo de la anulación/).fill(TEXTO.motivoMaestro);
  await anular.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(anular.getByRole("alert")).toHaveText(TEXTO.anulacionProhibida, { timeout: 30_000 });

  // Nada escrito: ni constancia ni contra-asiento, y la deuda sigue igual.
  const pago = await elPago(base(), e().organizacionId);
  expect(await base().ajusteCajaAnulacion.count({ where: { movimientoId: pago.id } })).toBe(0);
  expect(await base().walletMovimiento.count({ where: { origenId: pago.id } })).toBe(0);
  await page.keyboard.press("Escape");
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(PINTADO_RESTO);
});

test("5. el superadmin anula el pago con motivo y sale de «Pagos confirmados» (R19, R21, R34)", async () => {
  test.setTimeout(240_000);
  const page = sa!;
  const seccion = await abrirDetalleDeEmpresa(page);
  const filas = seccion.locator("tbody tr");
  await expect(filas).toHaveCount(1);

  const dialogo = page.getByRole("dialog", { name: /^Anular pago de / });
  await abrirCon(filas.first().getByRole("button", { name: TEXTO.anular, exact: true }), dialogo);
  await dialogo.getByLabel(/^Motivo/).fill(TEXTO.motivoPlataforma);
  await dialogo.getByRole("button", { name: TEXTO.anularPago, exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
  await expect(seccion).toContainText(TEXTO.vacioConfirmados, { timeout: 30_000 });
  await expect(seccion.locator("tbody tr")).toHaveCount(0);

  // Por detrás: la anulación de la plataforma, la constancia con el motivo y un contra-asiento por el monto.
  const pago = await elPago(base(), e().organizacionId);
  expect(await base().pagoPlataformaAnulacion.count({ where: { organizacionId: e().organizacionId } })).toBe(1);
  const constancia = await base().ajusteCajaAnulacion.findUniqueOrThrow({
    where: { movimientoId: pago.id },
    select: { motivo: true },
  });
  expect(constancia.motivo).toBe(TEXTO.motivoPlataforma);
  const contra = await base().walletMovimiento.findMany({
    where: { origenTipo: "gasto", origenId: pago.id },
    select: { tipo: true, categoria: true, monto: true },
  });
  expect(contra.map((c) => `${c.tipo}:${c.categoria}:${c.monto.toFixed(2)}`)).toEqual([
    `ingreso:ingreso_ajuste:${montoPago}`,
  ]);
});

test("6. la deuda y la caja vuelven y el libro dice «Anulado por la plataforma» (R21, R34, R36)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(deudaAntes, { timeout: 30_000 });
  await expect(cifraPrincipal(page)).toHaveText(principalAntes);

  // R36: el contra-asiento dice «Anulado por la plataforma» en «Registró».
  const contra = page.getByRole("row").filter({ hasText: TEXTO.anuladoPorLaPlataforma });
  await expect(contra).toHaveCount(1, { timeout: 30_000 });
  await expect(contra).toContainText(TEXTO.referencia);

  // R36: el detalle del pago anulado dice quién lo anuló («por la plataforma») y el motivo.
  const ver = verDelPago(page, true);
  await expect(ver).toHaveCount(1);
  const panel = page.getByRole("dialog", { name: TEXTO.concepto });
  await abrirCon(ver, panel);
  await expect(panel).toContainText(TEXTO.porLaPlataforma, { timeout: 30_000 });
  await expect(panel).toContainText(TEXTO.motivoPlataforma);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});
