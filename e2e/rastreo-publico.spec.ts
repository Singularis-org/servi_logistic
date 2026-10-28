import { randomInt } from "node:crypto";

import { test, expect } from "@playwright/test";

import { abrirBaseE2E, crearEmpresaE2E, crearUsuarioE2E } from "../tests/fabricas/e2e";

import { crearOrdenE2E, crearZonaE2E } from "./_aislamiento-datos";

/**
 * E2E — Rastreo público del envío desde la landing (Feature 229, T5.1).
 *
 * Cubre de punta a punta:
 *  - **R2** — la consulta se procesa SIN cookie de sesión: no redirige a `/login` ni exige
 *    autenticación. La Server Action se postea a `/`, que el middleware deja pasar por
 *    coincidencia EXACTA (`middleware.ts:62-65`); por eso esta feature no toca el middleware.
 *  - **R26** — el resultado se pinta DENTRO del mismo diálogo, sin navegar: la URL no cambia.
 *  - **R7** — guía inexistente y segundo factor errado producen el MISMO texto. Es el
 *    mecanismo anti-enumeración: `num_guia` es incremental y contiguo (`db/schema.prisma:483`),
 *    así que un borde que distinguiera «no existe» de «factor errado» sería un oráculo de la
 *    base de envíos aunque nunca acertara el factor.
 *
 * SIN SESIÓN, Y ES LA MITAD DEL PUNTO. Cada test corre con `storageState` vacío: con cookie,
 * `/` redirige a `/dashboard` (`middleware.ts:62-64`) y el modal es INALCANZABLE — consecuencia
 * aceptada y declarada del gate (design §0, F6). Si estos tests empezaran a fallar con un
 * «no se encontró el botón Rastrear envío», lo primero que hay que mirar es si el contexto
 * arrastra una sesión.
 *
 * SUPERFICIE (verificada en el código):
 *  - `app/_landing/LandingNav.tsx` monta `RastreoDialog` y le pasa el aspecto y el texto del
 *    botón «Rastrear envío», que hasta esta feature estaba `disabled`.
 *  - El diálogo (`role="dialog"`, título «Rastrear envío») lleva dos campos localizables por
 *    su etiqueta —«Número de guía» y «Últimos 4 dígitos del teléfono»— y el botón «Consultar».
 *  - El resultado es una `<ol>` de hitos públicos (`role="listitem"` por hito) con la guía
 *    consultada arriba. El rechazo es un `role="alert"` con texto único.
 *
 * DATOS (SL-44 T4.3; R7, R8). El `beforeAll` crea su empresa (`crearEmpresaE2E`), una tienda
 * (`crearUsuarioE2E`), una zona (`ZonaService`) y una orden con guía por la carga masiva de la
 * tienda (`BulkOrdenService.cargarMasiva`), que deja su primera fila de `orden_historial_estado`
 * (sin ninguna, no hay nada OCURRIDO que contar y el servidor responde igual que «no
 * encontrado», G10/R14). El factor son los últimos 4 dígitos del teléfono que el spec le pone a
 * esa orden. La guía inexistente se comprueba ausente en la base antes de usarla.
 *
 * El limitador de intentos es 8 en 10 minutos por IP (G4) y vive en la memoria del servidor: esta
 * suite hace 3 consultas, y cada corrida de Playwright arranca su servidor. Si se añaden casos,
 * ojo con el techo: un `demasiados_intentos` aparecería como un fallo raro y difícil de leer.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test --project=aislamiento` (Playwright levanta el
 * servidor; base local migrada y con `pnpm run db:seed`). Sin base, el `beforeAll` FALLA.
 */

/** Guía creada por el `beforeAll`, viva y con historial. */
let GUIA_SEMBRADA = "";
/** Últimos 4 dígitos del teléfono del destinatario de esa orden (segundo factor, G1). */
let FACTOR_SEMBRADO = "";
/** Una guía que no existe en la base. */
let GUIA_INEXISTENTE = "";

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const db = abrirBaseE2E();
  try {
    const e = await crearEmpresaE2E("rastreo");
    const tienda = await crearUsuarioE2E(e, "adminTienda");
    const zona = await crearZonaE2E(db, e);
    // Teléfono propio de la corrida: el factor no puede ser el de otra orden de la base.
    const factor = String(randomInt(1000, 10_000));
    const orden = await crearOrdenE2E(db, e, tienda, zona, `8877${factor}`);
    GUIA_SEMBRADA = String(orden.numGuia);
    FACTOR_SEMBRADO = factor;
    const inexistente = orden.numGuia + 900_000;
    expect(await db.orden.count({ where: { numGuia: inexistente } }), "la guía «inexistente» existe").toBe(0);
    GUIA_INEXISTENTE = String(inexistente);
  } finally {
    await db.$disconnect();
  }
});

/** El texto ÚNICO de rechazo (R28). Se escribe aquí una vez y se compara consigo mismo. */
const RECHAZO_UNICO =
  "No encontramos un envío con esos datos. Revisa el número de guía y los últimos 4 dígitos del teléfono.";

// Contexto LIMPIO: ni cookie de sesión ni almacenamiento previo.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Feature 229 — rastreo público sin sesión", () => {
  test("un visitante sin sesión consulta su envío desde la landing", async ({ page }) => {
    await page.goto("/");

    // R2 — sin cookie, `/` sirve la landing: no hay redirección a `/login`.
    await expect(page).toHaveURL(/\/$/);
    const urlAntes = page.url();

    const disparador = page.getByRole("button", { name: /Rastrear envío/ });
    await expect(disparador).toBeEnabled(); // R1: dejó de ser inerte
    await disparador.click();

    const dialogo = page.getByRole("dialog");
    await expect(dialogo).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Rastrear envío" })).toBeVisible();

    await dialogo.getByLabel("Número de guía").fill(GUIA_SEMBRADA);
    await dialogo.getByLabel("Últimos 4 dígitos del teléfono").fill(FACTOR_SEMBRADO);
    await dialogo.getByRole("button", { name: "Consultar" }).click();

    // R26 — la línea de tiempo aparece DENTRO del mismo diálogo…
    await expect(dialogo.getByText(new RegExp(`Guía ${GUIA_SEMBRADA}`))).toBeVisible();
    await expect(dialogo.getByRole("listitem").first()).toBeVisible();
    await expect(dialogo.getByRole("alert")).toHaveCount(0);

    // …y NO se navegó: ni ruta nueva, ni la guía en la URL (R30/F2).
    expect(page.url()).toBe(urlAntes);
    await expect(page).toHaveURL(/\/$/);
  });

  test("los dos casos malos muestran el mismo texto", async ({ page }) => {
    // R7 — el servidor responde de forma IDÉNTICA cuando la guía no existe y cuando el
    // segundo factor no coincide. Si algún día divergen, este test lo dice con las dos
    // cadenas delante.
    const consultar = async (guia: string, factor: string): Promise<string> => {
      await page.goto("/");
      await page.getByRole("button", { name: /Rastrear envío/ }).click();
      const dialogo = page.getByRole("dialog");
      await expect(dialogo).toBeVisible();
      await dialogo.getByLabel("Número de guía").fill(guia);
      await dialogo.getByLabel("Últimos 4 dígitos del teléfono").fill(factor);
      await dialogo.getByRole("button", { name: "Consultar" }).click();

      const alerta = dialogo.getByRole("alert");
      await expect(alerta).toBeVisible();
      // R28 — un rechazo no pinta línea de tiempo alguna.
      await expect(dialogo.getByRole("listitem")).toHaveCount(0);
      return (await alerta.textContent())?.trim() ?? "";
    };

    const guiaInexistente = await consultar(GUIA_INEXISTENTE, FACTOR_SEMBRADO);
    const factorErrado = await consultar(GUIA_SEMBRADA, "0000");

    expect(guiaInexistente).toBe(RECHAZO_UNICO);
    expect(
      factorErrado,
      "el rechazo por factor errado dejó de ser idéntico al de guía inexistente: el borde " +
        "público pasó a filtrar la EXISTENCIA de la guía, que es media enumeración (R7)",
    ).toBe(guiaInexistente);
  });
});
