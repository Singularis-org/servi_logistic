import { randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";

import { altaDeEmpresa, clienteDueno, prepararAcceso, type Empresa, type Letra } from "./_dos-empresas-fixture";
import { CAJA_A, CAJA_B, importeDeTexto, sembrarCaja, sembrarCierres, type CierresSembrados } from "./_wallet-iva-sl39-siembra";

// SL-39 (T5, C2, T7) — el recorrido en el navegador: el IVA cobrado va aparte de la ganancia, en
// `/wallet` y en el detalle del cierre de `cierres-admin`, con dos empresas.
//
// SOLO CORRE CON `SL39_UI=1`: necesita una base local migrada, con `pnpm run db:seed` y un dev
// server levantado aparte. El E2E de CI no tiene esa siembra.
//
// Cifras ESCRITAS A MANO (design §1 y §12.4): son el contrato. Derivarlas con las funciones de
// produccion las compararia contra su propia fuente.
//   A, caja: cod 20000 · flete 2500 + IVA 325 · comision 700 + IVA 91 · pago al mensajero 1500
//     → IVA cobrado 325 + 91 = 416,00 · ganancia (2500 + 700) − 1500 = 1.700,00
//   B, caja: cod 500 · flete 40 + IVA 5,20 · IVA de la comision 1,30
//     → IVA cobrado 6,50 · ganancia 40,00
//   Cierre A (entrega): facturado 3.616,00 · IVA 416,00 · pago 1.500,00 → neto 1.700,00
//   Cierre B (rechazo): flete devuelto 2000 + IVA 260 · pago 2.100,00 → «Debe» −100,00

test.skip(process.env.SL39_UI !== "1", "SL-39: recorrido local, solo con SL39_UI=1 y su siembra");
test.describe.configure({ mode: "serial" });

const EMPRESA_EN_FRASE = "la empresa";

let dueno: ReturnType<typeof clienteDueno> | undefined;
const empresas: Partial<Record<Letra, Empresa>> = {};
const cookies: Partial<Record<Letra, Awaited<ReturnType<BrowserContext["cookies"]>>>> = {};
let cierres: CierresSembrados | undefined;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();

  const ctx0 = await browser.newContext();
  const userAgent = await (await ctx0.newPage()).evaluate(() => navigator.userAgent);
  await ctx0.close();

  for (const letra of ["A", "B"] as const) {
    const email = `sl39-maestro-${letra.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
    const { empresa } = await altaDeEmpresa(letra, email);
    empresas[letra] = empresa;
    await prepararAcceso(dueno, empresa, userAgent);
  }
  await sembrarCaja(dueno, empresa("A").organizacionId, CAJA_A);
  await sembrarCaja(dueno, empresa("B").organizacionId, CAJA_B);
  cierres = await sembrarCierres(dueno, empresa("A").organizacionId);

  for (const letra of ["A", "B"] as const) {
    cookies[letra] = await iniciarSesion(browser, userAgent, empresa(letra));
  }
});

test.afterAll(async () => {
  // La base es desechable: no se borra nada.
  await dueno?.$disconnect();
});

function empresa(letra: Letra): Empresa {
  const e = empresas[letra];
  if (!e) throw new Error(`no hay alta de ${letra}: fallo el beforeAll`);
  return e;
}

async function iniciarSesion(browser: Browser, userAgent: string, e: Empresa) {
  const ctx = await browser.newContext({ userAgent });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.fill('input[type="email"]', e.email);
  await p.fill('input[type="password"]', e.password);
  await p.click('button[type="submit"]');
  await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 120_000 });
  const c = await ctx.cookies();
  await ctx.close();
  return c;
}

async function abrirComo(letra: Letra, page: Page, ruta: string): Promise<void> {
  const sesion = cookies[letra];
  expect(sesion?.length ?? 0, `no hay sesion de ${letra}`).toBeGreaterThan(0);
  await page.context().addCookies(sesion ?? []);
  const r = await page.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  expect(r?.status(), `${ruta} de ${letra}`).toBeLessThan(400);
}

/** Lo que se leyo del DOM tal cual, para el informe del recorrido. */
const pintado: string[] = [];

/** El primer importe (`.tabular-nums`) de una region, en forma decimal. */
async function importe(region: Locator): Promise<string> {
  return leerImporte(region.locator(".tabular-nums").first());
}

/** Un nodo que ES el importe. */
async function leerImporte(span: Locator): Promise<string> {
  await expect(span).toBeVisible();
  const texto = (await span.innerText()).trim();
  pintado.push(texto);
  return importeDeTexto(texto);
}

interface Lectura {
  iva: string;
  ivaBadge: string;
  ganancia: string;
  totalIva: string;
  pieGanancia: string;
  ivaBloqueTitulo: string;
}

/** Lo que el SL-39 pinta en `/wallet`: la region del IVA, la ganancia y la tarjeta de la composicion. */
async function leerWallet(page: Page): Promise<Lectura> {
  const empresaBolsillo = page.locator('[data-bolsillo="empresa"]');
  await expect(empresaBolsillo).toHaveCount(1);

  const regionIva = empresaBolsillo.getByRole("region", { name: "IVA cobrado", exact: true });
  await expect(regionIva, "la region «IVA cobrado» del bolsillo de la empresa").toHaveCount(1);
  const regionGanancia = empresaBolsillo.getByRole("region", {
    name: `Ganancia de ${EMPRESA_EN_FRASE}`,
    exact: true,
  });
  await expect(regionGanancia).toHaveCount(1);

  const tarjeta = page
    .getByText(`Cómo se compone la ganancia de ${EMPRESA_EN_FRASE}`, { exact: true })
    .locator('xpath=ancestor::*[.//*[@data-bloque="iva"]][1]');
  await expect(tarjeta).toHaveCount(1);
  const bloque = tarjeta.locator('[data-bloque="iva"]');
  const totalIva = bloque.locator("div", { has: page.locator("dt", { hasText: /^Total del IVA$/ }) }).last();
  await expect(totalIva).toHaveCount(1);
  const pie = tarjeta.locator(":scope > *").last();
  await expect(pie).toContainText(`Ganancia de ${EMPRESA_EN_FRASE}`);

  return {
    iva: await importe(regionIva),
    ivaBadge: (await regionIva.getByText(/^(Positivo|Negativo|En cero)$/).first().innerText()).trim(),
    ganancia: await importe(regionGanancia),
    totalIva: await leerImporte(totalIva.locator("dd")),
    pieGanancia: await importe(pie),
    ivaBloqueTitulo: (await bloque.locator(":scope > *").first().innerText()).trim(),
  };
}

/** Las lineas de una cascada o bloque de renglones: [rotulo, importe, notas]. */
async function lineas(region: Locator): Promise<{ label: string; monto: string; notas: string[] }[]> {
  const crudas = await region.evaluate((el) =>
    Array.from(el.querySelectorAll(".tabular-nums")).map((n) => {
      const fila = n.parentElement;
      const izquierda = fila?.firstElementChild;
      const spans = izquierda ? Array.from(izquierda.children) : [];
      return {
        label: (spans[0]?.textContent ?? "").trim(),
        monto: (n.textContent ?? "").trim(),
        notas: spans.slice(1).map((s) => (s.textContent ?? "").trim()),
      };
    }),
  );
  return crudas.map((l) => ({ ...l, monto: importeDeTexto(l.monto) }));
}

test("SL-39 /wallet de A: IVA cobrado 416,00 aparte y ganancia 1.700,00", async ({ page }) => {
  await abrirComo("A", page, "/wallet");
  const a = await leerWallet(page);
  console.log(`PINTADO A: ${pintado.splice(0).join(" | ")}`);
  console.log(`MEDIDO A: iva=${a.iva} badge=${a.ivaBadge} ganancia=${a.ganancia} totalIva=${a.totalIva} pie=${a.pieGanancia} bloque=«${a.ivaBloqueTitulo}»`);

  expect(a.iva).toBe("416.00"); // 325 + 91, sin los 6,50 de B
  expect(a.ivaBadge).toBe("Positivo");
  expect(a.ganancia).toBe("1700.00"); // (2500 + 700) − 1500, sin el IVA
  expect(a.ivaBloqueTitulo).toBe("IVA cobrado (aparte de la ganancia)");
  expect(a.totalIva).toBe("416.00");
  expect(a.pieGanancia).toBe("1700.00");
});

test("SL-39 /wallet de B: IVA cobrado 6,50 y ganancia 40,00, sin un centimo de A", async ({ page }) => {
  await abrirComo("B", page, "/wallet");
  const b = await leerWallet(page);
  console.log(`PINTADO B: ${pintado.splice(0).join(" | ")}`);
  console.log(`MEDIDO B: iva=${b.iva} badge=${b.ivaBadge} ganancia=${b.ganancia} totalIva=${b.totalIva} pie=${b.pieGanancia}`);

  expect(b.iva).toBe("6.50"); // 5,20 + 1,30 (con los 416 de A daria 422,50)
  expect(b.ganancia).toBe("40.00"); // solo el flete (con A daria 1.740,00)
  expect(b.totalIva).toBe("6.50");
  expect(b.pieGanancia).toBe("40.00");
});

async function abrirCierre(page: Page, mensajero: string): Promise<Locator> {
  const pendientes = page.getByRole("region", { name: "Pendientes de decisión" });
  const fila = pendientes.locator("li").filter({ hasText: mensajero });
  await expect(fila, `el cierre de ${mensajero} en la cola`).toHaveCount(1, { timeout: 60_000 });
  await fila.getByRole("button", { name: "Ver / decidir" }).click();
  const dialogo = page.getByRole("dialog", { name: "Detalle del cierre" });
  await expect(dialogo).toBeVisible({ timeout: 60_000 });
  return dialogo;
}

test("SL-39 cierres-admin de A: la cascada del cierre A resta el IVA facturado 416,00 y el neto es 1.700,00", async ({ page }) => {
  if (!cierres) throw new Error("no hay cierres sembrados");
  await abrirComo("A", page, "/cierres-admin");
  const dialogo = await abrirCierre(page, cierres.mensajeroEntrega);

  const cascada = dialogo.getByRole("region", {
    name: new RegExp(`^Lo que le queda a ${EMPRESA_EN_FRASE} · cierre de ${cierres.mensajeroEntrega}`),
  });
  await expect(cascada).toHaveCount(1);
  const l = await lineas(cascada);
  console.log(`MEDIDO cierre A: ${l.map((x) => `${x.label}=${x.monto}`).join(" | ")}`);

  const i = l.findIndex((x) => x.label === `Lo que ${EMPRESA_EN_FRASE} facturó`);
  expect(i, "«Lo que la empresa facturó» en la cascada").toBeGreaterThanOrEqual(0);
  expect(l[i]?.monto).toBe("3616.00"); // 2500 + 325 + 700 + 91
  expect(l[i + 1]?.label).toBe("IVA facturado"); // justo despues
  expect(l[i + 1]?.monto).toBe("-416.00"); // se resta
  const neto = l.find((x) => x.label === `Neto de ${EMPRESA_EN_FRASE}`);
  expect(neto?.monto).toBe("1700.00"); // 3616 − 416 − 1500
});

test("SL-39 cierres-admin de A: el cierre B (rechazo) «Debe» 100,00 con la nota sin IVA", async ({ page }) => {
  if (!cierres) throw new Error("no hay cierres sembrados");
  await abrirComo("A", page, "/cierres-admin");
  const dialogo = await abrirCierre(page, cierres.mensajeroRechazo);

  const liquidacion = dialogo.getByRole("region", { name: "Liquidación", exact: true });
  await expect(liquidacion).toHaveCount(1);
  const l = await lineas(liquidacion);
  console.log(`MEDIDO cierre B: ${l.map((x) => `${x.label}=${x.monto} [${x.notas.join(" / ")}]`).join(" | ")}`);

  const debe = l.find((x) => x.label === "Debe");
  expect(debe, "la linea «Debe» de la liquidacion").toBeDefined();
  expect(debe?.monto).toBe("-100.00"); // 2000 − 2100, sin los 260 de IVA (con IVA daria +160)
  expect(debe?.notas).toEqual(["Ingreso sin IVA menos el pago al mensajero."]);
});
