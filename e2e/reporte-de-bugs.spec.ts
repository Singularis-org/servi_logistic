import { randomUUID } from "node:crypto";

import { test, expect, devices, type Browser, type BrowserContext, type Cookie, type Locator, type Page } from "@playwright/test";

import {
  abrirBaseE2E,
  confiarDispositivo,
  crearEmpresaE2E,
  crearUsuarioE2E,
  sesionDe,
  type EmpresaE2E,
  type UsuarioE2E,
} from "../tests/fabricas/e2e";

import { crearZonaE2E } from "./_aislamiento-datos";
import { LogDelServidor } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  enlacesDelMenu,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
} from "./_superadmin-fixture";

/**
 * SLT-87 «Reporte de bugs: botón flotante y envío» (T9; R1, R2, R6, R8, R9, R13, R15) — el botón
 * «Reportar un problema» de punta a punta: quién lo ve, el borrador, el envío, la fila guardada y la
 * copia por correo en el log del servidor.
 *
 * Lo fino del panel (contador, Enviar deshabilitado, textos de fallo, borrador por usuario) lo prueba
 * `tests/components/ReporteBugBoton.test.tsx`; el servidor, los tests de la action, del servicio y de
 * integración. Aquí, lo que solo se ve con la app de verdad: la sesión, el layout, el `localStorage` del
 * navegador al recargar, la base y el log.
 *
 * DATOS. Dos empresas de la fábrica:
 *  - la del maestro, sin zonas: así no le sale «Confirmá el SINPE», que taparía los clics;
 *  - la del mensajero, con una zona, porque el servicio la exige para ese rol. El mensajero no revisa
 *    SINPE, así que no ve ese aviso.
 * El superadmin es el de prueba, con OTP del log. Los correos del reporte van a
 * `reportes-e2e@example.test` (`webServer.env` de `playwright.config.ts`): el emisor de consola los
 * escribe en el log con `AUTH_OTP_DEBUG_LOG=1`.
 *
 * Las descripciones llevan un UUID de la corrida: la segunda corrida sobre la misma base no encuentra la
 * fila ni el correo de la primera.
 */

const TEXTO = {
  boton: "Reportar un problema",
  enviar: "Enviar",
  descartar: "Descartar",
  gracias: "Gracias, recibimos tu reporte",
} as const;

const DESTINATARIO = "reportes-e2e@example.test";

let empresa: EmpresaE2E;
let mensajero: UsuarioE2E;
let sesionMaestro: Cookie[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const db = abrirBaseE2E();
  try {
    empresa = await crearEmpresaE2E("reporte-bugs");
    sesionMaestro = await sesionDe(browser, empresa.maestro);
    const deMensajero = await crearEmpresaE2E("reporte-bugs-movil");
    const zona = await crearZonaE2E(db, deMensajero);
    mensajero = await crearUsuarioE2E(deMensajero, "mensajero", { zonaId: zona.id });
  } finally {
    await db.$disconnect();
  }
});

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function botonFlotante(page: Page) {
  return page.getByRole("button", { name: TEXTO.boton });
}

function panel(page: Page) {
  return page.getByRole("dialog", { name: TEXTO.boton });
}

function campo(page: Page) {
  return panel(page).getByRole("textbox");
}

/** Pone la sesión del maestro y abre `ruta`. Fuera de `/login` es la prueba de que la sesión vale. */
async function comoMaestro(page: Page, ruta: string): Promise<void> {
  expect(sesionMaestro.length, "no hay sesión del maestro: falló el beforeAll").toBeGreaterThan(0);
  await page.context().addCookies(sesionMaestro);
  await page.goto(ruta);
  await expect(page).not.toHaveURL(/\/login/);
}

/**
 * Abre el panel. El botón se pinta en el HTML del servidor y responde cuando hidrata: se vuelve a pulsar
 * mientras el panel no esté, sin pulsar de más cuando ya se abrió (el botón también lo cierra).
 */
async function abrirPanel(page: Page): Promise<void> {
  await expect(botonFlotante(page)).toBeVisible();
  await expect(async () => {
    if (!(await panel(page).isVisible())) await botonFlotante(page).click();
    await expect(panel(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

function descripcionUnica(etiqueta: string): string {
  return `E2E SLT-87 ${etiqueta} ${randomUUID()}`;
}

async function enviarReporte(page: Page, descripcion: string): Promise<void> {
  await abrirPanel(page);
  await campo(page).fill(descripcion);
  await panel(page).getByRole("button", { name: TEXTO.enviar }).click();
  await expect(panel(page).getByText(TEXTO.gracias)).toBeVisible({ timeout: 30_000 });
}

/** Entra por `/login` en un contexto de móvil, con el dispositivo de ese navegador confiado. */
async function contextoMovilDe(browser: Browser, u: UsuarioE2E): Promise<BrowserContext> {
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  const page = await ctx.newPage();
  await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
  await page.goto("/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* R1, R2 — quién ve el botón                                                  */
/* -------------------------------------------------------------------------- */

test.describe("SLT-87 — quién ve el botón", () => {
  test("el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones`", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    await comoMaestro(page, "/dashboard");
    await expect(botonFlotante(page)).toBeVisible();
    await expect(botonFlotante(page)).toHaveAttribute("data-posicion", "esquina");
    await page.goto("/ordenes");
    await expect(page).toHaveURL(/\/ordenes/);
    await expect(botonFlotante(page)).toBeVisible();

    const movil = await contextoMovilDe(browser, mensajero);
    try {
      const p = await movil.newPage();
      await p.goto("/mis-asignaciones");
      await expect(p).toHaveURL(/\/mis-asignaciones/);
      await expect(botonFlotante(p)).toBeVisible();
      // R3: en el módulo del mensajero va apilado encima del chat.
      await expect(botonFlotante(p)).toHaveAttribute("data-posicion", "sobre-chat");
      await abrirPanel(p);
      await expect(campo(p)).toBeVisible();
    } finally {
      await movil.close();
    }
  });

  test("el superadmin no ve el botón", async ({ page }) => {
    test.setTimeout(240_000);
    const db = abrirBaseE2E();
    try {
      await conCandadoDelSuperadmin(() => asegurarSuperadmin(db));
      await conCandadoDelSuperadmin(async () => {
        await olvidarDispositivos(db, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
        await entrarConOtp(page, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
      });
    } finally {
      await db.$disconnect();
    }
    await page.goto("/plataforma/empresas");
    // Anti-vacío: la página del superadmin se pintó; sin esto, un portal caído también daría «no hay botón».
    await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
    await expect(botonFlotante(page)).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* R6, R8 — el borrador                                                        */
/* -------------------------------------------------------------------------- */

test.describe("SLT-87 — el borrador", () => {
  test("el borrador sobrevive a recargar la página", async ({ page }) => {
    const texto = descripcionUnica("borrador");
    await comoMaestro(page, "/dashboard");
    await abrirPanel(page);
    await campo(page).fill(texto);
    await expect(panel(page).getByText(`${texto.length}/500`)).toBeVisible();

    await page.reload();
    await abrirPanel(page);
    await expect(campo(page)).toHaveValue(texto);
  });

  test("Descartar borra el borrador, deja el panel vacío y no guarda ningún reporte", async ({ page }) => {
    const texto = descripcionUnica("descartar");
    await comoMaestro(page, "/dashboard");
    await abrirPanel(page);
    await campo(page).fill(texto);
    await panel(page).getByRole("button", { name: TEXTO.descartar }).click();
    await expect(campo(page)).toHaveValue("");

    await page.reload();
    await abrirPanel(page);
    await expect(campo(page)).toHaveValue("");

    const db = abrirBaseE2E();
    try {
      expect(await db.bugReport.count({ where: { description: { contains: texto } } })).toBe(0);
    } finally {
      await db.$disconnect();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* R9, R13, R15 — el envío                                                     */
/* -------------------------------------------------------------------------- */

test.describe("SLT-87 — el envío", () => {
  test("enviar muestra Gracias y tras recargar el panel está vacío", async ({ page }) => {
    const texto = descripcionUnica("enviar");
    await comoMaestro(page, "/dashboard");
    await enviarReporte(page, texto);
    await expect(campo(page)).toHaveValue("");

    await page.reload();
    await abrirPanel(page);
    await expect(campo(page)).toHaveValue("");
    await expect(panel(page).getByText(TEXTO.gracias)).toHaveCount(0);
  });

  test("la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query", async ({
    page,
  }) => {
    const texto = descripcionUnica("contexto");
    await comoMaestro(page, "/ordenes?origen=e2e-slt87#tabla");
    await expect(page).toHaveURL(/\/ordenes\?origen=e2e-slt87/);
    await enviarReporte(page, `  ${texto}  `);

    // Lectura como dueño: la empresa no puede leer `bug_report` (R14).
    const db = abrirBaseE2E();
    try {
      const filas = await db.bugReport.findMany({ where: { description: texto } });
      expect(filas).toHaveLength(1);
      const [fila] = filas;
      expect(fila.organizationId).toBe(empresa.organizacionId);
      expect(fila.reporterUserId).toBe(empresa.maestro.id);
      expect(fila.reporterRole).toBe("maestro");
      expect(fila.pagePath).toBe("/ordenes");
      expect(fila.userAgent).toBe(await page.evaluate(() => navigator.userAgent));
      expect(fila.viewportWidth).toBe(page.viewportSize()?.width);
      expect(fila.viewportHeight).toBe(page.viewportSize()?.height);
      expect(fila.isStandalone).toBe(false);
      expect(fila.deletedAt).toBeNull();
    } finally {
      await db.$disconnect();
    }
  });

  test("el log del servidor tiene el correo a reportes-e2e@example.test con la descripción", async ({ page }) => {
    const texto = descripcionUnica("correo");
    await comoMaestro(page, "/dashboard");
    const log = LogDelServidor.desdeEntorno();
    await enviarReporte(page, texto);

    let leido = "";
    const lineasConLaDescripcion = async (): Promise<string[]> => {
      leido += log.nuevo();
      return leido.split(/\r?\n/).filter((l) => l.includes("[email][debug]") && l.includes(texto));
    };
    await expect.poll(lineasConLaDescripcion, { timeout: 30_000 }).toHaveLength(1);
    const [linea] = await lineasConLaDescripcion();
    expect(linea).toContain(`to=${DESTINATARIO} `);
    // A nadie más: ningún correo al maestro que reporta (R15).
    expect(leido).not.toContain(`to=${empresa.maestro.email}`);
  });
});

/* -------------------------------------------------------------------------- */
/* SLT-97 «Reporte de bugs: módulo del superadmin» (T9; design §10)            */
/* -------------------------------------------------------------------------- */

/**
 * El módulo `/plataforma/reportes` de punta a punta: el maestro envía, el superadmin lo encuentra desde
 * el menú, abre el detalle, lo pasa a «En revisión» con nota y a «Resuelto» sin ella, y el filtro de
 * estado lo saca de «Pendientes». Lo fino (textos, contador, transiciones prohibidas, paginación) lo
 * prueban `tests/components/ReporteDetalle.test.tsx` y
 * `tests/unit/components/reportes-plataforma-page.test.tsx`.
 *
 * DOS CORRIDAS SOBRE LA MISMA BASE. El reporte se localiza por su descripción, que lleva un UUID de esta
 * corrida, y el listado se filtra por la empresa que crea el `beforeAll` (nueva en cada corrida): ni el
 * orden por fecha ni los reportes de otras corridas o de otras empresas mueven la fila a otra página.
 * Nunca se cuenta el listado ni se toma «la primera fila»; solo se cuentan las entradas del historial
 * de ESTE reporte, que nadie más toca.
 *
 * Los tres casos van en serie: el segundo usa la sesión del superadmin y el reporte resuelto del primero.
 */

const TEXTO_MODULO = {
  menu: "Reportes",
  tituloListado: "Reportes",
  tituloDetalle: "Reporte",
  filtroEstado: "Estado",
  filtroEmpresa: "Empresa",
  pendientes: "Pendientes",
  todos: "Todos",
  nuevo: "Nuevo",
  enRevision: "En revisión",
  resuelto: "Resuelto",
  rolMaestro: "Maestro",
  bloqueDescripcion: "Descripción",
  bloqueContexto: "Contexto",
  bloqueEstado: "Estado",
  bloqueHistorial: "Historial",
  nuevoEstado: "Nuevo estado",
  nota: "Nota interna (opcional)",
  cambiarEstado: "Cambiar estado",
  exito: "Estado actualizado.",
  sinNota: "Sin nota",
  historialVacio: "Todavía no hay cambios de estado.",
  cerrado:
    "Este reporte está cerrado y ya no cambia de estado. Si el problema vuelve, entrará como un reporte nuevo.",
  cargaError: "No se pudo cargar el listado de reportes.",
} as const;

/** Abre un `Select` de Base UI y elige la opción por su texto exacto; espera a que se cierre. */
async function elegirOpcion(page: Page, combobox: Locator, opcion: string): Promise<void> {
  await combobox.click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

function bloque(page: Page, nombre: string): Locator {
  return page.getByRole("region", { name: nombre, exact: true });
}

test.describe("SLT-97 — el módulo del superadmin", () => {
  test.describe.configure({ mode: "serial" });

  let nombreEmpresa = "";
  let descripcion = "";
  let sesionSuperadmin: Cookie[] = [];

  function filaDelReporte(page: Page): Locator {
    return page.getByRole("row").filter({ hasText: descripcion });
  }

  test.beforeAll(async () => {
    const db = abrirBaseE2E();
    try {
      const org = await db.organizacion.findUniqueOrThrow({
        where: { id: empresa.organizacionId },
        select: { nombre: true },
      });
      nombreEmpresa = org.nombre;
    } finally {
      await db.$disconnect();
    }
  });

  test("el superadmin abre «Reportes» desde el menú y ve el reporte enviado", async ({ page, browser }) => {
    test.setTimeout(300_000);

    // Paso 1 — envío: el maestro desde `/ordenes`, con una descripción de esta corrida.
    descripcion = `E2E SLT-97 módulo ${randomUUID()}`;
    await comoMaestro(page, "/ordenes");
    await enviarReporte(page, descripcion);

    const ctx = await browser.newContext();
    try {
      const sa = await ctx.newPage();
      const db = abrirBaseE2E();
      try {
        await conCandadoDelSuperadmin(() => asegurarSuperadmin(db));
        await conCandadoDelSuperadmin(async () => {
          await olvidarDispositivos(db, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
          await entrarConOtp(sa, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
        });
      } finally {
        await db.$disconnect();
      }

      // Paso 2 — listado (R1, R5, R6): desde el menú, con los filtros por defecto en la URL limpia.
      await sa
        .getByRole("navigation", { name: "Navegación principal" })
        .getByRole("link", { name: TEXTO_MODULO.menu, exact: true })
        .click();
      await expect(sa).toHaveURL(/\/plataforma\/reportes$/);
      await expect(sa.getByRole("heading", { level: 1, name: TEXTO_MODULO.tituloListado })).toBeVisible();
      const filtroEstado = sa.getByRole("combobox", { name: TEXTO_MODULO.filtroEstado, exact: true });
      await expect(filtroEstado).toHaveText(TEXTO_MODULO.pendientes);

      // La empresa de la corrida: así la fila no se va a otra página por los reportes de otras corridas.
      await elegirOpcion(
        sa,
        sa.getByRole("combobox", { name: TEXTO_MODULO.filtroEmpresa, exact: true }),
        nombreEmpresa,
      );
      await expect(sa).toHaveURL(new RegExp(`[?&]empresa=${empresa.organizacionId}(&|$)`));
      await expect(filtroEstado).toHaveText(TEXTO_MODULO.pendientes);

      const fila = filaDelReporte(sa);
      await expect(fila).toHaveCount(1);
      await expect(fila).toContainText(nombreEmpresa);
      await expect(fila).toContainText(empresa.maestro.nombre);
      await expect(fila.getByRole("cell", { name: TEXTO_MODULO.rolMaestro, exact: true })).toBeVisible();
      await expect(fila.getByText(TEXTO_MODULO.nuevo, { exact: true })).toBeVisible();
      await expect(fila).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);

      // Paso 3 — detalle (R6, R14, R22): la fila lleva al detalle de ESE reporte.
      await fila.getByRole("link").click();
      await expect(sa).toHaveURL(/\/plataforma\/reportes\/[0-9a-f-]{36}$/);
      await expect(
        sa.getByRole("heading", { level: 1, name: TEXTO_MODULO.tituloDetalle, exact: true }),
      ).toBeVisible();
      await expect(bloque(sa, TEXTO_MODULO.bloqueDescripcion)).toContainText(descripcion);
      const contexto = bloque(sa, TEXTO_MODULO.bloqueContexto);
      await expect(contexto).toContainText(nombreEmpresa);
      await expect(contexto).toContainText(empresa.maestro.nombre);
      await expect(contexto).toContainText(empresa.maestro.email);
      await expect(contexto.getByText("/ordenes", { exact: true })).toBeVisible();
      const historial = bloque(sa, TEXTO_MODULO.bloqueHistorial);
      await expect(historial.getByText(TEXTO_MODULO.historialVacio, { exact: true })).toBeVisible();
      const entradas = historial.getByRole("listitem");

      // Paso 4 — primer cambio (R17, R20, R21, R22): «En revisión» con una nota de esta corrida.
      const estado = bloque(sa, TEXTO_MODULO.bloqueEstado);
      const destino = estado.getByRole("combobox", { name: TEXTO_MODULO.nuevoEstado, exact: true });
      await expect(estado.getByText(TEXTO_MODULO.nuevo, { exact: true })).toBeVisible();
      const nota = `Nota E2E SLT-97 ${randomUUID()}`;
      await elegirOpcion(sa, destino, TEXTO_MODULO.enRevision);
      await estado.getByLabel(TEXTO_MODULO.nota, { exact: true }).fill(nota);
      await expect(estado.getByText(`${nota.length}/500`, { exact: true })).toBeVisible();
      await estado.getByRole("button", { name: TEXTO_MODULO.cambiarEstado }).click();
      await expect(estado.getByRole("status")).toHaveText(TEXTO_MODULO.exito, { timeout: 30_000 });
      // El historial nuevo llega con el `router.refresh()`: se espera a él, no a un tiempo.
      await expect(entradas).toHaveCount(1, { timeout: 30_000 });
      await expect(entradas.nth(0)).toContainText(`${TEXTO_MODULO.nuevo} → ${TEXTO_MODULO.enRevision}`);
      await expect(entradas.nth(0)).toContainText(nota);
      await expect(entradas.nth(0)).toContainText(SUPERADMIN_DE_PRUEBA.SUPERADMIN_NOMBRE);
      await expect(estado.getByText(TEXTO_MODULO.enRevision, { exact: true })).toBeVisible();

      // Paso 5 — segundo cambio (R17, R19, R22): «Resuelto» sin nota; el formulario se va.
      await elegirOpcion(sa, destino, TEXTO_MODULO.resuelto);
      await expect(estado.getByLabel(TEXTO_MODULO.nota, { exact: true })).toHaveValue("");
      await estado.getByRole("button", { name: TEXTO_MODULO.cambiarEstado }).click();
      await expect(entradas).toHaveCount(2, { timeout: 30_000 });
      await expect(entradas.nth(0)).toContainText(`${TEXTO_MODULO.enRevision} → ${TEXTO_MODULO.resuelto}`);
      await expect(entradas.nth(0)).toContainText(TEXTO_MODULO.sinNota);
      await expect(entradas.nth(1)).toContainText(`${TEXTO_MODULO.nuevo} → ${TEXTO_MODULO.enRevision}`);
      await expect(entradas.nth(1)).toContainText(nota);
      await expect(estado.getByText(TEXTO_MODULO.cerrado, { exact: true })).toBeVisible();
      await expect(estado.getByText(TEXTO_MODULO.resuelto, { exact: true })).toBeVisible();
      await expect(estado.getByRole("combobox")).toHaveCount(0);
      await expect(estado.getByRole("textbox")).toHaveCount(0);
      await expect(estado.getByRole("button", { name: TEXTO_MODULO.cambiarEstado })).toHaveCount(0);

      sesionSuperadmin = await ctx.cookies();
    } finally {
      await ctx.close();
    }
  });

  test("un resuelto no está en Pendientes y sí en Todos", async ({ page }) => {
    // Paso 6 (R7): usa el reporte resuelto y la sesión del caso anterior.
    expect(sesionSuperadmin.length, "no hay sesión del superadmin: falló el caso anterior").toBeGreaterThan(0);
    expect(descripcion, "no hay reporte: falló el caso anterior").not.toBe("");
    await page.context().addCookies(sesionSuperadmin);
    await page.goto(`/plataforma/reportes?empresa=${empresa.organizacionId}`);

    // Anti-vacío: el listado se pintó con la empresa y «Pendientes»; sin esto, una página caída también
    // daría «no está la fila».
    await expect(page.getByRole("heading", { level: 1, name: TEXTO_MODULO.tituloListado })).toBeVisible();
    const filtroEstado = page.getByRole("combobox", { name: TEXTO_MODULO.filtroEstado, exact: true });
    await expect(filtroEstado).toHaveText(TEXTO_MODULO.pendientes);
    await expect(page.getByRole("combobox", { name: TEXTO_MODULO.filtroEmpresa, exact: true })).toHaveText(
      nombreEmpresa,
    );
    await expect(page.getByText(TEXTO_MODULO.cargaError)).toHaveCount(0);
    await expect(filaDelReporte(page)).toHaveCount(0);

    await elegirOpcion(page, filtroEstado, TEXTO_MODULO.todos);
    await expect(page).toHaveURL(/[?&]estado=todos(&|$)/);
    await expect(page).toHaveURL(new RegExp(`[?&]empresa=${empresa.organizacionId}(&|$)`));
    const fila = filaDelReporte(page);
    await expect(fila).toHaveCount(1);
    await expect(fila.getByText(TEXTO_MODULO.resuelto, { exact: true })).toBeVisible();
  });
});

/*
 * R2 fuera del describe en serie: no depende de los casos del superadmin, así que no cae con ellos ni
 * los espera. Crea su propia empresa (nombre con sufijo único de la fábrica), así que dos corridas
 * sobre la misma base no chocan.
 */
test.describe("SLT-97 — el módulo no es de la empresa", () => {
  let sesionDelMaestro: Cookie[] = [];

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const propia = await crearEmpresaE2E("reportes-sin-modulo");
    sesionDelMaestro = await sesionDe(browser, propia.maestro);
  });

  test("el maestro ve no encontrado en /plataforma/reportes", async ({ page }) => {
    expect(sesionDelMaestro.length, "no hay sesión del maestro: falló el beforeAll").toBeGreaterThan(0);
    await page.context().addCookies(sesionDelMaestro);

    // R2: su menú no tiene «Reportes» (anti-vacío: `enlacesDelMenu` espera a que el menú se pinte)…
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);
    expect(await enlacesDelMenu(page)).not.toContain(TEXTO_MODULO.menu);

    // …y la dirección escrita a mano le da el 404 del portal, sin nada del listado.
    await page.goto("/plataforma/reportes");
    await expect(page.getByRole("heading", { level: 1, name: NO_ENCONTRADO })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: TEXTO_MODULO.tituloListado })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: TEXTO_MODULO.filtroEstado, exact: true })).toHaveCount(0);
  });
});
