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

// SLT-60 (T7.1, design §9; R30) — la confirmación del pago a la plataforma, de punta a punta:
//
// 1. Datos (dueño): una empresa con su maestro, un plan custom con costo por orden (no toca el global del
//    cobro), dos órdenes con cargo y el cierre de su factura en curso. El total sale de la fila de la base.
// 2. Maestro: paga el total menos 100 desde la wallet, con un comprobante PNG; la región de la deuda NO
//    cambia y su pista es la de R35. Intenta pagar 101 (lo disponible es 100) y ve el mensaje de R36.
// 3. Superadmin: en Empresas, la fila dice «1 pago por confirmar». En el detalle, el pago trae «Ver
//    comprobante», que abre una pestaña cuya URL responde 200 con `image/png` (R33). «Confirmar…» propone
//    todo el pago en la factura; confirma y el pago sale de la sección.
// 4. Maestro: la región baja en el monto pagado (queda en ₡100). «Anular…» del pago confirmado responde
//    «No tenés permiso para anular este registro.» y no escribe nada (R10).
//
// El cierre de la factura usa el artificio de SLT-119 §9 (el de `tests/integration/db/_fixtures/factura-cerrada.ts`,
// en línea): como dueño, `factura_plataforma_cerrar(org, fin_natural_at + 6 min)`. El reloj se adelanta solo
// para esta empresa desechable.
//
// Los textos esperados van escritos a mano (SL-45 §12.3, «Literal: contrato o polizón»). Corre en el
// proyecto `dinero`, en serie (`workers: 1`); usa el superadmin de prueba con su candado.

test.describe.configure({ mode: "serial" });

const TEXTO = {
  rotuloDebe: "Lo que la empresa debe a la plataforma",
  /** SLT-60 R35. */
  pistaDebe:
    "Lo que la plataforma cobra por las órdenes de la empresa (al crearlas o, con plan porcentual, al llegar a un estado final), menos las anuladas y los pagos ya confirmados. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja al registrarlo y baja esta deuda cuando la plataforma lo confirma.",
  /** SLT-60 R36. */
  errorTope: "El pago no puede ser mayor que lo pendiente de las facturas cerradas, descontados los pagos por confirmar.",
  boton: "Registrar pago a la plataforma",
  concepto: "Pago a la plataforma",
  comprobante: "Comprobante (opcional)",
  pagosPorConfirmar: "Pagos por confirmar",
  unPagoPorConfirmar: "1 pago por confirmar",
  verComprobante: "Ver comprobante",
  confirmar: "Confirmar…",
  confirmarPago: "Confirmar pago",
  vacio: "No hay pagos por confirmar",
  motivo: "SLT-60 E2E: intento de anular un pago confirmado",
  anulacionProhibida: "No tenés permiso para anular este registro.",
} as const;

/** Lo que pinta `money(...)` de lo que queda tras confirmar: el total menos el pago. */
const PINTADO_RESTO = "₡100";

/** PNG válido de 1×1 (el de `reporte-de-bugs.spec.ts`), generado aquí: sin archivos en disco. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

interface Factura {
  id: string;
  numero: number;
  total: Prisma.Decimal;
}

let dueno: PrismaClient | undefined;
let empresa: Empresa | undefined;
let factura: Factura | undefined;
/** El monto pagado: el total de la factura menos 100, con dos decimales. */
let montoPago = "";
let deudaAntes = "";
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
  if (enCurso === null) throw new Error(`SLT-60 E2E: la empresa ${organizacionId} no tiene factura en curso`);
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."id" = ${enCurso.id}`;
  if (n !== 1) throw new Error(`SLT-60 E2E: el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
  const cerrada = await db.facturaPlataforma.findUniqueOrThrow({
    where: { id: enCurso.id },
    select: { id: true, estado: true, numero: true, total: true },
  });
  if (cerrada.estado !== "cerrada" || cerrada.numero === null || cerrada.total === null) {
    throw new Error(`SLT-60 E2E: la factura ${cerrada.id} no quedó cerrada: ${JSON.stringify(cerrada)}`);
  }
  return { id: cerrada.id, numero: cerrada.numero, total: cerrada.total };
}

/** Los pagos a la plataforma de la empresa en su libro, leídos por detrás con el dueño. */
async function pagosEnElLibro(db: PrismaClient, org: string): Promise<string[]> {
  const filas = await db.walletMovimiento.findMany({
    where: { organizacionId: org, categoria: "egreso_pago_plataforma" },
    orderBy: { createdAt: "asc" },
    select: { tipo: true, monto: true },
  });
  return filas.map((x) => `${x.tipo}:${x.monto.toFixed(2)}`);
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
  empresa = (await altaDeEmpresa("A", `slt60-maestro-${randomUUID().slice(0, 8)}@example.test`)).empresa;
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

async function abrirPago(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await abrirCon(regionDeuda(page).getByRole("button", { name: TEXTO.boton, exact: true }), dialog);
  await expect(dialog.getByRole("radio", { name: TEXTO.concepto })).toBeChecked();
  return dialog;
}

function escapar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("2. el maestro paga el total menos 100 con comprobante y la deuda no baja; 101 no pasa (R30, R35, R36)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  await abrirWallet(page);
  const region = regionDeuda(page);
  await expect(region).toHaveAttribute("aria-label", TEXTO.rotuloDebe);
  await expect(region).toContainText(TEXTO.pistaDebe);
  await expect(importeDeLaDeuda(page)).toBeVisible();
  deudaAntes = (await importeDeLaDeuda(page).innerText()).trim();
  const principalAntes = (await cifraPrincipal(page).innerText()).trim();
  console.log(`MEDIDO antes: deuda=${deudaAntes} principal=${principalAntes}`);

  const dialog = await abrirPago(page);
  await dialog.getByLabel(/^Monto/).fill(montoPago);
  await dialog.getByLabel(/^Referencia del pago/).fill("SLT-60 transferencia");
  await dialog.getByLabel(TEXTO.comprobante, { exact: true }).setInputFiles({
    name: "comprobante-slt60.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // La caja baja al registrar (la cifra principal cambia sin recargar) y la deuda NO (R1, R6, R7).
  await expect(cifraPrincipal(page)).not.toHaveText(principalAntes, { timeout: 30_000 });
  await expect(importeDeLaDeuda(page)).toHaveText(deudaAntes);
  await expect(region).toContainText(TEXTO.pistaDebe);
  expect(await pagosEnElLibro(base(), e().organizacionId)).toEqual([`egreso:${montoPago}`]);
  const pago = await base().walletMovimiento.findFirstOrThrow({
    where: { organizacionId: e().organizacionId, categoria: "egreso_pago_plataforma" },
    select: { id: true },
  });
  expect(await base().walletComprobante.count({ where: { cajaMovimientoId: pago.id } })).toBe(1);

  // Tras recargar, igual: la deuda sigue en lo que era.
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(deudaAntes);

  // R2, R36: lo disponible es 100; 101 cae con el mensaje bajo el monto y no se escribe nada.
  const otro = await abrirPago(page);
  await otro.getByLabel(/^Monto/).fill("101");
  await otro.getByLabel(/^Referencia del pago/).fill("SLT-60 transferencia 101");
  await otro.getByRole("button", { name: "Registrar", exact: true }).click();
  const monto = otro.getByLabel(/^Monto/);
  await expect(monto).toHaveAttribute("aria-invalid", "true", { timeout: 30_000 });
  await expect(monto).toHaveAccessibleDescription(new RegExp(escapar(TEXTO.errorTope)));
  await expect(otro).toBeVisible();
  expect(await pagosEnElLibro(base(), e().organizacionId)).toEqual([`egreso:${montoPago}`]);
  await page.keyboard.press("Escape");
  await expect(otro).toBeHidden();
});

/* -------------------------------------------------------------------------- */
/* El superadmin                                                                */
/* -------------------------------------------------------------------------- */

test("3. el superadmin ve el contador, abre el comprobante y confirma con el reparto propuesto (R27, R30, R32, R33)", async () => {
  test.setTimeout(240_000);
  const page = sa!;
  await page.goto("/plataforma/empresas");
  await expect(page.getByRole("columnheader", { name: "Plataforma", exact: true })).toBeVisible({ timeout: 60_000 });
  const fila = page.getByRole("table").locator("tbody tr").filter({ hasText: e().slug });
  await expect(fila).toHaveCount(1);
  const contador = fila.locator("[data-pagos-por-confirmar]");
  await expect(contador).toHaveText(TEXTO.unPagoPorConfirmar);
  await expect(contador).toHaveAttribute("data-pagos-por-confirmar", "1");

  await page.goto(`/plataforma/empresas/${e().organizacionId}`);
  const seccion = page.getByRole("region", { name: TEXTO.pagosPorConfirmar, exact: true });
  await expect(seccion).toBeVisible({ timeout: 60_000 });
  const filas = seccion.locator("tbody tr");
  await expect(filas).toHaveCount(1);
  const filaPago = filas.first();

  // R32, R33: «Ver comprobante» abre una pestaña nueva con el archivo, que responde 200 y es un PNG.
  const pestanaPromesa = page.waitForEvent("popup");
  await filaPago.getByRole("button", { name: TEXTO.verComprobante, exact: true }).click();
  const pestana = await pestanaPromesa;
  await pestana.waitForURL((u) => u.protocol.startsWith("http"), { timeout: 30_000 });
  const url = pestana.url();
  expect(url, "la ruta del archivo no debe ser la URL").not.toContain("/plataforma/");
  const archivo = await pestana.request.get(url);
  expect(archivo.status()).toBe(200);
  expect(archivo.headers()["content-type"]).toBe("image/png");
  console.log(`MEDIDO comprobante: ${archivo.status()} ${archivo.headers()["content-type"]}`);
  await pestana.close();

  // R14, R16: la propuesta pone todo el pago en la factura; se confirma y el pago sale de la sección.
  const dialogo = page.getByRole("dialog");
  await abrirCon(filaPago.getByRole("button", { name: TEXTO.confirmar, exact: true }), dialogo);
  const aplicar = dialogo.getByLabel(`Aplicar · N.º ${f().numero}`, { exact: true });
  await expect(aplicar).toHaveValue(montoPago);
  const confirmar = dialogo.getByRole("button", { name: TEXTO.confirmarPago, exact: true });
  await expect(confirmar).toBeEnabled();
  await confirmar.click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
  await expect(seccion).toContainText(TEXTO.vacio, { timeout: 30_000 });
  await expect(seccion.locator("tbody tr")).toHaveCount(0);

  // Por detrás: una confirmación con una aplicación por el monto entero a esa factura.
  const confirmaciones = await base().pagoPlataformaConfirmacion.findMany({
    where: { organizacionId: e().organizacionId },
    select: { aplicaciones: { select: { facturaId: true, monto: true } } },
  });
  expect(confirmaciones.map((c) => c.aplicaciones.map((a) => `${a.facturaId}:${a.monto.toFixed(2)}`))).toEqual([
    [`${f().id}:${montoPago}`],
  ]);

  // El contador de Empresas ya no sale.
  await page.goto("/plataforma/empresas");
  const filaTras = page.getByRole("table").locator("tbody tr").filter({ hasText: e().slug });
  await expect(filaTras).toHaveCount(1, { timeout: 60_000 });
  await expect(filaTras.locator("[data-pagos-por-confirmar]")).toHaveCount(0);
});

/* -------------------------------------------------------------------------- */
/* De vuelta en la wallet                                                       */
/* -------------------------------------------------------------------------- */

test("4. la deuda del maestro baja en el monto pagado y el pago confirmado no se anula (R7, R10, R30)", async () => {
  test.setTimeout(240_000);
  const page = paginaM!;
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(PINTADO_RESTO);
  console.log(`MEDIDO tras confirmar: deuda ${deudaAntes} → ${await importeDeLaDeuda(page).innerText()}`);

  const ver = page.getByRole("button", { name: new RegExp(`^Ver «${TEXTO.concepto}» del `) });
  await expect(ver).toHaveCount(1);
  const panel = page.getByRole("dialog", { name: TEXTO.concepto });
  await abrirCon(ver, panel);
  await panel.getByRole("button", { name: "Anular…", exact: true }).click();
  const anular = page.getByRole("dialog", { name: /^Anular / });
  await expect(anular).toBeVisible();
  await anular.getByLabel(/^Motivo de la anulación/).fill(TEXTO.motivo);
  await anular.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(anular.getByRole("alert")).toHaveText(TEXTO.anulacionProhibida, { timeout: 30_000 });

  // Nada escrito: ni constancia ni contra-asiento, y la deuda sigue igual.
  const pago = await base().walletMovimiento.findFirstOrThrow({
    where: { organizacionId: e().organizacionId, categoria: "egreso_pago_plataforma" },
    select: { id: true },
  });
  expect(await base().ajusteCajaAnulacion.count({ where: { movimientoId: pago.id } })).toBe(0);
  expect(await base().walletMovimiento.count({ where: { origenId: pago.id } })).toBe(0);
  await page.keyboard.press("Escape");
  await abrirWallet(page);
  await expect(importeDeLaDeuda(page)).toHaveText(PINTADO_RESTO);
});
