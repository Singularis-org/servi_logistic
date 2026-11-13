import { randomUUID } from "node:crypto";
import path from "node:path";

import { expect, test, type BrowserContext, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Prisma, type PrismaClient, type RolValue } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { altaDeEmpresa, clienteDueno, prepararAcceso, SINPE_DE_PRUEBA, type Empresa } from "./_dos-empresas-fixture";
import { asignarPlanCustom } from "./_planes-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";
import { CAJA_A, sembrarCaja } from "./_wallet-iva-sl39-siembra";

// SL-40 (T10: la comprobación en el navegador de T7 y T8) — el cobro de la plataforma por orden.
//
// 1. (T8, R9–R11) El superadmin abre «Empresas», fija el valor global en 500,00 y ve el valor nuevo
//    sin recargar: la página lleva una marca en `window` que una recarga borraría. SLT-126 quitó la
//    excepción por empresa: la fila de A no tiene editor (R1), su fuente es «global» y nunca
//    «propio» (R3), y la ayuda del global es la de R4.
// 2. (T7, R21, R22) A crea dos órdenes con el global en 500,00 y elimina una. En `/wallet`, la
//    región «Lo que la empresa debe a la plataforma» pasa de «₡0» a «₡500», y las cifras de la caja
//    son las mismas antes y después.
// 3. (SLT-126 R3) Con un plan custom que fija 300,00 por orden, la fila de A dice «₡300» y «del
//    plan». Va al final: desde ahí las órdenes de A se cobrarían con el plan, no con el global.
//
// Las órdenes se crean y se eliminan con el cliente dueño, con la empresa fijada: el INSERT y el
// UPDATE de `deleted_at` pasan por los triggers de 20261023130200, que son los que escriben los
// cargos por cualquier vía (D3). La caja de A es la de SL-39 más un saldo inicial, para que la
// barra de reparto —y con ella «De la empresa»— se pinte.
//
// Los importes esperados van escritos a mano: son lo que pinta `money` (omite los «,00»). Derivarlos
// con la función de producción los compararía contra su propia fuente.
//
// Corre en el proyecto `aislamiento` (SL-44): Playwright levanta el servidor sin SMTP, con
// `AUTH_OTP_DEBUG_LOG=1` y su log en `E2E_LOG_SERVIDOR` (el OTP del superadmin sale de ahí), sobre
// una base local migrada y con `pnpm run db:seed`. `SL40_CAPTURAS` es la carpeta de las capturas;
// sin ella van a la salida del test.
//
// El valor GLOBAL del cobro es de toda la plataforma: el `beforeAll` lo guarda y lo deja «sin
// configurar» (el paso 1 parte de ahí), y el `afterAll` lo devuelve a lo que había, para que otro
// spec o una segunda corrida sobre la misma base no hereden el 500,00 de este. Quitarlo no tiene
// pantalla (la de «Empresas» solo fija un valor): es una excepción de R8 de SL-44 (`design.md > D4`).

test.describe.configure({ mode: "serial" });

const EMPRESA_EN_FRASE = "la empresa";

const TEXTO = {
  regionCobro: "Cobro por orden",
  valorGlobal: "Valor global",
  sinConfigurar: "Valor global: Sin configurar (0,00)",
  guardado: "Cobro guardado.",
  /** SLT-126 R4: la ayuda del valor global, exacta. */
  ayudaGlobal:
    "Se aplica a cada orden de las empresas cuyo plan no fija un cobro por orden. Las órdenes ya creadas conservan su importe.",
  /** SLT-126 R3: las dos fuentes que quedan; «propio» no sale nunca. */
  fuenteGlobal: "global",
  fuenteDelPlan: "del plan",
  fuentePropia: "propio",
  regionDeuda: `Lo que ${EMPRESA_EN_FRASE} debe a la plataforma`,
  pistaDeuda:
    "Lo que la plataforma cobra por las órdenes de la empresa (al crearlas o, con plan porcentual, al llegar a un estado final), menos las anuladas y los pagos ya confirmados. Cuando la empresa le pague, el pago se registra con «Registrar pago a la plataforma»: sale de la caja al registrarlo y baja esta deuda cuando la plataforma lo confirma.",
  /** SL-45 R2: con deuda cero la región dice que la empresa está al día. */
  pistaAlDia: "La empresa está al día con la plataforma. Cada orden suma su cobro aquí cuando se cobra.",
} as const;

/** Lo que la tarifa vale en pantalla: `money("500.00")` y `money("300.00")`, escritos a mano. */
const PINTADO = { global: "₡500", delPlan: "₡300", deudaCero: "₡0", deudaDos: "₡1.000", deudaUna: "₡500" } as const;

/** SLT-126 R3: el costo por orden del plan custom de A en el paso 3, distinto del global. */
const COSTO_DEL_PLAN = "300.00";

let dueno: PrismaClient | undefined;
let empresaA: Empresa | undefined;
let contextoSa: BrowserContext | undefined;
let sa: Page | undefined;
let contextoA: BrowserContext | undefined;
let paginaA: Page | undefined;
let ordenes: string[] = [];
/** El valor global del cobro al empezar (`null`: sin configurar), para devolverlo en el `afterAll`. */
let globalAntes: Prisma.Decimal | null = null;
let globalGuardado = false;

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function empresa(): Empresa {
  if (!empresaA) throw new Error("no hay alta de A: falló el beforeAll");
  return empresaA;
}

function capturaEn(info: TestInfo, nombre: string): string {
  const carpeta = process.env.SL40_CAPTURAS;
  return carpeta ? path.join(carpeta, nombre) : info.outputPath(nombre);
}

/** Un saldo inicial vigente: con él la caja pasa a «saldo» y pinta la barra con «De la empresa». */
async function sembrarSaldoInicial(db: PrismaClient, e: Empresa, monto: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    const aporte = await tx.aporteCapital.create({
      data: {
        claveIdempotencia: randomUUID(),
        clase: "saldo_inicial",
        monto: new Prisma.Decimal(monto),
        motivo: "SL-40: saldo inicial del recorrido",
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
        descripcion: "SL-40: saldo inicial del recorrido",
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
      throw new Error("SL-40: faltan catálogos o geografía (¿base sin migrar o sin `pnpm run db:seed`?)");
    }
    const zona = await tx.zona.create({
      data: { nombre: `Zona SL40 ${s}`, sinpeNumero: SINPE_DE_PRUEBA, sinpeNombre: "Titular SL40", sinpeRevisadoAt: new Date() },
      select: { id: true },
    });
    const tienda = await tx.usuario.create({
      data: {
        nombre: `Tienda SL40 ${s}`,
        primerApellido: "SL40",
        email: `sl40-tienda-${s}@example.test`,
        telefono: "88880000",
        passwordHash: "x",
        cedula: `sl40-${s}`,
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
          numRemision: `SL40-${s}-${i}`,
          destinatario: `Destinatario SL40 ${i}`,
          telefonoDest: "88881111",
          producto: `Producto SL40 ${i}`,
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

/** La anulación de D6: `deleted_at` con valor, que el trigger de UPDATE convierte en un reverso. */
async function eliminarOrden(db: PrismaClient, e: Empresa, ordenId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    await tx.orden.update({ where: { id: ordenId }, data: { deletedAt: new Date() } });
  });
}

/** Los cargos y reversos de A, leídos por detrás con el dueño. */
async function movimientosDeA(db: PrismaClient): Promise<string[]> {
  const filas = await db.cobroPlataformaMovimiento.findMany({
    where: { organizacionId: empresa().organizacionId },
    orderBy: [{ ocurridoAt: "asc" }, { secuencia: "asc" }],
    select: { ordenId: true, tipo: true, monto: true },
  });
  return filas.map((f) => `${ordenes.indexOf(f.ordenId)}:${f.tipo}:${f.monto.toFixed(2)}`);
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(base()));
  // El paso 1 parte del valor global sin configurar; el `afterAll` devuelve el que había.
  globalAntes = (await base().cobroPlataformaTarifa.findUnique({ where: { id: true }, select: { monto: true } }))?.monto ?? null;
  globalGuardado = true;
  await base().cobroPlataformaTarifa.deleteMany({});

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  const email = `sl40-maestro-a-${randomUUID().slice(0, 8)}@example.test`;
  empresaA = (await altaDeEmpresa("A", email)).empresa;
  await prepararAcceso(base(), empresa(), userAgent);
  await sembrarCaja(base(), empresa().organizacionId, CAJA_A);
  await sembrarSaldoInicial(base(), empresa(), "10000.00");

  contextoA = await browser.newContext({ userAgent });
  paginaA = await contextoA.newPage();
  await paginaA.goto("/login");
  await paginaA.fill('input[type="email"]', empresa().email);
  await paginaA.fill('input[type="password"]', empresa().password);
  await paginaA.click('button[type="submit"]');
  await paginaA.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });

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
  // El valor global, como estaba antes de este spec. Lo demás es de la empresa A de esta corrida.
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
/* 1. «Empresas»                                                               */
/* -------------------------------------------------------------------------- */

function filaDeA(page: Page): Locator {
  return page.getByRole("table").locator("tbody tr").filter({ hasText: empresa().slug });
}

async function sinRecarga(page: Page): Promise<string | undefined> {
  return page.evaluate(() => (window as unknown as { __sl40?: string }).__sl40);
}

/**
 * SLT-126 R1: ninguna fila ofrece fijar, cambiar ni quitar el cobro por orden de su empresa. Se mira la
 * tabla entera, no solo la fila de A: el bloque del global (con su campo) queda fuera de la tabla.
 */
async function sinEditorPorFila(page: Page): Promise<void> {
  const tabla = page.getByRole("table");
  await expect(tabla.getByRole("button", { name: /^Cambiar( · .*)?$/ })).toHaveCount(0);
  await expect(tabla.getByRole("button", { name: "Usar el global", exact: true })).toHaveCount(0);
  await expect(tabla.getByRole("textbox")).toHaveCount(0);
  await expect(tabla.getByRole("form", { name: new RegExp(`^${TEXTO.regionCobro} · `) })).toHaveCount(0);
}

test("T8: el superadmin fija el global y lo ve sin recargar; la fila no tiene editor (R9–R11; SLT-126 R1, R3, R4)", async ({}, info) => {
  test.setTimeout(180_000);
  const page = sa!;
  await page.goto("/plataforma/empresas");
  const bloque = page.getByRole("region", { name: TEXTO.regionCobro, exact: true });
  await expect(bloque).toContainText(TEXTO.sinConfigurar);
  // SLT-126 R4: la ayuda del valor global, exacta, y como descripción accesible de su campo.
  const campoGlobal = bloque.getByRole("textbox", { name: TEXTO.valorGlobal, exact: true });
  await expect(bloque.getByText(TEXTO.ayudaGlobal, { exact: true })).toBeVisible();
  await expect(campoGlobal).toHaveAccessibleDescription(TEXTO.ayudaGlobal);
  const fila = filaDeA(page);
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(PINTADO.deudaCero);
  // SLT-126 R3: el global sin configurar se rotula «global»; «propio» no sale en ninguna fila.
  await expect(fila.getByText(TEXTO.fuenteGlobal, { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByText(TEXTO.fuentePropia, { exact: true })).toHaveCount(0);
  // SLT-126 R1.
  await sinEditorPorFila(page);

  // Una recarga borraría esta marca: si sigue al final, cada valor llegó sin recargar a mano.
  await page.evaluate(() => {
    (window as unknown as { __sl40?: string }).__sl40 = "sin-recarga";
  });

  // El global en 500,00.
  await campoGlobal.fill("500.00");
  await bloque.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(bloque.getByRole("status")).toHaveText(TEXTO.guardado);
  await expect(bloque).toContainText(`${TEXTO.valorGlobal}: ${PINTADO.global}`);
  await expect(fila).toContainText(PINTADO.global);
  await expect(fila.getByText(TEXTO.fuenteGlobal, { exact: true })).toBeVisible();
  expect((await base().cobroPlataformaTarifa.findUnique({ where: { id: true } }))?.monto.toFixed(2)).toBe("500.00");

  // SLT-126 R1, R3, R4: tras guardar el global, la fila sigue sin editor y la ayuda no cambia.
  await sinEditorPorFila(page);
  await expect(page.getByRole("table").getByText(TEXTO.fuentePropia, { exact: true })).toHaveCount(0);
  await expect(campoGlobal).toHaveAccessibleDescription(TEXTO.ayudaGlobal);

  expect(await sinRecarga(page)).toBe("sin-recarga");
  await page.screenshot({ path: capturaEn(info, "sl40-empresas.png"), fullPage: true });
});

/* -------------------------------------------------------------------------- */
/* 2. La wallet de A                                                           */
/* -------------------------------------------------------------------------- */

interface Caja {
  principal: string;
  entro: string;
  salio: string;
  ganancia: string;
  iva: string;
  capital: string;
  tiendas: string;
  /** «De la empresa» de la barra de reparto (nombre accesible del `role="img"`). */
  deEmpresa: string;
  /** El texto entero de la tarjeta de la caja, sin la región de la deuda. */
  textoCaja: string;
  /** El texto entero de «Cómo se compone la ganancia de la empresa». */
  textoComposicion: string;
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

function tarjetaCaja(page: Page): Locator {
  return page.locator('[data-slot="card"]').filter({ has: page.locator('[data-bolsillo="empresa"]') });
}

function regionDeuda(page: Page): Locator {
  return tarjetaCaja(page).getByRole("region", { name: TEXTO.regionDeuda, exact: true });
}

async function abrirWallet(page: Page): Promise<void> {
  const r = await page.goto("/wallet", { waitUntil: "load", timeout: 180_000 });
  expect(r?.status()).toBeLessThan(400);
  await expect(tarjetaCaja(page)).toHaveCount(1, { timeout: 60_000 });
}

async function leerCaja(page: Page): Promise<Caja> {
  const card = tarjetaCaja(page);
  const principal = card.locator("section").first();
  const barra = card.getByRole("img");
  await expect(barra, "la barra de reparto: hace falta el saldo inicial").toHaveCount(1);
  const nombreBarra = (await barra.getAttribute("aria-label")) ?? "";
  const deEmpresa = new RegExp(`De ${EMPRESA_EN_FRASE}: (\\S+)`).exec(nombreBarra)?.[1] ?? "";
  const composicion = page
    .locator('[data-slot="card"]')
    .filter({ hasText: `Cómo se compone la ganancia de ${EMPRESA_EN_FRASE}` });
  await expect(composicion).toHaveCount(1);

  return {
    principal: `${await principal.getAttribute("aria-label")} ${await primerImporte(principal)}`,
    entro: await datoSecundario(card, "Entró"),
    salio: await datoSecundario(card, "Salió"),
    ganancia: await primerImporte(card.getByRole("region", { name: `Ganancia de ${EMPRESA_EN_FRASE}`, exact: true })),
    iva: await primerImporte(card.getByRole("region", { name: "IVA cobrado", exact: true })),
    capital: await primerImporte(card.getByRole("region", { name: "Saldo inicial y aportes", exact: true })),
    tiendas: await primerImporte(
      card.getByRole("region", { name: `Lo que ${EMPRESA_EN_FRASE} les debe a las tiendas`, exact: true }),
    ),
    deEmpresa,
    textoCaja: await card.evaluate((el) => {
      const copia = el.cloneNode(true) as HTMLElement;
      copia.querySelector('[data-region="deuda_plataforma"]')?.remove();
      return copia.textContent ?? "";
    }),
    textoComposicion: (await composicion.textContent()) ?? "",
  };
}

async function leerDeuda(page: Page): Promise<string> {
  const region = regionDeuda(page);
  await expect(region, "la región de la deuda con la plataforma").toHaveCount(1);
  const importe = await primerImporte(region);
  await expect(region).toContainText(importe === PINTADO.deudaCero ? TEXTO.pistaAlDia : TEXTO.pistaDeuda);
  return importe;
}

function resumen(c: Caja): string {
  return `principal=${c.principal} entro=${c.entro} salio=${c.salio} ganancia=${c.ganancia} iva=${c.iva} capital=${c.capital} tiendas=${c.tiendas} deEmpresa=${c.deEmpresa}`;
}

test("T7: A crea dos órdenes y elimina una; la deuda dice ₡500 y la caja no cambia (R21, R22)", async ({}, info) => {
  test.setTimeout(240_000);
  const page = paginaA!;

  await abrirWallet(page);
  const antes = await leerCaja(page);
  const deudaAntes = await leerDeuda(page);
  console.log(`MEDIDO antes: ${resumen(antes)} deuda=${deudaAntes}`);
  expect(deudaAntes).toBe(PINTADO.deudaCero);
  // La caja tiene dinero: sin él, «igual antes y después» no probaría nada.
  expect(antes.ganancia).toBe("₡1.700");
  expect(antes.capital).not.toBe(PINTADO.deudaCero);

  ordenes = await crearOrdenes(base(), empresa(), 2);
  expect(await movimientosDeA(base())).toEqual(["0:cargo:500.00", "1:cargo:500.00"]);
  await abrirWallet(page);
  const deudaDos = await leerDeuda(page);
  const conDos = await leerCaja(page);
  console.log(`MEDIDO con dos: ${resumen(conDos)} deuda=${deudaDos}`);
  expect(deudaDos).toBe(PINTADO.deudaDos);

  await eliminarOrden(base(), empresa(), ordenes[1]!);
  expect(await movimientosDeA(base())).toEqual(["0:cargo:500.00", "1:cargo:500.00", "1:reverso:500.00"]);
  await abrirWallet(page);
  const deudaDespues = await leerDeuda(page);
  const despues = await leerCaja(page);
  console.log(`MEDIDO despues: ${resumen(despues)} deuda=${deudaDespues}`);
  expect(deudaDespues).toBe(PINTADO.deudaUna);

  // R22: ni una cifra de la caja se movió, ni con dos cargos ni con el reverso.
  expect(conDos).toEqual(antes);
  expect(despues).toEqual(antes);

  // Sin insignia de signo: una deuda no es «Positivo» ni «Negativo» para la caja.
  await expect(regionDeuda(page).getByText(/^(Positivo|Negativo|En cero)$/)).toHaveCount(0);
  await page.screenshot({ path: capturaEn(info, "sl40-wallet.png"), fullPage: true });
});

/* -------------------------------------------------------------------------- */
/* 3. La fuente «del plan» (SLT-126)                                           */
/* -------------------------------------------------------------------------- */

test("SLT-126 R3: con un plan que fija el cobro por orden, la fila de A dice su importe y «del plan»; R1 sigue sin editor", async ({}, info) => {
  test.setTimeout(180_000);
  // El plan se asigna con `PlanesRepository` real, como lo hace el superadmin (`_planes-fixture`).
  await asignarPlanCustom(base(), empresa().organizacionId, COSTO_DEL_PLAN);
  const page = sa!;
  await page.goto("/plataforma/empresas");
  const fila = filaDeA(page);
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(PINTADO.delPlan);
  await expect(fila.getByText(TEXTO.fuenteDelPlan, { exact: true })).toBeVisible();
  await expect(fila.getByText(TEXTO.fuenteGlobal, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("table").getByText(TEXTO.fuentePropia, { exact: true })).toHaveCount(0);
  await sinEditorPorFila(page);
  // SLT-126 R4: el bloque del global no cambia con el plan de una empresa.
  await expect(
    page.getByRole("region", { name: TEXTO.regionCobro, exact: true }).getByText(TEXTO.ayudaGlobal, { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: capturaEn(info, "slt126-empresas-del-plan.png"), fullPage: true });
});
