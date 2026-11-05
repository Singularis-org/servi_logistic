import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { baseReparto, crearEscenarioReparto, paginaDe, type RepartoE2E } from "./_escenarios/reparto";
import {
  abrirTarifas,
  activarConFaltantes,
  digitarYGuardar,
  elegirNivel,
  elegirOpcion,
  filaDe,
  irAPestana,
  irAZona,
  panelDe,
  zonasDe,
} from "./_tarifas-activacion-fixture";

/**
 * SLT-54 R54, R59, R60, R70 (T6.2) — la pantalla contra la maqueta, con números: cada medida de `design.md > §12`,
 * con `boundingBox()` y ±2 px, en claro y en oscuro, a 1360 y a 390 px, y con 8 vehículos. Cada medida sale al
 * log como `MEDIDA | elemento | maqueta | medido`, y de ahí se copia a la bitácora: se pega lo medido, no lo
 * que debería dar.
 *
 * El catálogo de vehículos es GLOBAL y no tiene borrado en la app: este spec lo ajusta a mano y lo devuelve como
 * estaba en `afterAll`. Es la excepción de los datos sembrados que `docs/verification.md` admite para un ajuste
 * global. Con `workers: 1`, ningún otro spec lo ve a medias.
 */

const TOLERANCIA = 2;
const SEMBRADOS = "zz-e2e-maqueta-";

type Caja = { x: number; y: number; width: number; height: number };

function medida(elemento: string, maqueta: string, medido: string): void {
  console.log(`MEDIDA | ${elemento} | ${maqueta} | ${medido}`);
}

async function caja(l: Locator): Promise<Caja> {
  const c = await l.boundingBox();
  if (c === null) throw new Error("el elemento medido no tiene caja: no está visible");
  return c;
}

const exacto = (valor: number, esperado: number) => expect(Math.abs(valor - esperado)).toBeLessThanOrEqual(TOLERANCIA);
const entero = (n: number) => String(Math.round(n * 10) / 10);

/** Marca el tema oscuro por la cookie real de la app, y exige que se aplicó: si no, se mediría el claro. */
async function paginaEnTema(browser: Browser, r: RepartoE2E, tema: "claro" | "oscuro", viewport = { width: 1360, height: 980 }): Promise<Page> {
  const page = await paginaDe(browser, r.empresa.maestro, { viewport });
  const url = test.info().project.use.baseURL;
  if (url === undefined) throw new Error("el proyecto no tiene baseURL");
  await page.context().addCookies([{ name: "servi_logistic_tema", value: tema, url }]);
  await abrirTarifas(page);
  await expect(page.locator("[data-tema]").first()).toHaveAttribute("data-tema", tema);
  await expect(page.locator("[data-tema].dark")).toHaveCount(tema === "oscuro" ? 1 : 0);
  return page;
}

/** Contraste WCAG del texto sobre su fondo real: compone en un lienzo las capas de sus antepasados. */
async function contraste(l: Locator): Promise<number> {
  return l.evaluate((el) => {
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = 1;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (ctx === null) throw new Error("sin canvas");
    const pintar = (color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return ctx.getImageData(0, 0, 1, 1).data;
    };
    const capas: string[] = [];
    for (let e: Element | null = el; e !== null; e = e.parentElement) capas.unshift(getComputedStyle(e).backgroundColor);
    let fondo = pintar("#ffffff");
    for (const capa of capas) fondo = pintar(capa);
    const copia = [...fondo];
    const texto = pintar(getComputedStyle(el).color);
    const lum = (c: ArrayLike<number>) => {
      const canal = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);
    };
    const [a, b] = [lum(texto), lum(copia)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  });
}

async function medirContraste(elemento: string, l: Locator): Promise<void> {
  await expect(l).toBeVisible();
  const c = await contraste(l);
  medida(`Oscuro, contraste de ${elemento}`, "≥ 4,5", c.toFixed(2));
  expect(c).toBeGreaterThanOrEqual(4.5);
}

async function pagina(page: Page): Promise<{ scroll: number; cliente: number }> {
  return page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    cliente: document.documentElement.clientWidth,
  }));
}

/** R47: el catálogo con `n` activos: apaga los que sobran de los sembrados y crea los que faltan. */
async function catalogoConActivos(n: number): Promise<void> {
  const db = baseReparto();
  const todos = await db.vehiculo.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const originales = todos.filter((v) => !v.name.startsWith(SEMBRADOS));
  const faltan = n - originales.length;
  for (let i = 0; i < faltan; i++) {
    const name = `${SEMBRADOS}${i}`;
    await db.vehiculo.upsert({ where: { name }, update: { activo: true }, create: { name } });
  }
  await db.vehiculo.updateMany({ where: { name: { startsWith: SEMBRADOS, notIn: Array.from({ length: Math.max(faltan, 0) }, (_, i) => `${SEMBRADOS}${i}`) } }, data: { activo: false } });
  const encendidos = originales.slice(0, n).map((v) => v.id);
  await db.vehiculo.updateMany({ where: { id: { in: encendidos } }, data: { activo: true } });
  await db.vehiculo.updateMany({ where: { id: { in: originales.map((v) => v.id).filter((id) => !encendidos.includes(id)) } }, data: { activo: false } });
  expect(await db.vehiculo.count({ where: { activo: true } })).toBe(n);
}

const interruptor = (page: Page) => panelDe(page).getByRole("checkbox", { name: "Pagar distinto por vehículo" });

test.use({ actionTimeout: 30_000 });

test.describe.serial("Tarifas — medidas frente a la maqueta (R70)", () => {
  let r: RepartoE2E;
  let activosAlEmpezar: { id: string; activo: boolean }[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    activosAlEmpezar = await baseReparto().vehiculo.findMany({ select: { id: true, activo: true } });
    r = await crearEscenarioReparto("tarifas-maqueta");

    // Un precio de tienda para que exista la tabla, por la propia pantalla.
    const page = await paginaEnTema(browser, r, "claro");
    await elegirNivel(page, "Tienda con precio propio…");
    await elegirOpcion(page, page.locator("#tarifas-tienda"), r.tienda.nombre);
    await expect(page.getByTestId("tarifas-esqueleto")).toHaveCount(0);
    await digitarYGuardar(page, "Cobro a la tienda", [{ concepto: "Flete por entregado", valor: "900", iva: "13" }]);
    await page.context().close();
  });

  test.afterAll(async () => {
    const db = baseReparto();
    const sembrados = await db.vehiculo.findMany({ where: { name: { startsWith: SEMBRADOS } }, select: { id: true } });
    const ids = sembrados.map((v) => v.id);
    await db.$transaction(async (tx) => {
      await fijarEmpresa(tx, r.empresa.organizacionId);
      await tx.tarifaValor.deleteMany({ where: { vehiculoId: { in: ids } } });
    });
    await db.vehiculo.deleteMany({ where: { id: { in: ids } } });
    for (const v of activosAlEmpezar) await db.vehiculo.update({ where: { id: v.id }, data: { activo: v.activo } });
  });

  for (const tema of ["claro", "oscuro"] as const) {
    test(`1360 px, ${tema}: cada medida de §12`, async ({ browser }) => {
      test.setTimeout(120_000);
      const page = await paginaEnTema(browser, r, tema);
      medida(`--- 1360 × 980, ${tema} ---`, "", "");

      const lista = await caja(zonasDe(page));
      const panel = await caja(panelDe(page));
      medida("Lista de zonas, ancho", "250 a 280", entero(lista.width));
      expect(lista.width).toBeGreaterThanOrEqual(250 - TOLERANCIA);
      expect(lista.width).toBeLessThanOrEqual(280 + TOLERANCIA);
      const separacion = panel.x - (lista.x + lista.width);
      medida("Separación lista-panel", "24", entero(separacion));
      exacto(separacion, 24);
      medida("Panel de valores, ancho", "≥ 560", entero(panel.width));
      expect(panel.width).toBeGreaterThanOrEqual(560);
      medida("Lista y panel, misma y", "igual", `${entero(lista.y)} y ${entero(panel.y)}`);
      exacto(lista.y, panel.y);

      const fila = await caja(zonasDe(page).getByRole("button").first());
      medida("Fila de zona, alto", "≥ 58", entero(fila.height));
      expect(fila.height).toBeGreaterThanOrEqual(58);

      const pestanas = panelDe(page).getByRole("tab");
      await expect(pestanas).toHaveCount(3);
      const altoPestana = (await caja(pestanas.first())).height;
      medida("Pestañas", "3, alto ≥ 44", `3, ${entero(altoPestana)}`);
      expect(altoPestana).toBeGreaterThanOrEqual(44);

      const filasRejilla = page.getByTestId("tarifas-rejilla").getByRole("row");
      const columnas = page.getByTestId("tarifas-rejilla").getByRole("columnheader");
      const nombres = await columnas.allInnerTexts();
      medida("Columnas de cobro", "Concepto, Modo, Valor, IVA, Hoy rige", nombres.join(", "));
      expect(nombres).toEqual(["Concepto", "Modo", "Valor", "IVA", "Hoy rige"]);
      await expect(filasRejilla).toHaveCount(8);
      medida("Filas de cobro", "7", "7");

      const valor = await caja(panelDe(page).getByRole("textbox", { name: "Valor de Flete por entregado", exact: true }));
      medida("Campo valor", "110 × ≥ 40", `${entero(valor.width)} × ${entero(valor.height)}`);
      exacto(valor.width, 110);
      expect(valor.height).toBeGreaterThanOrEqual(40);
      const iva = await caja(panelDe(page).getByRole("textbox", { name: "IVA de Flete por entregado", exact: true }));
      medida("Campo IVA", "70 × ≥ 40", `${entero(iva.width)} × ${entero(iva.height)}`);
      exacto(iva.width, 70);
      expect(iva.height).toBeGreaterThanOrEqual(40);
      const modo = await caja(panelDe(page).getByRole("combobox", { name: "Modo de Flete por entregado" }));
      medida("Selector de modo, alto", "≥ 40", entero(modo.height));
      expect(modo.height).toBeGreaterThanOrEqual(40);

      const banda = page.getByRole("region", { name: "Estado de las tarifas" });
      const activar = banda.getByRole("button", { name: "Activar tarifas nuevas", exact: true });
      const cajaActivar = await caja(activar);
      const cajaBanda = await caja(banda);
      medida("Activar, alto y dentro de la banda", "≥ 44, dentro", `${entero(cajaActivar.height)}, y ${entero(cajaActivar.y)} en ${entero(cajaBanda.y)}-${entero(cajaBanda.y + cajaBanda.height)}`);
      expect(cajaActivar.height).toBeGreaterThanOrEqual(44);
      expect(cajaActivar.y).toBeGreaterThanOrEqual(cajaBanda.y);
      expect(cajaActivar.y + cajaActivar.height).toBeLessThanOrEqual(cajaBanda.y + cajaBanda.height);

      const guardar = await caja(panelDe(page).getByRole("button", { name: "Guardar borrador", exact: true }));
      const rejilla = await caja(page.getByTestId("tarifas-rejilla"));
      medida("Guardar borrador, alto y al pie", "≥ 44, bajo la rejilla", `${entero(guardar.height)}, y ${entero(guardar.y)} bajo ${entero(rejilla.y + rejilla.height)}`);
      expect(guardar.height).toBeGreaterThanOrEqual(44);
      expect(guardar.y).toBeGreaterThanOrEqual(rejilla.y + rejilla.height - TOLERANCIA);

      await irAPestana(page, "Pago al mensajero");
      await expect(filasRejilla).toHaveCount(6);
      const pago = await columnas.allInnerTexts();
      medida("Pago al mensajero", "5 filas; 4 columnas", `5 filas; ${pago.join(", ")}`);
      expect(pago).toEqual(["Concepto", "Modo", "Valor", "Hoy rige"]);
      await irAPestana(page, "Pago a la satélite");
      await expect(filasRejilla).toHaveCount(6);
      expect(await columnas.count()).toBe(4);
      medida("Pago a la satélite", "5 filas; 4 columnas", `5 filas; ${await columnas.count()} columnas`);
      await irAPestana(page, "Cobro a la tienda");

      // La tabla de tiendas: una lista, con sus 5 columnas.
      const tiendas = page.getByRole("region", { name: "Tiendas con precio propio" }).getByRole("columnheader");
      await expect(tiendas).toHaveCount(5);
      medida("Tabla de tiendas, columnas", "5", String(await tiendas.count()));

      // El diálogo, con faltantes: las dos zonas están sin empezar.
      await activar.click();
      const dialogo = page.getByRole("dialog", { name: "Activar tarifas nuevas" });
      await expect(dialogo).toBeVisible();
      const cajaDialogo = await caja(dialogo);
      const padding = await dialogo.evaluate((el) => getComputedStyle(el).padding);
      medida("Diálogo Activar", "ancho ≤ 640; padding 24", `${entero(cajaDialogo.width)}; ${padding}`);
      expect(cajaDialogo.width).toBeLessThanOrEqual(640);
      expect(padding).toBe("24px");
      const casilla = dialogo.getByRole("checkbox");
      const cajaCasilla = await caja(casilla);
      const filaCasilla = await caja(dialogo.locator("label").filter({ hasText: "Entiendo que lo que falta" }));
      medida("Casilla", "≥ 20 × 20; fila ≥ 44", `${entero(cajaCasilla.width)} × ${entero(cajaCasilla.height)}; ${entero(filaCasilla.height)}`);
      expect(cajaCasilla.width).toBeGreaterThanOrEqual(20);
      expect(cajaCasilla.height).toBeGreaterThanOrEqual(20);
      expect(filaCasilla.height).toBeGreaterThanOrEqual(44);
      await dialogo.getByRole("button", { name: "Seguir digitando", exact: true }).click();
      await expect(dialogo).toHaveCount(0);

      if (tema === "oscuro") {
        await medirContraste("título de la banda", banda.getByText("Borrador: aún rigen las tarifas actuales"));
        await medirContraste("detalle de la banda", banda.getByText("Lo que digites aquí se guarda"));
        await medirContraste("chip de estado de zona", zonasDe(page).locator('[data-slot="badge"]').first());
      }
      const { scroll, cliente } = await pagina(page);
      medida("Página, scroll horizontal", "ninguno", `${scroll} = ${cliente}`);
      expect(scroll).toBe(cliente);
      await page.context().close();
    });
  }

  test("390 × 844: apilado, sin scroll de página y 44 px en lo táctil (R59)", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await paginaEnTema(browser, r, "claro", { width: 390, height: 844 });
    medida("--- 390 × 844 ---", "", "");

    const { scroll, cliente } = await pagina(page);
    medida("Página, scroll horizontal", "≤ 390", `${scroll} = ${cliente}`);
    expect(scroll).toBeLessThanOrEqual(390);
    const lista = await caja(zonasDe(page));
    const panel = await caja(panelDe(page));
    medida("y de la lista < y del panel", "apilado", `${entero(lista.y)} < ${entero(panel.y)}`);
    expect(lista.y).toBeLessThan(panel.y);

    // Lo táctil de la pantalla. El «Toggle Sidebar» es del encabezado compartido, fuera de este módulo.
    await irAPestana(page, "Pago al mensajero");
    const medibles = [
      page.getByRole("region", { name: "Estado de las tarifas" }).getByRole("button"),
      zonasDe(page).getByRole("button"),
      panelDe(page).getByRole("tab"),
      panelDe(page).getByRole("button"),
      panelDe(page).getByRole("combobox"),
      page.getByRole("region", { name: /Grupos de .* de la zona/ }).getByRole("button"),
      page.getByRole("region", { name: "Tiendas con precio propio" }).getByRole("button"),
    ];
    let minimo = Number.POSITIVE_INFINITY;
    let contados = 0;
    for (const grupo of medibles) {
      for (const elemento of await grupo.all()) {
        if (!(await elemento.isVisible())) continue;
        const alto = (await caja(elemento)).height;
        contados += 1;
        minimo = Math.min(minimo, alto);
        expect(alto, `«${await elemento.innerText()}» mide ${alto} de alto`).toBeGreaterThanOrEqual(44);
      }
    }
    expect(contados).toBeGreaterThan(10);
    const fila = await caja(panelDe(page).locator("label").filter({ hasText: "Pagar distinto por vehículo" }));
    medida(`Lo táctil, ${contados} controles`, "≥ 44", entero(minimo));
    medida("Interruptor, alto de su fila", "≥ 44", entero(fila.height));
    expect(fila.height).toBeGreaterThanOrEqual(44);
    await page.context().close();
  });

  /** Enciende el interruptor en la pestaña de pago y mide la tabla por vehículo (R54). */
  async function medirVehiculos(page: Page, columnasEsperadas: number, rotulo: string): Promise<{ desborda: boolean }> {
    await irAPestana(page, "Pago al mensajero");
    await interruptor(page).click();
    const tabla = page.getByTestId("tarifas-vehiculo");
    await expect(tabla).toBeVisible();

    const columnas = tabla.getByRole("columnheader");
    await expect(columnas).toHaveCount(columnasEsperadas);
    const campo = await caja(tabla.getByRole("textbox", { name: "Por entregado, Todos los vehículos", exact: true }));
    const contenedor = tabla.locator('[data-slot="table-container"]');
    const anchos = await contenedor.evaluate((el) => ({ scroll: el.scrollWidth, cliente: el.clientWidth }));
    const antes = (await caja(columnas.first())).x;
    await contenedor.evaluate((el) => {
      el.scrollLeft = 400;
    });
    const desplazado = await contenedor.evaluate((el) => el.scrollLeft);
    const despues = (await caja(columnas.first())).x;
    const { scroll, cliente } = await pagina(page);

    medida(`${rotulo}: columnas`, String(columnasEsperadas), String(await columnas.count()));
    medida(`${rotulo}: campo`, "120 × ≥ 40", `${entero(campo.width)} × ${entero(campo.height)}`);
    medida(`${rotulo}: contenedor`, "scrollWidth y clientWidth", `${anchos.scroll} y ${anchos.cliente}`);
    medida(`${rotulo}: x de la columna de conceptos`, "no cambia", `${entero(antes)} y ${entero(despues)}, con scrollLeft ${entero(desplazado)}`);
    medida(`${rotulo}: página`, "sin scroll", `${scroll} = ${cliente}`);

    exacto(campo.width, 120);
    expect(campo.height).toBeGreaterThanOrEqual(40);
    exacto(antes, despues);
    expect(scroll).toBe(cliente);
    return { desborda: anchos.scroll > anchos.cliente };
  }

  test("con 2 vehículos, la tabla cabe en 1360 px", async ({ browser }) => {
    test.setTimeout(120_000);
    await catalogoConActivos(2);
    const page = await paginaEnTema(browser, r, "claro");
    const { desborda } = await medirVehiculos(page, 4, "2 vehículos, 1360");
    expect(desborda).toBe(false);
    await page.context().close();
  });

  for (const { ancho, alto } of [
    { ancho: 1360, alto: 980 },
    { ancho: 390, alto: 844 },
  ]) {
    test(`con 8 vehículos a ${ancho} px, desplaza el contenedor y no la página (R54)`, async ({ browser }) => {
      test.setTimeout(120_000);
      await catalogoConActivos(8);
      const page = await paginaEnTema(browser, r, "claro", { width: ancho, height: alto });
      const { desborda } = await medirVehiculos(page, 10, `8 vehículos, ${ancho}`);
      expect(desborda).toBe(true);
      await page.context().close();
    });
  }

  test("oscuro: la marca de un vehículo inactivo con valor guardado (R51, R60)", async ({ browser }) => {
    test.setTimeout(120_000);
    await catalogoConActivos(3);
    const inactivo = `${SEMBRADOS}inactivo`;
    const v = await baseReparto().vehiculo.upsert({ where: { name: inactivo }, update: { activo: true }, create: { name: inactivo } });

    const claro = await paginaEnTema(browser, r, "claro");
    await irAPestana(claro, "Pago al mensajero");
    await interruptor(claro).click();
    await claro.getByTestId("tarifas-vehiculo").getByRole("textbox", { name: `Por entregado, ${inactivo}`, exact: true }).fill("777");
    const guardar = panelDe(claro).getByRole("button", { name: "Guardar borrador", exact: true });
    await guardar.click();
    await expect(guardar).toBeDisabled();
    await expect(guardar).not.toHaveAttribute("aria-busy", "true");
    await claro.context().close();

    await baseReparto().vehiculo.update({ where: { id: v.id }, data: { activo: false } });
    const page = await paginaEnTema(browser, r, "oscuro");
    await irAPestana(page, "Pago al mensajero");
    const tabla = page.getByTestId("tarifas-vehiculo");
    const cabecera = tabla.getByRole("columnheader").filter({ hasText: inactivo });
    await medirContraste("marca «Inactivo»", cabecera.getByText("Inactivo", { exact: true }));
    await expect(tabla.getByRole("textbox", { name: `Por entregado, ${inactivo}`, exact: true })).toHaveValue("777");
    await expect(tabla.getByRole("textbox", { name: `Por novedad, ${inactivo}`, exact: true })).toBeDisabled();
    await page.context().close();
  });

  test("tras activar, una columna menos y sin banda", async ({ browser }) => {
    test.setTimeout(120_000);
    const page = await paginaEnTema(browser, r, "claro");
    await activarConFaltantes(page);
    await expect(page.getByRole("region", { name: "Estado de las tarifas" })).toHaveCount(0);
    await irAZona(page, r.zonaSatelite.nombre);
    await irAPestana(page, "Cobro a la tienda");
    await expect(filaDe(page, "Flete por entregado")).toBeVisible();
    const cobro = await page.getByTestId("tarifas-rejilla").getByRole("columnheader").allInnerTexts();
    medida("Tras activar, columnas de cobro", "4, sin Hoy rige", cobro.join(", "));
    expect(cobro).toEqual(["Concepto", "Modo", "Valor", "IVA"]);
    await page.context().close();
  });
});
