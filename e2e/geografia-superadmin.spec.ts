import { randomBytes } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { clienteDueno } from "./_dos-empresas-fixture";
import { crearEscenarioReparto, crearOrden, paginaDe, type GeoE2E, type OrdenE2E, type RepartoE2E } from "./_escenarios/reparto";
import { asegurarSuperadmin, conCandadoDelSuperadmin, entrarComoSuperadmin } from "./_superadmin-fixture";

/**
 * Épica geo jerárquica (SL-20, ficha 374, SLT-43/SLT-44) — la geografía del superadmin en
 * `/plataforma/geografia`, de punta a punta, y lo que ve una empresa.
 *
 * 1. País propio: el superadmin da de alta Islandia por «Nuevo país» (o la reutiliza si ya está en
 *    la base), carga su división por CSV, crea una localidad bajo un municipio y la renombra, y
 *    enciende y apaga «Disponible» viendo el efecto en el alta de «Empresas». Lo deja apagado: un
 *    país dado de alta por pantalla nace sin teléfono, moneda ni documentos (SLT-42 R6, SL-21 R17;
 *    su pantalla es SLT-81), así que ninguna empresa puede darse de alta en él y no se ofrece.
 * 2. Por eso la empresa vive en Costa Rica, sobre una provincia PROPIA de esta corrida cargada por
 *    CSV (dos cantones, tres distritos, sufijo único): el spec no toca ningún nodo de la división
 *    real y deja los suyos activos (y el `afterAll` los reactiva si un caso cae a medias). El
 *    selector geográfico de la empresa es «Corregir datos» de `/ordenes`: sus tres desplegables
 *    ofrecen solo lo disponible (ficha 374 R29), y precargan la ubicación de la orden, así que el
 *    desplegable de un nivel enseña los hijos del nodo precargado aunque ese nodo esté inactivo.
 *    Eso hace visible la cascada: un cantón inactivo deja sin distritos, una provincia inactiva sin
 *    cantones ni distritos.
 *
 * Historial: cada cambio del superadmin queda en `historial_plataforma` (SL-20 R33, R35), pero no
 * hay pantalla que lo enseñe; se comprueba por detrás como dueño.
 *
 * CÓMO SE CORRE: proyecto `aislamiento` (va detrás de `plataforma-vacia`, que deja el superadmin),
 * contra una base local migrada y con `pnpm run db:seed`.
 */

test.describe.configure({ mode: "serial" });

const s = randomBytes(4).toString("hex");

/** El país del caso 1. `IS` no lo usa ningún otro spec. */
const PAIS = { id: "IS", nombre: "Islandia" } as const;
const NIVELES_IS = {
  "Nivel 1, en singular": "Región",
  "Nivel 1, en plural": "Regiones",
  "Nivel 2, en singular": "Municipio",
  "Nivel 2, en plural": "Municipios",
  "Nivel 3, en singular": "Localidad",
  "Nivel 3, en plural": "Localidades",
} as const;

const IS = {
  region: `Region GeoSA ${s}`,
  municipio: `Municipio GeoSA ${s}`,
  localidades: [`Localidad Uno ${s}`, `Localidad Dos ${s}`],
  nueva: `Localidad Nueva ${s}`,
  renombrada: `Localidad Renombrada ${s}`,
};

/** La provincia propia del caso 2, en Costa Rica. Sin paréntesis: la carga masiva usa `Cantón (Distrito)`. */
const CR = {
  provincia: `Provincia GeoSA ${s}`,
  canton1: `Canton Uno GeoSA ${s}`,
  canton2: `Canton Dos GeoSA ${s}`,
  d1: `Distrito Uno GeoSA ${s}`,
  d2: `Distrito Dos GeoSA ${s}`,
  d3: `Distrito Tres GeoSA ${s}`,
  d1Renombrado: `Distrito Renombrado GeoSA ${s}`,
};

const CABECERA = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3";

let dueno: PrismaClient | null = null;
let ctxSa: BrowserContext | null = null;
let sa: Page | null = null;
let maestro: Page | null = null;
let escenario: RepartoE2E | null = null;
let orden: OrdenE2E | null = null;
const inicio = new Date();

function base(): PrismaClient {
  if (!dueno) throw new Error("no hay cliente dueño: falló el beforeAll");
  return dueno;
}

function paginaSa(): Page {
  if (!sa) throw new Error("no hay sesión del superadmin: falló el beforeAll");
  return sa;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  dueno = clienteDueno();
  const db = dueno;
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db));
  ctxSa = await browser.newContext();
  const page = await ctxSa.newPage();
  await conCandadoDelSuperadmin(() => entrarComoSuperadmin(page, db));
  sa = page;
});

test.afterAll(async () => {
  // Si un caso cae con un nodo propio desactivado, se devuelve: la provincia es de esta corrida,
  // pero activa no estorba a los specs que eligen distritos del catálogo y apagada sí podría.
  if (dueno) {
    const provincia = await dueno.provincia.findFirst({ where: { nombre: CR.provincia, paisId: "CR" }, select: { id: true } });
    if (provincia) {
      await dueno.provincia.update({ where: { id: provincia.id }, data: { activo: true } });
      await dueno.canton.updateMany({ where: { provinciaId: provincia.id }, data: { activo: true } });
      await dueno.distrito.updateMany({ where: { canton: { provinciaId: provincia.id } }, data: { activo: true } });
    }
    await dueno.$disconnect();
  }
  await maestro?.context().close();
  await ctxSa?.close();
});

/* -------------------------------------------------------------------------- */
/* Pasos del superadmin                                                        */
/* -------------------------------------------------------------------------- */

async function abrirPais(page: Page, paisId: string): Promise<void> {
  await page.goto(`/plataforma/geografia?pais=${paisId}`, { waitUntil: "load", timeout: 180_000 });
  await expect(page.getByRole("heading", { level: 2, name: "País", exact: true })).toBeVisible({ timeout: 60_000 });
}

/**
 * SLT-46 (R58, P11): toda escritura de la pantalla pide confirmación en un modal titulado con la
 * pregunta; se confirma con «Sí, <verbo>» y el modal se cierra al responder la action.
 */
async function confirmar(page: Page, titulo: string, boton: string): Promise<void> {
  const dialogo = page.getByRole("dialog", { name: titulo, exact: true });
  await expect(dialogo).toBeVisible({ timeout: 30_000 });
  await dialogo.getByRole("button", { name: boton, exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 60_000 });
}

/** El interruptor «Disponible» solo se pinta para el país elegido: dice qué país enseña la pantalla. */
function interruptorDe(page: Page, paisNombre: string) {
  return page.getByRole("switch", { name: `Disponible: ${paisNombre}`, exact: true });
}

/** Sube `filas` (sin cabecera) por «Cargar CSV», confirma y espera el resumen de la carga. */
async function cargarCsv(page: Page, paisNombre: string, filas: string[]): Promise<void> {
  const csv = [CABECERA, ...filas].join("\n");
  await page.getByLabel("Archivo CSV").setInputFiles({
    name: `division-${s}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.getByRole("button", { name: "Cargar", exact: true }).click();
  await confirmar(page, `¿Cargar la división de ${paisNombre}?`, "Sí, cargar");
}

function resumenDeCarga(page: Page) {
  return page.getByRole("status").filter({ hasText: "Carga hecha" });
}

/** Deja el árbol filtrado por el sufijo de la corrida: solo quedan los nodos de este spec. */
async function filtrarArbol(page: Page, paisNombre: string): Promise<void> {
  await page.getByRole("searchbox", { name: `Buscar en la división de ${paisNombre}` }).fill(s);
}

/** SLT-46 (D1): «Desactivar» del árbol pasa a «Retirar», con su modal «¿Retirar «…»?». */
async function desactivar(page: Page, nombre: string): Promise<void> {
  await page.getByRole("button", { name: `Retirar ${nombre}`, exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: `¿Retirar «${nombre}»?`, exact: true });
  await expect(dialogo).toBeVisible();
  // R31: el conteo de órdenes sin entregar se resuelve antes de dejar confirmar.
  await expect(dialogo).toContainText("Órdenes sin entregar en este nodo, de todas las empresas:", { timeout: 30_000 });
  await dialogo.getByRole("button", { name: "Sí, retirar", exact: true }).click();
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Reactivar ${nombre}`, exact: true })).toBeEnabled({ timeout: 30_000 });
}

/**
 * La fila del árbol de un lugar: el `data-nodo` envuelve SOLO esa fila (sus hijos van en la lista
 * hermana), así que lo que se busque dentro no puede venir de otro lugar.
 */
function filaDelArbol(page: Page, nombre: string) {
  return page.locator("[data-nodo]").filter({ has: page.getByText(nombre, { exact: true }) });
}

/** SLT-46 (decisión del 2026-11-23): un lugar activo apagado por arriba dice cuál lo apaga. */
async function esperarInactivoPor(page: Page, nombre: string, nivel: string): Promise<void> {
  await expect(filaDelArbol(page, nombre).getByText(`Inactivo: su ${nivel} está retirado`, { exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** SLT-46 (D1): «Activar» del árbol pasa a «Reactivar», confirmado en el modal. */
async function activar(page: Page, nombre: string): Promise<void> {
  await page.getByRole("button", { name: `Reactivar ${nombre}`, exact: true }).click();
  await confirmar(page, `¿Reactivar «${nombre}»?`, "Sí, reactivar");
  await expect(page.getByRole("button", { name: `Retirar ${nombre}`, exact: true })).toBeVisible({ timeout: 30_000 });
}

async function renombrar(page: Page, nivel: string, de: string, a: string): Promise<void> {
  await page.getByRole("button", { name: `Renombrar ${de}`, exact: true }).click();
  const form = page.getByRole("form", { name: `Renombrar: ${nivel}` });
  await expect(form).toBeVisible();
  await form.getByRole("textbox", { name: "Nombre" }).fill(a);
  await form.getByRole("button", { name: "Guardar", exact: true }).click();
  await confirmar(page, `¿Renombrar «${de}»?`, "Sí, renombrar");
  await expect(form).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Renombrar ${a}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Renombrar ${de}`, exact: true })).toHaveCount(0);
}

/** Las opciones del desplegable «País» del alta de empresa. */
async function paisesDelAlta(page: Page): Promise<string[]> {
  await page.goto("/plataforma/empresas", { waitUntil: "load", timeout: 180_000 });
  const empresa = page.getByRole("form", { name: "Crear empresa" }).getByRole("group", { name: "Empresa", exact: true });
  await empresa.getByRole("combobox", { name: "País" }).click();
  const lista = page.getByRole("listbox");
  await expect(lista).toBeVisible();
  const opciones = (await lista.getByRole("option").allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press("Escape");
  return opciones;
}

/* -------------------------------------------------------------------------- */
/* Lo que ve la empresa: «Corregir datos» de una orden de su distrito          */
/* -------------------------------------------------------------------------- */

interface OpcionesDeUbicacion {
  provincias: string[];
  cantones: string[];
  distritos: string[];
  /** Lo que enseña el desplegable «Distrito» con la ubicación precargada. */
  distritoElegido: string;
}

async function opcionesDe(page: Page, combo: string): Promise<string[]> {
  const control = page.getByRole("dialog").getByRole("combobox", { name: combo, exact: true });
  await control.click();
  const lista = page.getByRole("listbox");
  // Sin opciones, Base UI puede no abrir la lista: se espera un momento y se da por vacía.
  const abierta = await lista.waitFor({ state: "visible", timeout: 5_000 }).then(
    () => true,
    () => false,
  );
  if (!abierta) return [];
  const opciones = (await lista.getByRole("option").allInnerTexts()).map((t) => t.trim());
  await page.keyboard.press("Escape");
  await expect(lista).toBeHidden();
  return opciones;
}

/** Abre «Corregir datos» de la orden, espera la precarga y lee los tres desplegables sin tocar nada. */
async function ubicacionQueVeLaEmpresa(page: Page, o: OrdenE2E): Promise<OpcionesDeUbicacion> {
  await page.goto("/ordenes", { waitUntil: "load", timeout: 180_000 });
  await page.getByRole("button", { name: `Corregir datos de la orden ${o.numRemision}`, exact: true }).click({ timeout: 60_000 });
  const dialogo = page.getByRole("dialog", { name: "Corregir los datos del cliente" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText("Cargando la ubicación actual de la orden…")).toHaveCount(0, { timeout: 60_000 });
  await expect(dialogo.getByRole("combobox", { name: "Cantón", exact: true })).toBeEnabled({ timeout: 30_000 });
  const resultado: OpcionesDeUbicacion = {
    provincias: await opcionesDe(page, "Provincia"),
    cantones: await opcionesDe(page, "Cantón"),
    distritos: await opcionesDe(page, "Distrito"),
    distritoElegido: (await dialogo.getByRole("combobox", { name: "Distrito", exact: true }).innerText()).trim(),
  };
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toBeHidden();
  return resultado;
}

async function paginaMaestro(browser: Browser): Promise<Page> {
  if (!escenario) throw new Error("no hay empresa: falló el caso de la carga en Costa Rica");
  maestro ??= await paginaDe(browser, escenario.empresa.maestro);
  return maestro;
}

function laOrden(): OrdenE2E {
  if (!orden) throw new Error("no hay orden: falló el caso de la carga en Costa Rica");
  return orden;
}

async function geoDe(provincia: string, canton: string, distrito: string): Promise<GeoE2E> {
  const d = await base().distrito.findFirst({
    where: { nombre: distrito, canton: { nombre: canton, provincia: { nombre: provincia, paisId: "CR" } } },
    select: { id: true },
  });
  if (!d) throw new Error(`la carga no dejó el distrito ${provincia}/${canton}/${distrito}`);
  return { distritoId: d.id, provincia, canton, distrito };
}

/* -------------------------------------------------------------------------- */
/* Casos                                                                       */
/* -------------------------------------------------------------------------- */

test("el superadmin da de alta un país, carga su división por CSV, crea una localidad y la renombra", async () => {
  test.setTimeout(300_000);
  const page = paginaSa();

  // «Nuevo país», o el que ya dejó una corrida anterior sobre esta base.
  await abrirPais(page, PAIS.id);
  // SLT-46: ya no hay encabezado «División de <país>»; el interruptor «Disponible: <país>» solo sale
  // si la pantalla enseña ese país (sin darlo de alta, `?pais=IS` cae en el primero por nombre).
  const division = interruptorDe(page, PAIS.nombre);
  if ((await division.count()) === 0) {
    await page.getByRole("button", { name: "Nuevo país" }).click();
    const alta = page.getByRole("dialog", { name: "Nuevo país" });
    await alta.getByRole("combobox", { name: "País" }).fill(PAIS.nombre);
    await page.getByRole("option", { name: `${PAIS.nombre} (${PAIS.id})`, exact: true }).click();
    // SLT-46 (R53, R54): el alta arranca con tres filas de nivel, en orden; Islandia usa las tres.
    for (const [etiqueta, valor] of Object.entries(NIVELES_IS)) {
      // Por rol y nombre accesible: el texto del `<label>` lleva el «*» de obligatorio (aria-hidden),
      // así que `getByLabel(…, { exact: true })` no casa; el nombre accesible del textbox sí.
      await alta.getByRole("textbox", { name: etiqueta, exact: true }).fill(valor);
    }
    // R63: «Disponible para crear empresas» nace desmarcada y se deja así; el caso siguiente la enciende.
    await expect(alta.getByRole("checkbox", { name: "Disponible para crear empresas" })).not.toBeChecked();
    await alta.getByRole("button", { name: "Dar de alta" }).click();
    await confirmar(page, `¿Crear ${PAIS.nombre} con estos niveles?`, "Sí, crear");
    await expect(alta).toBeHidden({ timeout: 30_000 });
    await page.waitForURL((u) => u.searchParams.get("pais") === PAIS.id, { timeout: 60_000 });
  }
  await expect(division).toBeVisible({ timeout: 60_000 });
  // R20: los niveles se nombran con los nombres DEL país: la equivalencia de columnas los usa.
  await expect(page.getByRole("cell", { name: "Código de municipio (opcional)" })).toBeVisible();

  // R24: la carga crea región, municipio y dos localidades.
  await cargarCsv(page, PAIS.nombre, IS.localidades.map((l) => `${IS.region},,${IS.municipio},,${l},`));
  const resumen = resumenDeCarga(page);
  await expect(resumen).toBeVisible({ timeout: 60_000 });
  await expect(resumen).toContainText("Regiones: 1");
  await expect(resumen).toContainText("Municipios: 1");
  await expect(resumen).toContainText("Localidades: 2");

  // El árbol enseña lo cargado. Se relee la página para leerlo de la base (desde SLT-46 el árbol llega
  // por props y `ConfirmarCambio` refresca tras la carga, pero la relectura no depende de eso).
  await abrirPais(page, PAIS.id);
  await filtrarArbol(page, PAIS.nombre);
  for (const nombre of [IS.region, IS.municipio, ...IS.localidades]) {
    await expect(page.getByRole("button", { name: `Renombrar ${nombre}`, exact: true })).toBeVisible({ timeout: 30_000 });
  }

  // Una localidad nueva bajo el municipio, a mano.
  await page.getByRole("button", { name: `Añadir localidad a ${IS.municipio}`, exact: true }).click();
  const alta = page.getByRole("form", { name: "Alta: Localidad" });
  // SLT-46: el «Dentro de» enseña la cadena entera del padre, de la raíz a él.
  await expect(alta).toContainText(`Dentro de ${IS.region} › ${IS.municipio}.`);
  await alta.getByRole("textbox", { name: "Nombre" }).fill(IS.nueva);
  await alta.getByRole("button", { name: "Guardar", exact: true }).click();
  await confirmar(page, `¿Agregar «${IS.nueva}»?`, "Sí, agregar");
  await expect(alta).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText(`Se dio de alta «${IS.nueva}» (Localidad).`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Renombrar ${IS.nueva}`, exact: true })).toBeVisible();
  await expect(page.getByText("(3 localidades)")).toBeVisible();

  // Y se renombra, sin errores.
  await renombrar(page, "Localidad", IS.nueva, IS.renombrada);
  await expect(page.getByText(`«${IS.nueva}» ahora es «${IS.renombrada}».`)).toBeVisible();
  // Ningún aviso con texto (el `alert` vacío es el anunciador de rutas de Next).
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);

  // Sigue ahí tras recargar: lo guardó la base, no el estado de la pantalla.
  await abrirPais(page, PAIS.id);
  await filtrarArbol(page, PAIS.nombre);
  await expect(page.getByRole("button", { name: `Renombrar ${IS.renombrada}`, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: `Renombrar ${IS.nueva}`, exact: true })).toHaveCount(0);

  // R33, R35: cada escritura deja su fila en el historial de plataforma (sin pantalla que lo enseñe).
  const historial = await base().historialPlataforma.findMany({
    where: { paisId: PAIS.id, createdAt: { gte: inicio } },
    select: { accion: true, entidadEtiqueta: true, valorAnterior: true, valorNuevo: true, actorNombre: true },
  });
  expect(historial.map((h) => h.accion)).toEqual(
    expect.arrayContaining(["division_cargada", "nodo_geografico_creado", "nodo_geografico_renombrado"]),
  );
  const renombre = historial.find((h) => h.accion === "nodo_geografico_renombrado");
  expect(renombre).toMatchObject({ valorAnterior: IS.nueva, valorNuevo: IS.renombrada });
  expect(renombre?.actorNombre ?? "").not.toBe("");
});

test("«Disponible» decide si el país se ofrece en el alta de empresas; queda apagado", async () => {
  test.setTimeout(240_000);
  const page = paginaSa();
  const interruptor = interruptorDe(page, PAIS.nombre);

  await abrirPais(page, PAIS.id);
  if ((await interruptor.getAttribute("aria-checked")) !== "true") {
    await interruptor.click();
    await confirmar(page, `¿Cambiar la disponibilidad de ${PAIS.nombre}?`, "Sí, cambiar");
    await expect(interruptor).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  }
  expect(await paisesDelAlta(page)).toContain(PAIS.nombre);

  await abrirPais(page, PAIS.id);
  await interruptor.click();
  await confirmar(page, `¿Cambiar la disponibilidad de ${PAIS.nombre}?`, "Sí, cambiar");
  await expect(interruptor).toHaveAttribute("aria-checked", "false", { timeout: 30_000 });
  await expect(page.getByText(`${PAIS.nombre} ya no se ofrece en el alta de empresas nuevas.`)).toBeVisible();
  await abrirPais(page, PAIS.id);
  await expect(interruptor).toHaveAttribute("aria-checked", "false");

  const opciones = await paisesDelAlta(page);
  expect(opciones).not.toContain(PAIS.nombre);
  expect(opciones).toContain("Costa Rica");

  const cambios = await base().historialPlataforma.findMany({
    where: { paisId: PAIS.id, entidadTipo: "pais", createdAt: { gte: inicio } },
    select: { accion: true },
  });
  expect(cambios.map((c) => c.accion)).toContain("pais_disponibilidad_desactivada");
});

test("una provincia cargada por CSV en Costa Rica llega a la empresa: su orden y «Corregir datos»", async ({ browser }) => {
  test.setTimeout(420_000);
  const page = paginaSa();
  await abrirPais(page, "CR");
  await expect(interruptorDe(page, "Costa Rica")).toBeVisible();
  await cargarCsv(page, "Costa Rica", [
    `${CR.provincia},,${CR.canton1},,${CR.d1},`,
    `${CR.provincia},,${CR.canton1},,${CR.d2},`,
    `${CR.provincia},,${CR.canton2},,${CR.d3},`,
  ]);
  const resumen = resumenDeCarga(page);
  await expect(resumen).toBeVisible({ timeout: 60_000 });
  await expect(resumen).toContainText("Provincias: 1");
  await expect(resumen).toContainText("Cantones: 2");
  await expect(resumen).toContainText("Distritos: 3");

  // Una empresa de Costa Rica con su central en D1 y su satélite en D3, y una orden en D1 por la
  // carga masiva real (que resuelve la ubicación por nombres sobre el catálogo).
  escenario = await crearEscenarioReparto("geografia-superadmin", {
    distritos: {
      central: await geoDe(CR.provincia, CR.canton1, CR.d1),
      satelite: await geoDe(CR.provincia, CR.canton2, CR.d3),
    },
  });
  orden = await crearOrden(escenario, { zona: "central" });

  const m = await paginaMaestro(browser);
  const ubicacion = await ubicacionQueVeLaEmpresa(m, laOrden());
  expect(ubicacion.provincias).toContain(CR.provincia);
  expect(ubicacion.cantones).toEqual(expect.arrayContaining([CR.canton1, CR.canton2]));
  expect(ubicacion.distritos).toEqual(expect.arrayContaining([CR.d1, CR.d2]));
  expect(ubicacion.distritoElegido).toBe(CR.d1);
});

test("desactivar un cantón lo saca, con sus distritos, del selector de la empresa; reactivarlo los devuelve", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = paginaSa();
  await abrirPais(page, "CR");
  await filtrarArbol(page, "Costa Rica");
  await desactivar(page, CR.canton1);
  // El árbol del superadmin marca la herencia con texto visible: el filtro por el sufijo lo deja
  // abierto entero, así que las filas de los distritos están pintadas.
  for (const d of [CR.d1, CR.d2]) await esperarInactivoPor(page, d, "cantón");

  try {
    const m = await paginaMaestro(browser);
    const apagado = await ubicacionQueVeLaEmpresa(m, laOrden());
    expect(apagado.provincias).toContain(CR.provincia);
    expect(apagado.cantones).toContain(CR.canton2);
    expect(apagado.cantones).not.toContain(CR.canton1);
    // Con el cantón de la orden precargado, el desplegable de distritos se queda sin los suyos.
    expect(apagado.distritos).not.toContain(CR.d1);
    expect(apagado.distritos).not.toContain(CR.d2);
  } finally {
    await abrirPais(page, "CR");
    await filtrarArbol(page, "Costa Rica");
    await activar(page, CR.canton1);
  }

  const m = await paginaMaestro(browser);
  const encendido = await ubicacionQueVeLaEmpresa(m, laOrden());
  expect(encendido.cantones).toEqual(expect.arrayContaining([CR.canton1, CR.canton2]));
  expect(encendido.distritos).toEqual(expect.arrayContaining([CR.d1, CR.d2]));

  const canton = await base().canton.findFirstOrThrow({ where: { nombre: CR.canton1, provincia: { paisId: "CR" } }, select: { id: true } });
  const acciones = await base().historialPlataforma.findMany({
    where: { entidadId: canton.id, createdAt: { gte: inicio } },
    orderBy: { createdAt: "asc" },
    select: { accion: true },
  });
  expect(acciones.map((a) => a.accion)).toEqual(["nodo_geografico_desactivado", "nodo_geografico_activado"]);
});

test("desactivar una provincia cascada a sus cantones y distritos en el selector de la empresa; reactivarla los devuelve", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = paginaSa();
  await abrirPais(page, "CR");
  await filtrarArbol(page, "Costa Rica");
  await desactivar(page, CR.provincia);
  // Los cantones siguen activos: el ascendiente retirado más cercano de todos es la provincia.
  for (const nombre of [CR.canton1, CR.canton2, CR.d1, CR.d2, CR.d3]) await esperarInactivoPor(page, nombre, "provincia");

  try {
    const m = await paginaMaestro(browser);
    const apagada = await ubicacionQueVeLaEmpresa(m, laOrden());
    expect(apagada.provincias).not.toContain(CR.provincia);
    expect(apagada.provincias.length).toBeGreaterThan(0);
    // Con la provincia de la orden precargada: ni sus cantones ni los distritos del cantón precargado.
    expect(apagada.cantones).not.toContain(CR.canton1);
    expect(apagada.cantones).not.toContain(CR.canton2);
    expect(apagada.distritos).not.toContain(CR.d1);
    expect(apagada.distritos).not.toContain(CR.d2);
  } finally {
    await abrirPais(page, "CR");
    await filtrarArbol(page, "Costa Rica");
    await activar(page, CR.provincia);
  }

  const m = await paginaMaestro(browser);
  const encendida = await ubicacionQueVeLaEmpresa(m, laOrden());
  expect(encendida.provincias).toContain(CR.provincia);
  expect(encendida.cantones).toEqual(expect.arrayContaining([CR.canton1, CR.canton2]));
  expect(encendida.distritos).toEqual(expect.arrayContaining([CR.d1, CR.d2]));
});

test("renombrar un distrito se ve en la orden de la empresa y en su selector", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = paginaSa();
  await abrirPais(page, "CR");
  await filtrarArbol(page, "Costa Rica");
  await renombrar(page, "Distrito", CR.d1, CR.d1Renombrado);

  const m = await paginaMaestro(browser);
  await m.goto("/ordenes", { waitUntil: "load", timeout: 180_000 });
  const fila = m.getByRole("row").filter({ hasText: laOrden().numRemision });
  await expect(fila).toHaveCount(1, { timeout: 60_000 });
  await expect(fila).toContainText(CR.d1Renombrado);
  await expect(fila).not.toContainText(CR.d1);

  const ubicacion = await ubicacionQueVeLaEmpresa(m, laOrden());
  expect(ubicacion.distritoElegido).toBe(CR.d1Renombrado);
  expect(ubicacion.distritos).toContain(CR.d1Renombrado);
  expect(ubicacion.distritos).not.toContain(CR.d1);
});
