import { test, expect, type Cookie, type Page } from "@playwright/test";

import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E, sesionDe, type UsuarioE2E } from "../tests/fabricas/e2e";

import { crearZonaE2E } from "./_aislamiento-datos";

/**
 * E2E de "/analitica" — LOS RECORTES POR ROL (Feature 133, T7.1 / R28; deber heredado de
 * la 132, Q5: «el E2E se hace una sola vez en la 133»). Reescrito por SL-44 T4.3 contra la
 * pantalla de HOY.
 *
 * QUE PRUEBA ESTE ARCHIVO Y QUE NO. Esto es un recorte de PRESENTACION: comprueba QUE SE
 * PINTA en la pantalla de cada rol. **Un panel que no se pinta NO es un dato que no se
 * filtra.** El recorte de DATOS lo garantiza la 122 (`lib/analytics/alcance.ts`,
 * `lib/analytics/alcance-columnas.ts`), en el SERVIDOR y antes de tocar la base, y NINGUNA
 * aserción de este archivo lo prueba ni lo sustituye
 * (`specs/133-analitica-recortes-por-rol/requirements.md §0`, R20/R21).
 *
 * LA PANTALLA DE HOY (leída en el código, 2026-10-24). `AnaliticaShell` solo pinta su slot
 * `destacado`: las regiones «Filtros», «Tablero operativo» y «Tablero financiero» están
 * COMENTADAS, y la sección de finanzas de `page.tsx` también (decisión humana del 2026-08-18).
 * Lo que la 133 afirmaba sobre esas regiones (R6, R7, R10, R11, R14, R15, R17) no tiene hoy
 * superficie que mirar, y este archivo ya no lo afirma: volverá cuando se enciendan. El recorte
 * por rol que SÍ se pinta es el de las secciones del slot `destacado`:
 *
 *  1. «Detalle - Movimiento de las órdenes» y «Detalle - Cohorte de carga» se pintan para todo
 *     rol que entra. Son el ANTI-VACÍO de cada caso: una página que no cargara (login roto,
 *     404, servidor caído) tampoco tendría la sección de productos y el caso 2 daría verde.
 *  2. «Detalle - Productos» (ficha 345, `ALCANCE_PRODUCTOS`): la ven `maestro` y `adminTienda`;
 *     a `adminSatelite` NO se le pinta nada, ni encabezado ni estado vacío en su lugar (R5 de
 *     la 345).
 *  3. `mensajero` NO entra (decisión del humano, 2026-08-12): ni ve la entrada en el menú ni
 *     alcanza la pantalla escribiendo la ruta a mano. El caso mide LAS DOS capas a la vez,
 *     porque ocultar el enlace sin cerrar la ruta es el error fácil de cometer aquí.
 *
 * QUE MUTACION MATA: dar a `adminSatelite` la sección de productos
 * (`ALCANCE_PRODUCTOS.adminSatelite: "prohibido"` → `"acotado"`, `lib/analytics/metrics.ts`).
 * Con ella cae el caso 2 de `adminSatelite` y solo él.
 *
 * Los oráculos de abajo (títulos de sección) se escriben A MANO a propósito: derivarlos de
 * `page.tsx` o de `lib/analytics/` convertiría el test en una tautología del código que juzga.
 *
 * DATOS (SL-44 T4.3; R7, R8). El `beforeAll` crea una empresa (`crearEmpresaE2E`, con su
 * `maestro`), una zona satélite (`ZonaService`) y, por el servicio de «Usuarios», un
 * `adminTienda` (él ES la tienda), un `adminSatelite` y un `mensajero` de esa zona, para que
 * `resolverAlcance` no les deniegue (R13 de la 122). Cada uno entra por `/login` con su
 * dispositivo confiado (`sesionDe`). No hace falta ningún dato de órdenes: las secciones se
 * pintan con su encabezado aunque no haya filas.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test --project=aislamiento` (Playwright levanta el
 * servidor; base local migrada y con `pnpm run db:seed`). Sin base, el `beforeAll` FALLA.
 */

/* -------------------------------------------------------------------------- */
/* Sesiones de la corrida (una por rol del recorrido)                          */
/* -------------------------------------------------------------------------- */

type RolDelRecorrido = "maestro" | "adminTienda" | "adminSatelite" | "mensajero";

const sesiones: Partial<Record<RolDelRecorrido, Cookie[]>> = {};

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const db = abrirBaseE2E();
  try {
    const e = await crearEmpresaE2E("analitica");
    const zona = await crearZonaE2E(db, e, { esCentral: false });
    const usuarios: Record<RolDelRecorrido, UsuarioE2E> = {
      maestro: e.maestro,
      adminTienda: await crearUsuarioE2E(e, "adminTienda"),
      adminSatelite: await crearUsuarioE2E(e, "adminSatelite", { zonaId: zona.id }),
      mensajero: await crearUsuarioE2E(e, "mensajero", { zonaId: zona.id }),
    };
    for (const [rol, u] of Object.entries(usuarios) as [RolDelRecorrido, UsuarioE2E][]) {
      sesiones[rol] = await sesionDe(browser, u);
    }
  } finally {
    await db.$disconnect();
  }
});

/* -------------------------------------------------------------------------- */
/* Oráculos, escritos a mano (no derivados del código que juzgan)              */
/* -------------------------------------------------------------------------- */

/** Las secciones que se pintan para todo rol que entra. */
const SECCIONES_DE_TODOS = ["Detalle - Movimiento de las órdenes", "Detalle - Cohorte de carga"] as const;

/** La sección que `ALCANCE_PRODUCTOS` recorta por rol. */
const SECCION_PRODUCTOS = "Detalle - Productos";

/** Quién ve la sección de productos (ficha 345) y quién no. */
const PRODUCTOS_POR_ROL = [
  { rol: "maestro", ve: true },
  { rol: "adminTienda", ve: true },
  { rol: "adminSatelite", ve: false },
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Pone la sesión del rol (la del `/login` real del `beforeAll`) y aterriza en la app. Fuera de
 * `/login` es la prueba de que la sesión vale.
 */
async function login(page: Page, rol: RolDelRecorrido) {
  const sesion = sesiones[rol];
  expect(sesion?.length ?? 0, `no hay sesión de ${rol}: falló el beforeAll`).toBeGreaterThan(0);
  await page.context().addCookies(sesion ?? []);
  await page.goto("/dashboard");
  await expect(page).not.toHaveURL(/\/login/);
}

/** El título de una sección de analítica (`ContenedorSeccion` lo pinta en `card-title`). */
function tituloDeSeccion(page: Page, titulo: string) {
  return page.locator('[data-slot="card-title"]').filter({ hasText: new RegExp(`^${titulo}$`) });
}

/** Entra a `/analitica` y espera a que la página esté PINTADA (encabezado + secciones de todos). */
async function irAAnalitica(page: Page) {
  await page.goto("/analitica");
  await expect(page.getByRole("heading", { level: 1, name: "Analítica" })).toBeVisible();
  for (const titulo of SECCIONES_DE_TODOS) {
    await expect(tituloDeSeccion(page, titulo), `la sección «${titulo}»`).toHaveCount(1);
  }
}

/* -------------------------------------------------------------------------- */
/* 1 y 2 — las secciones de todos, y la de productos por rol                    */
/* -------------------------------------------------------------------------- */

test.describe("Analítica por rol — qué secciones se pintan", () => {
  for (const { rol, ve } of PRODUCTOS_POR_ROL) {
    test(`\`${rol}\` entra, ve las secciones de todos y ${ve ? "SÍ" : "NO"} ve «${SECCION_PRODUCTOS}»`, async ({
      page,
    }) => {
      await login(page, rol);
      await irAAnalitica(page);

      // «No ofrecer es no dibujar» (R5 de la 345): ni encabezado ni estado vacío en su lugar.
      await expect(tituloDeSeccion(page, SECCION_PRODUCTOS)).toHaveCount(ve ? 1 : 0);
      if (!ve) {
        expect(await page.locator("body").innerText()).not.toContain(SECCION_PRODUCTOS);
      }
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 3 — el mensajero: puerta cerrada en las DOS capas (2026-08-12)              */
/* -------------------------------------------------------------------------- */

test.describe("Analítica — el mensajero no la ve ni la alcanza", () => {
  test("`mensajero` no tiene entrada en el menú y escribir /analitica no le abre la pantalla", async ({
    page,
  }) => {
    await login(page, "mensajero");

    // CAPA 1 — el menú no la ofrece. Con `exact: true` para no cazar de rebote otra
    // etiqueta que la contenga.
    await expect(page.getByRole("link", { name: "Analítica", exact: true })).toHaveCount(0);

    // ANTI-VACÍO: la sesión está viva y el menú SÍ está pintado. Sin esto, un login roto
    // haría pasar todo lo de arriba y lo de abajo por «no hay página».
    await expect(page.getByRole("link", { name: /^Reparto$/ }).first()).toBeVisible();

    // CAPA 2 — la ruta a mano tampoco. Ocultar el enlace sin cerrar el gate es
    // exactamente la mutación que este caso mata.
    await page.goto("/analitica");
    await expect(page.getByRole("heading", { name: "Analítica" })).toHaveCount(0);
    for (const titulo of [...SECCIONES_DE_TODOS, SECCION_PRODUCTOS]) {
      await expect(tituloDeSeccion(page, titulo)).toHaveCount(0);
    }
  });
});
