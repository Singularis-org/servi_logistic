import { test, expect, type Locator, type Page } from "@playwright/test";

import { confiarDispositivo, correoE2E, crearEmpresaE2E, crearUsuarioE2E, type EmpresaE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

import { LogDelServidor } from "./_dos-empresas-fixture";
import { codigoEnviadoA } from "./_superadmin-fixture";

/**
 * E2E del login (T017 — cierra T021 de specs/login/tasks.md; reescrito por SL-44 T4.3).
 *
 * Los caminos críticos:
 * (a) login correcto con el dispositivo confiado: sin reto, sale de `/login` a `/dashboard`
 *     (feature 86, R14), o al `redirect` que se le pida;
 * (b) credenciales inválidas: mensaje genérico, sigue en `/login`, conserva el correo. Con un
 *     usuario que EXISTE y la contraseña mal (es el caso que importa: un correo inexistente
 *     no prueba que se compruebe la contraseña) y con un correo que no existe;
 * (c) cuenta bloqueada: N intentos fallidos desde la UI la bloquean, y el siguiente, aun con la
 *     contraseña buena, dice «Cuenta bloqueada» con los minutos de espera;
 * (d) logout con «Salir» del topbar (feature 57): vuelve a `/`, y `/dashboard` lleva a `/login`;
 * OTP: un dispositivo nuevo pide el código; uno inventado se rechaza y el real, leído del log del
 *     servidor (SL-44 R15), entra;
 * accesibilidad: orden de tabulación, foco al primer error y errores enlazados al campo.
 *
 * DATOS (SL-44; R7, R10). Cada usuario lo crea la fábrica del E2E por el servicio de la app
 * (`crearEmpresaE2E`, `crearUsuarioE2E`), con correo `@example.test` por corrida. Cada caso que
 * cuenta intentos usa SU usuario: el bloqueo es por usuario y no debe contaminar a otro caso.
 *
 * LOCALIZADORES DE ERROR. Next monta su anunciador de rutas (`#__next-route-announcer__`) con
 * `role="alert"` en toda página: un `getByRole("alert")` de página lo casa también (lo vio el run
 * 40020120423). Aquí los `alert` se buscan dentro de la tarjeta del formulario.
 *
 * CÓMO SE CORRE: `pnpm exec playwright test --project=aislamiento` (Playwright levanta el
 * servidor con `AUTH_OTP_DEBUG_LOG=1` y su log en `E2E_LOG_SERVIDOR`). Sin base, FALLA.
 */

/**
 * `AUTH_MAX_FAILED_ATTEMPTS` por defecto (`lib/config/auth.ts`); el servidor del E2E no la fija.
 * Escrito a mano: es el contrato que el caso (c) comprueba.
 */
const INTENTOS_HASTA_EL_BLOQUEO = 5;

const ERROR_GENERICO = "Correo o contraseña inválidos";

let empresa: EmpresaE2E | null = null;

function laEmpresa(): EmpresaE2E {
  if (!empresa) throw new Error("no hay empresa: falló el beforeAll");
  return empresa;
}

test.beforeAll(async () => {
  test.setTimeout(120_000);
  empresa = await crearEmpresaE2E("auth");
});

/** Un usuario nuevo de la empresa, solo para un caso. */
function usuarioNuevo(): Promise<UsuarioE2E> {
  return crearUsuarioE2E(laEmpresa(), "adminTienda");
}

/**
 * El maestro de una empresa nueva, solo para un caso. Para los casos que miran a dónde se
 * aterriza: `/dashboard` es la home del maestro y se queda ahí, mientras que a un `adminTienda`
 * `/dashboard` lo redirige al primer ítem de su menú. Con él, «llegó a `/dashboard`» es un
 * instante de paso, y pulsar «Salir» en ese instante cruza el logout con esa redirección.
 */
async function maestroNuevo(): Promise<UsuarioE2E> {
  return (await crearEmpresaE2E("auth")).maestro;
}

/** La tarjeta del formulario de login: fuera queda el anunciador de rutas de Next. */
function tarjeta(page: Page): Locator {
  return page.locator('[data-slot="card"]');
}

async function enviarCredenciales(page: Page, email: string, password: string): Promise<void> {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

/** Login sin OTP: confía el dispositivo de este navegador y entra. */
async function entrar(page: Page, u: UsuarioE2E, ruta = "/login"): Promise<void> {
  await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
  await page.goto(ruta);
  await enviarCredenciales(page, u.email, u.password);
}

test.describe("Auth E2E Flow", () => {
  test.describe("(a) Successful login without challenge", () => {
    test("should login and land on /dashboard", async ({ page }) => {
      test.setTimeout(90_000);
      const u = await maestroNuevo();
      await entrar(page, u);

      // Feature 86, R14: la home autenticada es `/dashboard`.
      await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByLabel("Código de verificación")).toHaveCount(0);

      // El botón «Salir» del topbar del PageHeader (feature 57, R1/R2).
      await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
    });

    test("should respect redirect query parameter", async ({ page }) => {
      const u = await usuarioNuevo();
      await entrar(page, u, "/login?redirect=/ordenes");

      // Por el `pathname`: la URL de partida (`/login?redirect=/ordenes`) ya termina en `/ordenes`.
      await page.waitForURL((url) => url.pathname === "/ordenes", { timeout: 60_000 });
      expect(new URL(page.url()).pathname).toBe("/ordenes");
    });
  });

  test.describe("(b) Invalid credentials", () => {
    test("an existing user with the wrong password sees the generic error and stays on /login", async ({ page }) => {
      const u = await usuarioNuevo();
      await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
      await page.goto("/login");
      await enviarCredenciales(page, u.email, `${u.password}-mal`);

      await expect(tarjeta(page).getByRole("alert")).toHaveText(ERROR_GENERICO);
      expect(new URL(page.url()).pathname).toBe("/login");
      // R8: el correo se conserva.
      await expect(page.locator('input[type="email"]')).toHaveValue(u.email);
    });

    test("an unknown email sees the same generic error", async ({ page }) => {
      await page.goto("/login");
      const email = correoE2E("inexistente");
      await enviarCredenciales(page, email, "Una-Contrasena-9!");

      await expect(tarjeta(page).getByRole("alert")).toHaveText(ERROR_GENERICO);
      expect(new URL(page.url()).pathname).toBe("/login");
      await expect(page.locator('input[type="email"]')).toHaveValue(email);
    });

    test("should show validation errors for empty fields", async ({ page }) => {
      await page.goto("/login");
      await page.click('button[type="submit"]');

      // Validación de cliente, sin llamar al servidor: un error por campo.
      await expect(tarjeta(page).getByRole("alert")).toHaveCount(2);
    });
  });

  test.describe("(c) Account locked", () => {
    test("N failed attempts from the UI lock the account, even for the right password", async ({ page }) => {
      test.setTimeout(120_000);
      const u = await usuarioNuevo();
      await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
      await page.goto("/login");

      const alerta = tarjeta(page).getByRole("alert");
      for (let i = 1; i <= INTENTOS_HASTA_EL_BLOQUEO; i += 1) {
        await enviarCredenciales(page, u.email, `Mala-${i}-contrasena!`);
        await expect(alerta, `intento fallido ${i}`).toHaveText(ERROR_GENERICO);
        // El siguiente envío tiene que dejar ver su propio mensaje, no el de este.
        await page.reload();
      }

      await enviarCredenciales(page, u.email, u.password);
      await expect(alerta).toContainText("Cuenta bloqueada");
      await expect(alerta).toHaveText(/Intenta de nuevo en \d+ minutos?$/);
      expect(new URL(page.url()).pathname).toBe("/login");
    });
  });

  test.describe("(d) Logout using PageHeader topbar button", () => {
    test("should logout and redirect to the public home (/)", async ({ page }) => {
      test.setTimeout(90_000);
      const u = await maestroNuevo();
      await entrar(page, u);
      await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });

      const logoutButton = page.getByRole("button", { name: "Salir" });
      await expect(logoutButton).toBeVisible();
      await logoutButton.click();

      // R7: la home pública.
      await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });
      // Sin sesión, / pinta la landing pública y el shell autenticado no se monta (R3).
      await expect(page.getByRole("button", { name: "Salir" })).toHaveCount(0);
    });

    test("after logout, accessing protected route should redirect to /login", async ({ page }) => {
      test.setTimeout(90_000);
      const u = await maestroNuevo();
      await entrar(page, u);
      await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });

      await page.getByRole("button", { name: "Salir" }).click();
      await page.waitForURL((url) => url.pathname === "/", { timeout: 60_000 });

      await page.goto("/dashboard");
      await page.waitForURL(/\/login/, { timeout: 60_000 });
      expect(new URL(page.url()).pathname).toBe("/login");
    });
  });

  test.describe("OTP Challenge Flow", () => {
    test("a new device gets the challenge; a made-up code is rejected and the real one from the server log gets in", async ({
      page,
    }) => {
      test.setTimeout(120_000);
      // Usuario sin dispositivo confiado ni login previo: dispositivo e IP nuevos, el RiskEngine
      // pide el código.
      const u = await maestroNuevo();
      const log = LogDelServidor.desdeEntorno();
      await page.goto("/login");
      await enviarCredenciales(page, u.email, u.password);

      const codeInput = page.locator('input[id="code"]');
      await expect(codeInput).toBeVisible({ timeout: 60_000 });
      const codigo = await codigoEnviadoA(log, u.email);

      // Un código que no es el enviado.
      const inventado = codigo === "000000" ? "111111" : "000000";
      await codeInput.fill(inventado);
      await page.click('button:has-text("Verificar código")');
      await expect(tarjeta(page).getByRole("alert")).toHaveText("El código es inválido o ha expirado");
      await expect(codeInput).toBeVisible();

      await codeInput.fill(codigo);
      await page.click('button:has-text("Verificar código")');
      await page.waitForURL(/\/dashboard$/, { timeout: 60_000 });
      await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
    });
  });

  test.describe("Accessibility", () => {
    test("login form should be keyboard navigable", async ({ page }) => {
      await page.goto("/login");

      // R21: el correo tiene el foco al cargar.
      await expect(page.locator('input[type="email"]')).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.locator('input[type="password"]')).toBeFocused();

      // El botón de mostrar/ocultar la contraseña es un control de teclado (PasswordInput).
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: /^Contraseña: oculta\. Mostrar\.$/ })).toBeFocused();

      await page.keyboard.press("Tab");
      await expect(page.locator('button[type="submit"]')).toBeFocused();
    });

    test("should move focus to first error field after invalid submission", async ({ page }) => {
      await page.goto("/login");
      await page.click('button[type="submit"]');

      await expect(page.locator('input[type="email"]')).toBeFocused();
    });

    test("error messages are alerts linked to their field by aria-describedby", async ({ page }) => {
      await page.goto("/login");
      await page.click('button[type="submit"]');

      const errores = tarjeta(page).getByRole("alert");
      await expect(errores).toHaveCount(2);

      const emailInput = page.locator('input[type="email"]');
      await expect(emailInput).toHaveAttribute("aria-invalid", "true");
      const describedById = await emailInput.getAttribute("aria-describedby");
      expect(describedById).toBeTruthy();
      // El id que nombra el campo es el de su `alert`.
      const ids = (describedById ?? "").split(/\s+/);
      const idsDeAlertas = await errores.evaluateAll((els) => els.map((el) => el.id));
      expect(ids.some((id) => idsDeAlertas.includes(id))).toBe(true);
    });
  });
});
