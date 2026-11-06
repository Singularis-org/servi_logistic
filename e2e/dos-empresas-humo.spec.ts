import { randomBytes } from "node:crypto";

import { test, expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import type { ModuloApagable, PrismaClient } from "@prisma/client";

import { ORDEN_MODULOS } from "../lib/modulos/catalogo";
import { crearUsuarioE2E, sesionDe, type EmpresaE2E } from "../tests/fabricas/e2e";

import {
  clienteDueno,
  LogDelServidor,
  patronDeMarcador,
  rutasDelMenuDelMaestro,
  sembrarDatos,
  type DatosSembrados,
  type Empresa,
  type Letra,
} from "./_dos-empresas-fixture";
import {
  asignarPlanCustom,
  crearOrdenesDirectas,
  csvDeUnaFila,
  enlazarDistritoDeLaPlantilla,
  ordenesDesdeLaEntrada,
  type EmpresaConZona,
} from "./_planes-fixture";
import {
  altaDeEmpresaPorPantalla,
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  entrarConOtp,
  fijarModulosPorPantalla,
  olvidarDispositivos,
  recuperarContrasena,
  SUPERADMIN_DE_PRUEBA,
  type AltaPorPantalla,
} from "./_superadmin-fixture";

/**
 * SL-17 T4.2 — humo de aceptación de dos empresas (D19, R47; design §9.3). Desde SL-44 (D16;
 * R16, R17) el alta y el primer acceso van por la pantalla, sin SMTP.
 *
 * 1. Alta: el superadmin de prueba (`asegurarSuperadmin`, el mismo de los E2E de SL-32) entra con
 *    OTP y da de alta A y B desde `/plataforma/empresas`. Que repetir el alta no cree otra la
 *    cubren `superadmin-empresas.spec.ts` (por la pantalla) y
 *    `tests/integration/db/organizacion-alta.test.ts` (`ya_existe`, R45).
 * 2. Primer acceso: cada maestro entra por «¿Olvidaste tu contraseña?» con el enlace que el
 *    emisor de consola escribió en el log del servidor para SU correo (SL-44 R15; desde SL-18 R32,
 *    un enlace y no un código), fija su contraseña y después entra por `/login` con el OTP de
 *    dispositivo nuevo. No se exige SMTP
 *    ni `messageId`: el correo consta en el log como enviado a ese maestro (R17).
 * 3. Datos: en cada empresa, con `fijarEmpresa`, lo mínimo de cada pantalla, con marcadores
 *    `A-<uuid>` / `B-<uuid>` en sus textos visibles (excepción de R8 de SL-44, `design.md > D4`:
 *    son marcadores para buscar fugas, y las pantallas que los crean no son lo que prueba el humo).
 * 4. Recorrido: cada maestro visita TODAS las rutas del menú del maestro según
 *    `lib/auth/menu-visibility.ts`. En cada una: ni la pantalla de error de `app/(app)/error.tsx`, ni
 *    «no encontrado», ni un 5xx, ni `EmpresaNoResuelta` en el log del servidor; y ningún marcador de
 *    la otra empresa, ni en el texto ni en el HTML (que lleva el payload de RSC).
 * 5. B abriendo los detalles de A (estado de cuenta de su tienda y de su mensajero) ve «no
 *    encontrado»; A abriendo los mismos ve su marcador (el control que hace falsable el anterior).
 *    La app no tiene una URL de detalle de orden: el detalle de la orden se abre dentro de `/ordenes`.
 * 6. Módulos (SL-23, design §10; R15, R16, R23, R25, R26): tras el alta, el superadmin abre el
 *    detalle de cada empresa y enciende por la pantalla los 3 módulos de A y todos menos «Ranking»
 *    de B. Cada maestro recorre solo las rutas de SU menú (`rutasDelMenuDelMaestro(apagados)`): A
 *    las recorre todas, como antes de SL-23 (R23). Y B no ve «Ranking» en el menú y recibe «No
 *    encontramos esta página» en `/ranking` y `/ranking/historico`, mientras A lo ve y lo abre.
 * 7. Vehículos y geografía ya no son del maestro. SL-42 (R16) retiró `/configuracion/vehiculos`: el
 *    catálogo es de la plataforma, así que el humo comprueba el 404 y que la base no cambia (antes,
 *    SL-17 R40, comprobaba que escribir desde esa pantalla fallaba cerrado). Desde SL-32 (R24, R26) su
 *    página le da 404, así que el humo comprueba el 404 y que no queda ninguna provincia nueva. Lo
 *    ajustó SL-32 el 2026-10-23, al mergear después de SL-17.
 * 8. Planes (SL-24, design §11.1; SLT-86 R8): va el último, para no cambiar lo que recorren los casos
 *    de arriba. A recibe un plan custom (con los 4 módulos: no apaga ninguno) y 2 órdenes más. Su
 *    tienda sube por la carga masiva de `/ordenes` un `.csv` de una fila, confirma y la ve creada, igual
 *    que la tienda de B, sin plan. Hasta SLT-86 el plan de A tenía tope de 2 órdenes por ciclo y la
 *    fila salía en error con «Tu plan permite 2 órdenes por ciclo…»; SLT-86 (R8) quitó ese tope, así
 *    que se retiró ese tramo (el mensaje y la carga real rechazada) y el caso prueba lo contrario.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test --project=aislamiento`. Playwright levanta el servidor
 * con `AUTH_OTP_DEBUG_LOG=1`, sin SMTP y con su log en `E2E_LOG_SERVIDOR`; la base es local,
 * migrada y con `pnpm run db:seed` (una base remota lo aborta antes de escribir). Sin el log, FALLA:
 * no se salta. Los correos son `@example.test` por corrida: una segunda corrida da de alta otras dos.
 */

test.describe.configure({ mode: "serial" });

const PANTALLA_DE_ERROR = "No pudimos cargar esta pantalla";
const NO_ENCONTRADO = "No encontramos esta página";

let dueno: PrismaClient | null = null;
let log: LogDelServidor | null = null;
const empresas: Partial<Record<Letra, Empresa>> = {};
/** El enlace de recuperación que el log del servidor recibió para cada maestro (R17; SL-18 R32). */
const enlacesDeRecuperacion: Partial<Record<Letra, string>> = {};
const datos: Partial<Record<Letra, DatosSembrados>> = {};
const cookies: Partial<Record<Letra, Awaited<ReturnType<BrowserContext["cookies"]>>>> = {};
/** SL-23 (R26): A con los 3 módulos encendidos; B con todos menos uno, «Ranking». */
const APAGADOS: Record<Letra, readonly ModuloApagable[]> = { A: [], B: ["ranking"] };
const rutas: Record<Letra, string[]> = {
  A: rutasDelMenuDelMaestro(APAGADOS.A),
  B: rutasDelMenuDelMaestro(APAGADOS.B),
};
const RUTAS_DE_RANKING = ["/ranking", "/ranking/historico"] as const;

function encendidosDe(letra: Letra): ModuloApagable[] {
  return ORDEN_MODULOS.filter((m) => !APAGADOS[letra].includes(m));
}

function otra(letra: Letra): Letra {
  return letra === "A" ? "B" : "A";
}

function empresa(letra: Letra): Empresa {
  const e = empresas[letra];
  if (!e) throw new Error(`no hay alta de ${letra}: falló el beforeAll`);
  return e;
}

function datosDe(letra: Letra): DatosSembrados {
  const d = datos[letra];
  if (!d) throw new Error(`no hay datos de ${letra}: falló el beforeAll`);
  return d;
}

function altaNueva(letra: Letra): AltaPorPantalla {
  const s = randomBytes(5).toString("hex");
  return {
    nombre: `Empresa humo ${letra} ${s}`,
    slug: `humo-${letra.toLowerCase()}-${s}`,
    maestroNombre: `Maestro ${letra} humo ${s}`,
    email: `humo-maestro-${letra.toLowerCase()}-${s}@example.test`,
    telefono: "88880000",
    documento: `humo-${letra.toLowerCase()}-${s}`,
  };
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(600_000);
  log = LogDelServidor.desdeEntorno();
  dueno = clienteDueno();
  const db = dueno;

  // 1. El superadmin da de alta A y B desde «Empresas».
  await conCandadoDelSuperadmin(() => asegurarSuperadmin(db));
  const ctxSa = await browser.newContext();
  const sa = await ctxSa.newPage();
  const altas: Partial<Record<Letra, AltaPorPantalla>> = {};
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(db, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(sa, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
    for (const letra of ["A", "B"] as const) {
      const d = altaNueva(letra);
      await altaDeEmpresaPorPantalla(sa, d);
      altas[letra] = d;
    }
    // SL-23 (R26): el alta deja solo el núcleo; los módulos se encienden desde el detalle.
    for (const letra of ["A", "B"] as const) {
      const d = altas[letra];
      if (!d) throw new Error(`no hay alta de ${letra}`);
      await fijarModulosPorPantalla(sa, d.nombre, encendidosDe(letra));
    }
  });
  await ctxSa.close();

  for (const letra of ["A", "B"] as const) {
    const d = altas[letra];
    if (!d) throw new Error(`no hay alta de ${letra}`);
    const org = await db.organizacion.findUniqueOrThrow({
      where: { slug: d.slug },
      select: { id: true, usuarios: { select: { id: true, email: true, rol: { select: { value: true } } } } },
    });
    const maestro = org.usuarios.find((u) => u.email === d.email && u.rol.value === "maestro");
    if (!maestro) throw new Error(`la empresa ${letra} no tiene el maestro del formulario`);

    // 2. Primer acceso por «¿Olvidaste tu contraseña?» y login con OTP, en su propio navegador.
    const password = `Aa1!${randomBytes(12).toString("base64url")}`;
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    enlacesDeRecuperacion[letra] = await recuperarContrasena(p, d.email, password);
    await entrarConOtp(p, d.email, password);
    cookies[letra] = await ctx.cookies();
    await ctx.close();

    empresas[letra] = { letra, organizacionId: org.id, maestroId: maestro.id, email: d.email, password, slug: d.slug };
    // 3. Los datos marcados.
    datos[letra] = await sembrarDatos(db, empresa(letra));
  }
});

test.afterAll(async () => {
  // La base es desechable: no se borra nada.
  await dueno?.$disconnect();
});

async function abrirComo(letra: Letra, page: Page): Promise<number[]> {
  const sesion = cookies[letra];
  expect(sesion?.length ?? 0, `no hay sesión de ${letra}: el login del beforeAll no dejó cookies`).toBeGreaterThan(0);
  await page.context().addCookies(sesion ?? []);
  const errores5xx: number[] = [];
  page.on("response", (r) => {
    if (r.status() >= 500) errores5xx.push(r.status());
  });
  return errores5xx;
}

/** Visita una ruta y devuelve lo que el humo mira en ella. */
async function visitar(page: Page, ruta: string): Promise<{ texto: string; html: string; estado: number | null }> {
  const respuesta = await page.goto(ruta, { waitUntil: "load", timeout: 180_000 });
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => undefined);
  const texto = await page.locator("body").innerText();
  const html = await page.content();
  return { texto, html, estado: respuesta?.status() ?? null };
}

test("alta de A y B desde «Empresas» por el superadmin, y el correo de recuperación de cada maestro consta en el log (R16, R17)", async () => {
  const db = dueno;
  if (!db) throw new Error("sin cliente de base: falló el beforeAll");
  for (const letra of ["A", "B"] as const) {
    const e = empresa(letra);
    const org = await db.organizacion.findUniqueOrThrow({
      where: { id: e.organizacionId },
      select: { slug: true, usuarios: { select: { email: true, rol: { select: { value: true } } } } },
    });
    expect(org.slug, `slug de ${letra}`).toBe(e.slug);
    // Los demás usuarios son los de `sembrarDatos`; maestro hay uno, el del formulario.
    const maestros = org.usuarios.filter((u) => u.rol.value === "maestro").map((u) => u.email);
    expect(maestros, `${letra}: el alta deja un solo maestro, el del formulario`).toEqual([e.email]);
    // `recuperarContrasena` lo leyó de la línea `[email][debug] to=<correo del maestro>`.
    // El valor de `#enlace=`: `<challengeId>.<secreto>` (SL-18 R32).
    expect(enlacesDeRecuperacion[letra], `${letra}: el log no recibió el correo de recuperación de su maestro`).toMatch(
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
    );
    expect(cookies[letra]?.some((c) => c.name === "session"), `${letra}: el maestro no quedó con sesión`).toBe(true);
    console.log(`[humo] correo de recuperación de ${letra}: en el log, enviado a su maestro`);
  }
  expect(empresa("A").organizacionId).not.toBe(empresa("B").organizacionId);
});

for (const letra of ["A", "B"] as const) {
  test(`el maestro de ${letra} recorre todas las rutas de su menú sin error ni datos de ${otra(letra)}`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    expect(rutas[letra].length, "el menú del maestro no dio rutas").toBeGreaterThan(0);
    const errores5xx = await abrirComo(letra, page);
    const ajenos = patronDeMarcador(otra(letra));
    const propios = datosDe(letra).marcadores;
    const vistos = new Set<string>();
    log?.nuevo();

    for (const ruta of rutas[letra]) {
      const antes = errores5xx.length;
      const { texto, html, estado } = await visitar(page, ruta);
      const delServidor = log?.nuevo() ?? "";
      const fugas = Array.from(new Set([...(texto.match(ajenos) ?? []), ...(html.match(ajenos) ?? [])]));
      for (const [clave, marcador] of Object.entries(propios)) {
        if (html.includes(marcador)) vistos.add(clave);
      }
      const resumen = {
        ruta,
        estado,
        error: texto.includes(PANTALLA_DE_ERROR),
        noEncontrado: texto.includes(NO_ENCONTRADO),
        cincoXX: errores5xx.slice(antes),
        empresaNoResuelta: delServidor.includes("EmpresaNoResuelta"),
        fugas,
      };
      console.log(`[humo ${letra}] ${JSON.stringify(resumen)}`);
      expect.soft(resumen.estado, `${ruta}: estado HTTP`).toBeLessThan(400);
      expect.soft(resumen.error, `${ruta}: pantalla de error`).toBe(false);
      expect.soft(resumen.noEncontrado, `${ruta}: «no encontrado» en una ruta del menú`).toBe(false);
      expect.soft(resumen.cincoXX, `${ruta}: respuestas 5xx`).toEqual([]);
      expect.soft(resumen.empresaNoResuelta, `${ruta}: EmpresaNoResuelta en el log del servidor`).toBe(false);
      expect.soft(fugas, `${ruta}: marcadores de ${otra(letra)} en una pantalla de ${letra}`).toEqual([]);
    }

    // Control: si los datos propios no se ven en ninguna pantalla, «no hay marcadores ajenos» no
    // prueba nada. Cada dato marcado tiene que aparecer en al menos una ruta del menú; la URL del
    // webhook no está en ninguna (se lee al abrir su modal) y la comprueba el test del webhook.
    console.log(`[humo ${letra}] marcadores propios vistos: ${[...vistos].sort().join(", ")}`);
    expect([...vistos].sort(), `${letra}: datos propios que no se ven en ninguna ruta`).toEqual(
      Object.keys(propios).filter((k) => k !== "webhook").sort(),
    );
  });
}

test("cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  for (const letra of ["A", "B"] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errores5xx = await abrirComo(letra, page);
    const { apiKey, webhook } = datosDe(letra).marcadores;
    await visitar(page, "/configuracion/api");
    const fila = page.locator("tr", { hasText: apiKey });
    await fila.locator("button", { hasText: "Editar" }).click({ timeout: 60_000 });
    const valores = (): Promise<string> =>
      page.evaluate(() => Array.from(document.querySelectorAll("input")).map((i) => i.value).join(" "));
    await expect.poll(valores, { message: `${letra}: el modal no trae la URL de su webhook`, timeout: 30_000 }).toContain(webhook);
    const ajenos = (await valores()).match(patronDeMarcador(otra(letra))) ?? [];
    console.log(`[humo webhook ${letra}] URL propia en el modal; marcadores ajenos: ${ajenos.length}`);
    expect.soft(ajenos, `${letra}: el modal del webhook trae datos de ${otra(letra)}`).toEqual([]);
    expect.soft(errores5xx, `${letra}: respuestas 5xx en el webhook`).toEqual([]);
    await ctx.close();
  }
});

test("B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const a = datosDe("A");
  const detalles = [
    { ruta: `/wallet/tiendas/${a.tiendaId}`, marcador: a.marcadores.tienda },
    { ruta: `/wallet/mensajeros/${a.mensajeroId}`, marcador: a.marcadores.mensajero },
  ];
  for (const letra of ["A", "B"] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errores5xx = await abrirComo(letra, page);
    for (const { ruta, marcador } of detalles) {
      const { texto, html } = await visitar(page, ruta);
      console.log(`[humo detalle ${letra}] ${ruta}: noEncontrado=${texto.includes(NO_ENCONTRADO)} marcador=${html.includes(marcador)}`);
      if (letra === "A") {
        expect.soft(texto.includes(NO_ENCONTRADO), `A en su propio ${ruta}`).toBe(false);
        expect.soft(texto.includes(marcador), `A no ve su marcador en ${ruta}`).toBe(true);
      } else {
        expect.soft(texto.includes(NO_ENCONTRADO), `B en ${ruta} de A`).toBe(true);
        expect.soft(html.includes(marcador), `B ve el marcador de A en ${ruta}`).toBe(false);
      }
      expect.soft(texto.includes(PANTALLA_DE_ERROR), `${letra} en ${ruta}: pantalla de error`).toBe(false);
    }
    expect.soft(errores5xx, `${letra}: respuestas 5xx en los detalles`).toEqual([]);
    await ctx.close();
  }
});

test("SL-23: el superadmin dejó A con los 3 módulos y B sin «Ranking»; B no lo ve ni lo abre, A sí (R15, R16, R25, R26)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const db = dueno;
  if (!db) throw new Error("sin cliente de base: falló el beforeAll");

  // Lo que la pantalla del superadmin escribió, empresa por empresa (R25: lo de B no toca A).
  for (const letra of ["A", "B"] as const) {
    const filas = await db.organizacionModulo.findMany({
      where: { organizacionId: empresa(letra).organizacionId },
      select: { modulo: true },
    });
    expect(filas.map((f) => f.modulo).sort(), `${letra}: módulos encendidos en la base`).toEqual(
      [...encendidosDe(letra)].sort(),
    );
  }
  expect(rutas.A, "A: el menú recorrido incluye el ranking").toEqual(expect.arrayContaining([...RUTAS_DE_RANKING]));
  for (const ruta of RUTAS_DE_RANKING) {
    expect(rutas.B, `B: ${ruta} no está entre las rutas de su menú`).not.toContain(ruta);
  }

  for (const letra of ["A", "B"] as const) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errores5xx = await abrirComo(letra, page);

    // R15: el desplegable «Ranking» del menú (un botón, no un enlace) solo está en A.
    await visitar(page, "/dashboard");
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav, `${letra}: no se pintó el menú`).toBeVisible({ timeout: 60_000 });
    const ranking = nav.getByRole("button", { name: "Ranking", exact: true });
    const enMenu = await ranking.count();
    console.log(`[humo módulos ${letra}] «Ranking» en el menú: ${enMenu}`);
    expect.soft(enMenu, `${letra}: «Ranking» en el menú`).toBe(letra === "A" ? 1 : 0);

    // R16: por URL, B recibe el 404 de la app; A abre las dos pantallas sin error.
    for (const ruta of RUTAS_DE_RANKING) {
      const { texto, estado } = await visitar(page, ruta);
      const noEncontrado = texto.includes(NO_ENCONTRADO);
      console.log(`[humo módulos ${letra}] ${ruta}: estado=${estado} noEncontrado=${noEncontrado}`);
      if (letra === "A") {
        expect.soft(estado, `A en ${ruta}: estado HTTP`).toBeLessThan(400);
        expect.soft(noEncontrado, `A en ${ruta}: «no encontrado»`).toBe(false);
      } else {
        expect.soft(estado, `B en ${ruta}: estado HTTP`).toBe(404);
        expect.soft(noEncontrado, `B en ${ruta}: no ve «no encontrado»`).toBe(true);
      }
      expect.soft(texto.includes(PANTALLA_DE_ERROR), `${letra} en ${ruta}: pantalla de error`).toBe(false);
    }
    expect.soft(errores5xx, `${letra}: respuestas 5xx en el ranking`).toEqual([]);
    await ctx.close();
  }
});

test("vehículos (SL-42 R16) y geografía (SL-32 R26) le dan 404 al maestro, y sus catálogos no cambian", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const db = dueno;
  if (!db) throw new Error("sin cliente de base: falló el beforeAll");
  const errores5xx = await abrirComo("A", page);

  // SL-42 R16: la ruta ya no existe; el 404 vale para todo rol. Se compara el catálogo entero
  // (ids y estado), no solo el recuento: ni una fila nueva ni un cambio de nombre o de estado.
  const catalogo = () =>
    db.vehiculo.findMany({ select: { id: true, name: true, activo: true }, orderBy: { id: "asc" } });
  const vehiculosAntes = await catalogo();
  const v = await visitar(page, "/configuracion/vehiculos");
  expect.soft(v.estado, "vehículos: el maestro no recibe 404").toBe(404);
  expect.soft(v.texto.includes(NO_ENCONTRADO), "vehículos: el maestro no ve «no encontrado»").toBe(true);
  expect.soft(v.texto.includes("Tipos de vehículo"), "vehículos: el maestro ve el catálogo").toBe(false);
  expect.soft(await catalogo(), "vehículos: cambió el catálogo").toEqual(vehiculosAntes);

  const provinciasAntes = await db.provincia.count();
  // SL-32 R26: la página no tiene formulario para el maestro, así que no hay provincia que intentar crear.
  // SL-20 R22: desde SL-20 la ruta ya no existe; el 404 vale para todo rol.
  const g = await visitar(page, "/configuracion/geografia");
  expect.soft(g.estado, "geografía: el maestro no recibe 404").toBe(404);
  expect.soft(g.texto.includes(NO_ENCONTRADO), "geografía: el maestro no ve «no encontrado»").toBe(true);
  expect.soft(g.texto.includes("Catálogo geográfico"), "geografía: el maestro ve el catálogo").toBe(false);
  expect.soft(await db.provincia.count(), "geografía: cambió el catálogo").toBe(provinciasAntes);

  expect(errores5xx, "vehículos/geografía: respuestas 5xx").toEqual([]);
});

/**
 * Las órdenes que A ya tiene en el período antes de la carga. Eran el tope de su plan (SL-24 R33, tope 2);
 * SLT-86 (R8) quitó el tope de órdenes, así que ahora son las que la carga ya no debe mirar.
 */
const ORDENES_PREVIAS_DE_A = 2;

/** La empresa del humo como la pide `tests/fabricas/e2e.ts`: su maestro da de alta a la tienda. */
function comoEmpresaE2E(e: Empresa): EmpresaE2E {
  return {
    organizacionId: e.organizacionId,
    maestro: { id: e.maestroId, email: e.email, password: e.password, nombre: `Maestro ${e.letra}` },
    slug: e.slug,
  };
}

function conZona(letra: Letra): EmpresaConZona {
  const d = datosDe(letra);
  return { organizacionId: empresa(letra).organizacionId, tiendaId: d.tiendaId, zonaId: d.zonaId };
}

/** Abre la carga masiva de `/ordenes`, sube el `.csv` de una fila y espera la vista previa. */
async function subirUnaFila(page: Page, numRemision: string): Promise<Locator> {
  const { estado, texto } = await visitar(page, "/ordenes");
  expect(estado, "/ordenes: estado HTTP").toBeLessThan(400);
  expect(texto.includes(PANTALLA_DE_ERROR), "/ordenes: pantalla de error").toBe(false);
  await page.getByRole("button", { name: "Carga masiva", exact: true }).click({ timeout: 60_000 });
  const dialogo = page.getByRole("dialog");
  await dialogo.locator('input[type="file"]').setInputFiles({
    name: `carga-${numRemision}.csv`,
    mimeType: "text/csv",
    buffer: csvDeUnaFila(numRemision),
  });
  await expect(dialogo.getByRole("button", { name: /^Confirmar y cargar/ }), "la vista previa no llegó").toBeVisible({
    timeout: 120_000,
  });
  return dialogo;
}

test("SLT-86: la tienda de A, con plan y órdenes ya creadas, crea por la carga masiva igual que la de B, sin plan (R8; antes SL-24 R33)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const db = dueno;
  if (!db) throw new Error("sin cliente de base: falló el beforeAll");
  const remisiones: Record<Letra, string> = {
    A: `SL24-A-${randomBytes(5).toString("hex")}`,
    B: `SL24-B-${randomBytes(5).toString("hex")}`,
  };

  // 1. A con su plan (sin tope de órdenes, R8) y dos órdenes más en el período; B sigue sin plan.
  await asignarPlanCustom(db, empresa("A").organizacionId);
  const antes = await ordenesDesdeLaEntrada(db, empresa("A").organizacionId);
  await crearOrdenesDirectas(db, conZona("A"), ORDENES_PREVIAS_DE_A);
  expect(await ordenesDesdeLaEntrada(db, empresa("A").organizacionId), "A: órdenes del período antes de la carga").toBe(
    antes + ORDENES_PREVIAS_DE_A,
  );
  const sinPlan = await db.organizacion.findUniqueOrThrow({ where: { id: empresa("B").organizacionId }, select: { planId: true } });
  expect(sinPlan.planId, "B no debe tener plan").toBeNull();

  for (const letra of ["A", "B"] as const) {
    // La fila del archivo resuelve su zona por el distrito de la plantilla.
    await enlazarDistritoDeLaPlantilla(db, conZona(letra));
    const tienda = await crearUsuarioE2E(comoEmpresaE2E(empresa(letra)), "adminTienda");
    const ctx = await browser.newContext();
    await ctx.addCookies(await sesionDe(browser, tienda));
    const page = await ctx.newPage();
    const errores5xx: number[] = [];
    page.on("response", (r) => {
      if (r.status() >= 500) errores5xx.push(r.status());
    });
    const rem = remisiones[letra];

    // 2 y 3. La tienda sube su archivo de una fila, ve la vista previa y confirma. SLT-86 (R8): con plan
    // o sin él, la fila queda para cargar; ya no hay mensaje del tope de órdenes.
    const dialogo = await subirUnaFila(page, rem);
    const confirmar = dialogo.getByRole("button", { name: /^Confirmar y cargar/ });
    await expect(confirmar, `${letra}: la fila no quedó para cargar`).toHaveText("Confirmar y cargar 1 nueva");
    await expect(dialogo, `${letra}: la vista previa habla de un tope de órdenes`).not.toContainText("órdenes por ciclo");
    await confirmar.click();
    await expect(dialogo.getByText(rem).first(), `${letra}: el resumen no muestra la remisión creada`).toBeVisible({
      timeout: 120_000,
    });
    console.log(`[humo planes ${letra}] la carga creó ${rem}`);

    // 4 y 5. Por detrás: cada una tiene su remisión, y en su empresa.
    const enLaBase = await db.orden.findMany({ where: { numRemision: rem }, select: { organizacionId: true } });
    expect(enLaBase.map((o) => o.organizacionId), `${letra}: órdenes con la remisión ${rem}`).toEqual([
      empresa(letra).organizacionId,
    ]);
    expect(errores5xx, `${letra}: respuestas 5xx en la carga`).toEqual([]);
    await ctx.close();
  }
  expect(await ordenesDesdeLaEntrada(db, empresa("A").organizacionId), "A: la carga no sumó su orden al período").toBe(
    antes + ORDENES_PREVIAS_DE_A + 1,
  );
});
