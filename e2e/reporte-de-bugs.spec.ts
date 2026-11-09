import { randomUUID } from "node:crypto";

import { test, expect, devices, type Browser, type BrowserContext, type Cookie, type Page } from "@playwright/test";

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
  entrarConOtp,
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
