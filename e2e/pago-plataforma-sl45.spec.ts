import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Prisma, type PrismaClient, type RolValue } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { altaDeEmpresa, clienteDueno, prepararAcceso, SINPE_DE_PRUEBA, type Empresa } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";
import { abrirCon } from "./_escenarios/pulsar";
import { CAJA_A, CAJA_B, sembrarCaja } from "./_wallet-iva-sl39-siembra";

// SL-45 (T10, design §12.4) — el pago a la plataforma desde la wallet, en el navegador.
//
// 1. A crea dos órdenes con el global en 500,00 y se cierra su factura en curso (total 1.000,00, leído de
//    la fila): la región dice «₡1.000» con la pista de SLT-60 R35 y el botón «Registrar pago a la
//    plataforma». El botón abre «Registrar movimiento» con «Pago a la plataforma» elegido y la frase de
//    SLT-60 R37 (R4). Paga 600: la cifra principal baja ₡600 sin recargar (R5, R8) y la región sigue en
//    «₡1.000»: desde SLT-60 la deuda baja al confirmar, no al registrar. Intentar pagar 500 (quedan 400
//    disponibles) deja bajo el monto el mensaje de SLT-60 R36 (R9).
// 2. El superadmin ve, en «Empresas», «Debe ₡1.000 · Pagado ₡0 · 1 pago por confirmar» en A y «Al día ·
//    Pagado ₡0» en B (R28; SLT-60 R7, R27).
// 3. A anula el pago por confirmar desde «Ver» del libro: la cifra principal vuelve sin recargar y la región
//    sigue en «₡1.000» (R5, R15, R23; SLT-60 R9).
// 4. A paga los 1.000 y la región sigue en «₡1.000»; confirmado el pago (como dueño, como los tests de
//    integración de SLT-60 §8.1), «Al día» con la pista de R2 y sin botón. Se elimina una orden: «Saldo a
//    favor de la empresa con la plataforma» «₡500» con la pista de R3, sin botón.
// 5. El superadmin ve «A favor ₡500 · Pagado ₡1.000» en A, sin pagos por confirmar (R28).
// 6. B no ve nada de A: su región dice «al día», su libro no tiene ningún pago y su caja no se movió (R20).
//
// Las órdenes se crean y se eliminan con el cliente dueño y la empresa fijada, como en SL-40: los
// triggers escriben los cargos y los reversos. La factura se cierra y el pago se confirma como dueño con
// las funciones de la base (SLT-60 design §8.1: «los E2E, con la misma llamada SQL en línea»); la
// confirmación del superadmin por la pantalla es de `pago-plataforma-confirmacion.spec.ts`. Los pagos y
// la anulación van SOLO por la pantalla.
//
// Los textos y los importes esperados van escritos a mano: son lo que pinta `money` (omite los «,00»).
// Derivarlos de `wallet-labels.ts` o de `money` los compararía contra su propia fuente.
//
// Corre en el proyecto `aislamiento` (SL-44), en serie detrás del de SL-40 (`workers: 1`): los dos
// tocan el valor GLOBAL del cobro. Playwright levanta el servidor sin SMTP, con `AUTH_OTP_DEBUG_LOG=1`
// y su log en `E2E_LOG_SERVIDOR` (el OTP del superadmin sale de ahí), sobre una base local migrada y
// con `pnpm run db:seed`. El `afterAll` devuelve el global a lo que había, para que otro spec o una
// segunda corrida no hereden el 500,00 (excepción de R8 de SL-44, `design.md > D4`, como en SL-40).
// `SL45_CAPTURAS` es la carpeta de las capturas; sin ella van a la salida del test.

test.describe.configure({ mode: "serial" });

const TEXTO = {
  rotuloDebe: "Lo que la empresa debe a la plataforma",
  rotuloAFavor: "Saldo a favor de la empresa con la plataforma",
  /** SLT-60 R35. */
  pistaDebe:
    "Lo que la plataforma cobra por las órdenes de la empresa (al crearlas o, con plan porcentual, al llegar a un estado final), menos las anuladas y los pagos ya confirmados. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja al registrarlo y baja esta deuda cuando la plataforma lo confirma.",
  pistaAlDia: "La empresa está al día con la plataforma. Cada orden suma su cobro aquí cuando se cobra.",
  pistaAFavor:
    "La empresa pagó más de lo que hoy debe, porque se anularon órdenes ya pagadas. Se descuenta de los próximos cobros.",
  boton: "Registrar pago a la plataforma",
  concepto: "Pago a la plataforma",
  /** SLT-60 R37, el literal del spec. */
  efecto:
    "Sale dinero de la empresa hacia la plataforma; lo que la empresa le debe baja cuando la plataforma confirma el pago; baja la ganancia.",
  /** SLT-60 R36. */
  errorTope: "El pago no puede ser mayor que lo pendiente de las facturas cerradas, descontados los pagos por confirmar.",
  unPagoPorConfirmar: "1 pago por confirmar",
  motivo: "SL-45 E2E: el pago se registró por error",
} as const;

/** Lo que pinta `money(...)`, escrito a mano. */
const PINTADO = {
  cero: "₡0",
  quinientos: "₡500",
  seiscientos: "₡600",
  mil: "₡1.000",
  /** La caja de SL-39 más el saldo inicial de 10.000,00: lo que mide el E2E de SL-40. */
  principal: "₡28.500",
  principalTras600: "₡27.900",
  principalTras1000: "₡27.500",
  ganancia: "₡1.700",
  gananciaTras600: "₡1.100",
  salio: "₡1.500",
  salioTras600: "₡2.100",
} as const;

let dueno: PrismaClient | undefined;
let empresaA: Empresa | undefined;
let empresaB: Empresa | undefined;
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;
let contextoA: BrowserContext | undefined;
let paginaA: Page | undefined;
let contextoB: BrowserContext | undefined;
let paginaB: Page | undefined;
let ordenes: string[] = [];
/** SLT-60: la factura cerrada de A (paso 1), contra la que se confirma el pago del paso 4. */
let facturaA: { id: string; total: string } | undefined;
let cajaInicialB: Cifras | undefined;
/** El valor global del cobro al empezar (`null`: sin configurar), para devolverlo en el `afterAll`. */
let globalAntes: Prisma.Decimal | null = null;
let globalGuardado = false;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function a(): Empresa {
  if (!empresaA) throw new Error("no hay alta de A: falló el beforeAll");
  return empresaA;
}

function b(): Empresa {
  if (!empresaB) throw new Error("no hay alta de B: falló el beforeAll");
  return empresaB;
}

function capturaEn(info: TestInfo, nombre: string): string {
  const carpeta = process.env.SL45_CAPTURAS;
  return carpeta ? path.join(carpeta, nombre) : info.outputPath(nombre);
}

/** Un saldo inicial vigente: con él la caja pasa a «saldo» (como en el E2E de SL-40). */
async function sembrarSaldoInicial(db: PrismaClient, e: Empresa, monto: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    const aporte = await tx.aporteCapital.create({
      data: {
        claveIdempotencia: randomUUID(),
        clase: "saldo_inicial",
        monto: new Prisma.Decimal(monto),
        motivo: "SL-45: saldo inicial del recorrido",
        fecha: new Date(),
        registradoPor: e.maestroId,
      },
      select: { id: true },
    });
    await tx.walletMovimiento.create({
      data: {
        tipo: "ingreso",
        categoria: "ingreso_aporte_capital",
        monto: new Prisma.Decimal(monto),
        origenTipo: "aporte_capital",
        origenId: aporte.id,
        descripcion: "SL-45: saldo inicial del recorrido",
        registradoPor: e.maestroId,
      },
    });
  });
}

/** Crea `n` órdenes de A con la empresa fijada: el trigger de INSERT registra un cargo por cada una. */
async function crearOrdenes(db: PrismaClient, e: Empresa, n: number): Promise<string[]> {
  return db.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    const s = randomUUID().replace(/-/g, "").slice(0, 12);
    const rol = await tx.rol.findFirst({ where: { value: "adminTienda" satisfies RolValue }, select: { id: true } });
    const tipo = await tx.tipoIdentificacion.findUnique({ where: { value: "cedula" }, select: { id: true } });
    const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
    const canton = await tx.canton.findFirst({ select: { id: true, provinciaId: true } });
    if (!rol || !tipo || !estatus || !canton) {
      throw new Error("SL-45: faltan catálogos o geografía (¿base sin migrar o sin `pnpm run db:seed`?)");
    }
    const zona = await tx.zona.create({
      data: { nombre: `Zona SL45 ${s}`, sinpeNumero: SINPE_DE_PRUEBA, sinpeNombre: "Titular SL45", sinpeRevisadoAt: new Date() },
      select: { id: true },
    });
    const tienda = await tx.usuario.create({
      data: {
        nombre: `Tienda SL45 ${s}`,
        primerApellido: "SL45",
        email: `sl45-tienda-${s}@example.test`,
        telefono: "88880000",
        passwordHash: "x",
        cedula: `sl45-${s}`,
        tipoIdentificacionId: tipo.id,
        rolId: rol.id,
        estado: "activo",
        organizacionId: e.organizacionId,
      },
      select: { id: true },
    });
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const { id } = await tx.orden.create({
        data: {
          numRemision: `SL45-${s}-${i}`,
          destinatario: `Destinatario SL45 ${i}`,
          telefonoDest: "88881111",
          producto: `Producto SL45 ${i}`,
          montoCobrar: new Prisma.Decimal("1000.00"),
          estatusId: estatus.id,
          tiendaId: tienda.id,
          zonaId: zona.id,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
        },
        select: { id: true },
      });
      ids.push(id);
    }
    return ids;
  });
}

/** La anulación de una orden (SL-40 D6): `deleted_at` con valor, que el trigger convierte en reverso. */
async function eliminarOrden(db: PrismaClient, e: Empresa, ordenId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    await tx.orden.update({ where: { id: ordenId }, data: { deletedAt: new Date() } });
  });
}

/**
 * SLT-60 (design §8.1): desde SLT-60 solo se paga lo de facturas cerradas (R3). Cierra la factura en curso de la
 * empresa como dueño con el artificio de SLT-119 §9 (`factura_plataforma_cerrar(org, fin_natural_at + 6 min)`;
 * el de `tests/integration/db/_fixtures/factura-cerrada.ts`, en línea). Primero un cierre con la hora de la
 * base la abre o la alinea. Lanza si no cerró exactamente una.
 */
async function cerrarFacturaEnCurso(db: PrismaClient, e: Empresa): Promise<{ id: string; total: string }> {
  await db.$queryRaw`SELECT factura_plataforma_cerrar(${e.organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp)`;
  const enCurso = await db.facturaPlataforma.findFirst({
    where: { organizacionId: e.organizacionId, estado: "en_curso" },
    select: { id: true },
  });
  if (enCurso === null) throw new Error(`SL-45: la empresa ${e.organizacionId} no tiene factura en curso`);
  const [{ n }] = await db.$queryRaw<{ n: number }[]>`
    SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
      FROM "factura_plataforma" f
     WHERE f."id" = ${enCurso.id}`;
  if (n !== 1) throw new Error(`SL-45: el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
  const f = await db.facturaPlataforma.findUniqueOrThrow({
    where: { id: enCurso.id },
    select: { id: true, estado: true, total: true },
  });
  if (f.estado !== "cerrada" || f.total === null) throw new Error(`SL-45: la factura ${f.id} no quedó cerrada`);
  return { id: f.id, total: f.total.toFixed(2) };
}

/**
 * SLT-60 (design §8.1): confirma como dueño el único pago por confirmar de la empresa, entero contra la factura,
 * con `pago_plataforma_confirmar`; `confirmado_por` es el maestro (la base solo exige un usuario de la empresa o
 * sin empresa). Lanza si la base no responde `ok`.
 */
async function confirmarComoDueno(db: PrismaClient, e: Empresa, facturaId: string): Promise<void> {
  const porConfirmar = await db.walletMovimiento.findMany({
    where: {
      organizacionId: e.organizacionId,
      categoria: "egreso_pago_plataforma",
      tipo: "egreso",
      confirmacionesPagoPlataforma: { none: {} },
      anulacionAjuste: { is: null },
    },
    select: { id: true, monto: true },
  });
  if (porConfirmar.length !== 1) throw new Error(`SL-45: se esperaba un pago por confirmar, hay ${porConfirmar.length}`);
  const [pago] = porConfirmar;
  const filas = await db.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_confirmar($1, $2, $3::jsonb, $4, (now() AT TIME ZONE 'UTC')::timestamp) AS r`,
    e.organizacionId,
    pago.id,
    JSON.stringify([{ factura_id: facturaId, monto: pago.monto.toFixed(2) }]),
    e.maestroId,
  );
  if (filas[0]?.r !== "ok") throw new Error(`SL-45: la confirmación del pago ${pago.id} respondió ${JSON.stringify(filas)}`);
}

/** Los pagos a la plataforma de una empresa en su libro, leídos por detrás con el dueño. */
async function pagosEnElLibro(db: PrismaClient, e: Empresa): Promise<string[]> {
  const filas = await db.walletMovimiento.findMany({
    where: { organizacionId: e.organizacionId, categoria: "egreso_pago_plataforma" },
    orderBy: { createdAt: "asc" },
    select: { tipo: true, monto: true },
  });
  return filas.map((f) => `${f.tipo}:${f.monto.toFixed(2)}`);
}

async function entrarComoMaestro(ctx: BrowserContext, e: Empresa): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill('input[type="email"]', e.email);
  await page.fill('input[type="password"]', e.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  return page;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(base()));
  // El global en 500,00; el `afterAll` devuelve el que había.
  globalAntes = (await base().cobroPlataformaTarifa.findUnique({ where: { id: true }, select: { monto: true } }))?.monto ?? null;
  globalGuardado = true;
  await base().cobroPlataformaTarifa.upsert({
    where: { id: true },
    create: { id: true, monto: new Prisma.Decimal("500.00") },
    update: { monto: new Prisma.Decimal("500.00") },
  });

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  empresaA = (await altaDeEmpresa("A", `sl45-maestro-a-${randomUUID().slice(0, 8)}@example.test`)).empresa;
  empresaB = (await altaDeEmpresa("B", `sl45-maestro-b-${randomUUID().slice(0, 8)}@example.test`)).empresa;
  for (const e of [a(), b()]) await prepararAcceso(base(), e, userAgent);
  await sembrarCaja(base(), a().organizacionId, CAJA_A);
  await sembrarSaldoInicial(base(), a(), "10000.00");
  await sembrarCaja(base(), b().organizacionId, CAJA_B);

  contextoA = await browser.newContext({ userAgent });
  paginaA = await entrarComoMaestro(contextoA, a());
  contextoB = await browser.newContext({ userAgent });
  paginaB = await entrarComoMaestro(contextoB, b());

  contextoSa = await browser.newContext();
  sa = await contextoSa.newPage();
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(base(), SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(sa!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });
});

test.afterAll(async () => {
  await contextoSa?.close();
  await contextoA?.close();
  await contextoB?.close();
  // El valor global, como estaba antes de este spec. Lo demás es de las empresas de esta corrida.
  if (dueno && globalGuardado) {
    if (globalAntes === null) {
      await dueno.cobroPlataformaTarifa.deleteMany({});
    } else {
      await dueno.cobroPlataformaTarifa.upsert({
        where: { id: true },
        create: { id: true, monto: globalAntes },
        update: { monto: globalAntes },
      });
    }
  }
  await dueno?.$disconnect();
});

/* -------------------------------------------------------------------------- */
/* La wallet                                                                   */
/* -------------------------------------------------------------------------- */

function tarjetaCaja(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-bolsillo="empresa"]') });
}

/** La región de la deuda, en cualquier estado: su rótulo cambia con «a favor». */
function regionDeuda(page: Page): Locator {
  return tarjetaCaja(page).locator('[data-region="deuda_plataforma"]');
}

async function primerImporte(region: Locator): Promise<string> {
  const span = region.locator(".tabular-nums").first();
  await expect(span).toBeVisible();
  return (await span.innerText()).trim();
}

async function datoSecundario(card: Locator, rotulo: string): Promise<string> {
  const valor = card.locator(`div:has(> span:text-is("${rotulo}")) > span`).nth(1);
  await expect(valor).toBeVisible();
  return (await valor.innerText()).trim();
}

interface Cifras {
  principal: string;
  entro: string;
  salio: string;
  ganancia: string;
}

async function leerCifras(page: Page): Promise<Cifras> {
  const card = tarjetaCaja(page);
  return {
    principal: await primerImporte(card.locator("section").first()),
    entro: await datoSecundario(card, "Entró"),
    salio: await datoSecundario(card, "Salió"),
    ganancia: await primerImporte(card.getByRole("region", { name: "Ganancia de la empresa", exact: true })),
  };
}

async function abrirWallet(page: Page): Promise<void> {
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(tarjetaCaja(page)).toHaveCount(1, { timeout: 60_000 });
}

/** Una recarga borraría esta marca: si sigue al final, la pantalla se actualizó sola. */
async function marcarSinRecarga(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __sl45?: string }).__sl45 = "sin-recarga";
  });
}

async function sinRecarga(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as { __sl45?: string }).__sl45);
}

/** Pulsa el botón de la región y devuelve el diálogo abierto. */
async function abrirPago(page: Page): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await abrirCon(regionDeuda(page).getByRole("button", { name: TEXTO.boton, exact: true }), dialog);
  return dialog;
}

async function llenarPago(dialog: Locator, monto: string, referencia: string): Promise<void> {
  await dialog.getByLabel(/^Monto/).fill(monto);
  await dialog.getByLabel(/^Referencia del pago/).fill(referencia);
  await dialog.getByRole("button", { name: "Registrar", exact: true }).click();
}

async function pagar(page: Page, monto: string, referencia: string): Promise<void> {
  const dialog = await abrirPago(page);
  await expect(dialog.getByRole("radio", { name: TEXTO.concepto })).toBeChecked();
  await llenarPago(dialog, monto, referencia);
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

function resumen(c: Cifras, deuda: string): string {
  return `principal=${c.principal} entro=${c.entro} salio=${c.salio} ganancia=${c.ganancia} deuda=${deuda}`;
}

test("1. A debe ₡1.000 de su factura cerrada, el botón abre el pago elegido, paga 600 y la región no baja; 500 no pasa (R1, R4, R5, R8, R9; SLT-60 R1, R2, R35–R37)", async ({}, info) => {
  test.setTimeout(240_000);
  const page = paginaA!;
  // Las cifras de B antes de que A pague nada: el paso 6 las compara.
  await abrirWallet(paginaB!);
  cajaInicialB = await leerCifras(paginaB!);
  ordenes = await crearOrdenes(base(), a(), 2);
  // SLT-60 R3: sin factura cerrada no hay nada que pagar. El total sale de la fila: las dos órdenes a 500,00.
  facturaA = await cerrarFacturaEnCurso(base(), a());
  console.log(`MEDIDO factura cerrada de A: total=${facturaA.total}`);
  expect(facturaA.total).toBe("1000.00");

  await abrirWallet(page);
  const region = regionDeuda(page);
  await expect(region).toHaveAttribute("aria-label", TEXTO.rotuloDebe);
  await expect(region).toContainText(TEXTO.rotuloDebe);
  await expect(region).toContainText(TEXTO.pistaDebe);
  await expect(region.getByRole("button", { name: TEXTO.boton, exact: true })).toBeVisible();
  const antes = await leerCifras(page);
  const deudaAntes = await primerImporte(region);
  console.log(`MEDIDO A antes: ${resumen(antes, deudaAntes)}`);
  expect(deudaAntes).toBe(PINTADO.mil);
  expect(antes.principal).toBe(PINTADO.principal);
  expect(antes.ganancia).toBe(PINTADO.ganancia);
  expect(antes.salio).toBe(PINTADO.salio);

  await marcarSinRecarga(page);

  // R4: el diálogo abre con el pago elegido y su frase (SLT-60 R37).
  const dialog = await abrirPago(page);
  await expect(dialog.getByRole("radio", { name: TEXTO.concepto })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Gasto de la empresa" })).not.toBeChecked();
  await expect(dialog).toContainText(TEXTO.efecto);
  await page.screenshot({ path: capturaEn(info, "sl45-dialogo.png"), fullPage: true });
  await llenarPago(dialog, "600", "SL-45 transferencia 600");
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  // R5, R8: la cifra principal baja 600 sin recargar, «Salió» sube 600 y la ganancia baja 600. SLT-60 R7: la
  // deuda NO baja al registrar; baja al confirmar.
  await expect(tarjetaCaja(page).locator("section").first().locator(".tabular-nums").first()).toHaveText(
    PINTADO.principalTras600,
    { timeout: 30_000 },
  );
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.mil);
  await expect(region).toContainText(TEXTO.pistaDebe);
  const tras600 = await leerCifras(page);
  console.log(`MEDIDO A tras pagar 600: ${resumen(tras600, await primerImporte(region))}`);
  expect(tras600.principal).toBe(PINTADO.principalTras600);
  expect(tras600.salio).toBe(PINTADO.salioTras600);
  expect(tras600.ganancia).toBe(PINTADO.gananciaTras600);
  expect(await sinRecarga(page)).toBe("sin-recarga");
  expect(await pagosEnElLibro(base(), a())).toEqual(["egreso:600.00"]);
  await page.screenshot({ path: capturaEn(info, "sl45-region-tras-pagar.png"), fullPage: true });

  // R9, SLT-60 R2 y R36: lo disponible es 1.000 − 600 por confirmar = 400; 500 lo supera. El error va bajo el
  // monto y no se escribe nada.
  const otro = await abrirPago(page);
  await llenarPago(otro, "500", "SL-45 transferencia 500");
  const monto = otro.getByLabel(/^Monto/);
  await expect(monto).toHaveAttribute("aria-invalid", "true");
  await expect(monto).toHaveAccessibleDescription(new RegExp(TEXTO.errorTope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect(otro).toBeVisible();
  expect(await pagosEnElLibro(base(), a())).toEqual(["egreso:600.00"]);
  await page.keyboard.press("Escape");
  await expect(otro).toBeHidden();
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.mil);
});

/* -------------------------------------------------------------------------- */
/* «Empresas» del superadmin                                                    */
/* -------------------------------------------------------------------------- */

function celdaPlataforma(page: Page, e: Empresa): Locator {
  return page.getByRole("table").locator("tbody tr").filter({ hasText: e.slug }).locator("[data-estado-plataforma]");
}

test("2. el superadmin ve «Debe ₡1.000 · Pagado ₡0 · 1 pago por confirmar» en A y «Al día · Pagado ₡0» en B (R28; SLT-60 R7, R27)", async ({}, info) => {
  test.setTimeout(120_000);
  const page = sa!;
  await page.goto("/plataforma/empresas");
  await expect(page.getByRole("columnheader", { name: "Plataforma", exact: true })).toBeVisible();
  const celdaA = celdaPlataforma(page, a());
  const celdaB = celdaPlataforma(page, b());
  await expect(celdaA).toHaveCount(1);
  await expect(celdaA).toHaveAttribute("data-estado-plataforma", "debe");
  // «Pagado» cuenta solo los confirmados; el pago de 600 sale como por confirmar.
  await expect(celdaA).toHaveText(`Debe ${PINTADO.mil}Pagado ${PINTADO.cero}${TEXTO.unPagoPorConfirmar}`);
  await expect(celdaB).toHaveAttribute("data-estado-plataforma", "al_dia");
  await expect(celdaB).toHaveText(`Al díaPagado ${PINTADO.cero}`);
  console.log(`MEDIDO Empresas (1): A=«${await celdaA.innerText()}» B=«${await celdaB.innerText()}»`);
  await page.screenshot({ path: capturaEn(info, "sl45-empresas-debe.png"), fullPage: true });
});

test("3. A anula el pago por confirmar desde el libro: la caja vuelve sin recargar y la región sigue en ₡1.000 (R5, R15, R23; SLT-60 R9)", async ({}, info) => {
  test.setTimeout(180_000);
  const page = paginaA!;
  await abrirWallet(page);
  const region = regionDeuda(page);
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.mil);
  await marcarSinRecarga(page);

  // R23: el libro lo nombra «Pago a la plataforma» y su «Ver» ofrece «Anular…».
  const ver = page.getByRole("button", { name: new RegExp(`^Ver «${TEXTO.concepto}» del .* por ${PINTADO.seiscientos}$`) });
  await expect(ver).toHaveCount(1);
  const panel = page.getByRole("dialog", { name: TEXTO.concepto });
  await abrirCon(ver, panel);
  await panel.getByRole("button", { name: "Anular…", exact: true }).click();
  const anular = page.getByRole("dialog", { name: /^Anular / });
  await expect(anular).toBeVisible();
  await anular.getByLabel(/^Motivo de la anulación/).fill(TEXTO.motivo);
  await anular.getByRole("button", { name: "Anular", exact: true }).click();
  await expect(anular).toBeHidden({ timeout: 30_000 });
  await page.keyboard.press("Escape");

  // R5 y R15: la cifra principal y la ganancia vuelven a las de antes sin recargar. SLT-60: el pago no estaba
  // confirmado, así que la deuda no se movió al pagar ni se mueve al anular.
  await expect(tarjetaCaja(page).locator("section").first().locator(".tabular-nums").first()).toHaveText(
    PINTADO.principal,
    { timeout: 30_000 },
  );
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.mil);
  const tras = await leerCifras(page);
  console.log(`MEDIDO A tras anular: ${resumen(tras, await primerImporte(region))}`);
  expect(tras.principal).toBe(PINTADO.principal);
  expect(tras.ganancia).toBe(PINTADO.ganancia);
  await expect(region).toContainText(TEXTO.pistaDebe);
  expect(await sinRecarga(page)).toBe("sin-recarga");
  // Nada se borra: el pago sigue, con su constancia y el motivo, y un contra-asiento por su monto.
  expect(await pagosEnElLibro(base(), a())).toEqual(["egreso:600.00"]);
  const pago = await base().walletMovimiento.findFirstOrThrow({
    where: { organizacionId: a().organizacionId, categoria: "egreso_pago_plataforma" },
    select: { id: true },
  });
  const constancia = await base().ajusteCajaAnulacion.findUniqueOrThrow({
    where: { movimientoId: pago.id },
    select: { motivo: true },
  });
  expect(constancia.motivo).toBe(TEXTO.motivo);
  const contra = await base().walletMovimiento.findMany({
    where: { origenTipo: "gasto", origenId: pago.id },
    select: { tipo: true, categoria: true, monto: true },
  });
  expect(contra.map((c) => `${c.tipo}:${c.categoria}:${c.monto.toFixed(2)}`)).toEqual(["ingreso:ingreso_ajuste:600.00"]);
  await page.screenshot({ path: capturaEn(info, "sl45-region-anulado.png"), fullPage: true });
});

test("4. A paga los ₡1.000, la región no baja hasta confirmar y queda al día sin botón; se elimina una orden y queda ₡500 a favor (R2, R3; SLT-60 R7)", async ({}, info) => {
  test.setTimeout(180_000);
  const page = paginaA!;
  await abrirWallet(page);
  const region = regionDeuda(page);
  await pagar(page, "1000", "SL-45 transferencia 1000");

  // La caja baja al registrar; la deuda sigue en ₡1.000 mientras el pago está por confirmar.
  await expect(tarjetaCaja(page).locator("section").first().locator(".tabular-nums").first()).toHaveText(
    PINTADO.principalTras1000,
    { timeout: 30_000 },
  );
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.mil);

  // Confirmado el pago, entero contra la factura cerrada: la deuda baja a cero.
  if (!facturaA) throw new Error("no hay factura cerrada de A: falló el paso 1");
  await confirmarComoDueno(base(), a(), facturaA.id);
  await abrirWallet(page);
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.cero, { timeout: 30_000 });
  await expect(region).toHaveAttribute("aria-label", TEXTO.rotuloDebe);
  await expect(region).toContainText(TEXTO.pistaAlDia);
  await expect(region.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: TEXTO.boton, exact: true })).toHaveCount(0);
  const alDia = await leerCifras(page);
  console.log(`MEDIDO A tras pagar y confirmar 1000: ${resumen(alDia, await primerImporte(region))}`);
  expect(alDia.principal).toBe(PINTADO.principalTras1000);

  await eliminarOrden(base(), a(), ordenes[1]!);
  await abrirWallet(page);
  await expect(region).toHaveAttribute("aria-label", TEXTO.rotuloAFavor);
  await expect(region).toContainText(TEXTO.rotuloAFavor);
  await expect(region).toContainText(TEXTO.pistaAFavor);
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.quinientos);
  await expect(region.getByRole("button")).toHaveCount(0);
  console.log(`MEDIDO A a favor: deuda=${await primerImporte(region)}`);
  await page.screenshot({ path: capturaEn(info, "sl45-region-a-favor.png"), fullPage: true });
});

test("5. el superadmin ve «A favor ₡500 · Pagado ₡1.000» en A, sin pagos por confirmar (R28; SLT-60 R27)", async ({}, info) => {
  test.setTimeout(120_000);
  const page = sa!;
  await page.goto("/plataforma/empresas");
  const celdaA = celdaPlataforma(page, a());
  await expect(celdaA).toHaveAttribute("data-estado-plataforma", "a_favor");
  // El pago anulado no cuenta en «Pagado»; el confirmado sí.
  await expect(celdaA).toHaveText(`A favor ${PINTADO.quinientos}Pagado ${PINTADO.mil}`);
  await expect(celdaA.locator("[data-pagos-por-confirmar]")).toHaveCount(0);
  await expect(celdaPlataforma(page, b())).toHaveText(`Al díaPagado ${PINTADO.cero}`);
  console.log(`MEDIDO Empresas (2): A=«${await celdaA.innerText()}»`);
  await page.screenshot({ path: capturaEn(info, "sl45-empresas-a-favor.png"), fullPage: true });
});

test("6. B no ve nada de A: al día, sin pagos en su libro y su caja igual (R20)", async ({}, info) => {
  test.setTimeout(120_000);
  const page = paginaB!;
  await abrirWallet(page);
  const region = regionDeuda(page);
  await expect(region).toContainText(TEXTO.pistaAlDia);
  await expect(region.locator(".tabular-nums").first()).toHaveText(PINTADO.cero);
  await expect(page.getByRole("button", { name: TEXTO.boton, exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: new RegExp(`^Ver «${TEXTO.concepto}»`) })).toHaveCount(0);
  expect(await pagosEnElLibro(base(), b())).toEqual([]);
  const cajaB = await leerCifras(page);
  console.log(`MEDIDO B: ${resumen(cajaB, await primerImporte(region))}`);
  // Las cifras de B, iguales a las que tenía antes del primer pago de A.
  expect(cajaB).toEqual(cajaInicialB);
  await page.screenshot({ path: capturaEn(info, "sl45-wallet-b.png"), fullPage: true });
});
