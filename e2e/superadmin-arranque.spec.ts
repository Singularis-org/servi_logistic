import { test, expect, type BrowserContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { clienteDueno } from "./_dos-empresas-fixture";
import {
  asegurarSuperadmin,
  conCandadoDelSuperadmin,
  enlacesDelMenu,
  entrarConOtp,
  NO_ENCONTRADO,
  olvidarDispositivos,
  SUPERADMIN_DE_PRUEBA,
  type SalidaDelArranque,
} from "./_superadmin-fixture";

/**
 * SL-32 T9 — E2E del arranque (R18, R6).
 *
 * 1. El setup corre `pnpm arranque:superadmin` de verdad, con credenciales ficticias de prueba.
 * 2. El superadmin entra por `/login` y pasa el OTP de dispositivo nuevo, leído del emisor de consola.
 * 3. Aterriza en `/plataforma/empresas`, y el menú tiene exactamente el ítem «Empresas».
 * 4. `/configuracion` no le deja entrar: el aviso de permiso de la página y ningún enlace de
 *    configuración (desviación anotada junto a T9 en `tasks.md`).
 *
 * CÓMO SE CORRE (solo en local; una base remota lo aborta antes de escribir):
 * - `DATABASE_URL` a una base desechable migrada y con catálogos (`pnpm db:seed`), SIN `SMTP_*`:
 *   el código tiene que salir por el `ConsoleEmailSender`.
 * - El dev server en `localhost:3000`, levantado aparte con su stdout/stderr en un archivo, y
 *   `SL17_HUMO_LOG_SERVIDOR` apuntando a ese archivo (el mecanismo del humo de SL-17): de ahí sale
 *   el código. Sin él, FALLA.
 */

test.describe.configure({ mode: "serial" });

/** Lo que pinta `app/(app)/configuracion/page.tsx` a quien no es `maestro`. */
const SIN_PERMISO = "No tienes permiso para acceder a esta sección.";

let dueno: PrismaClient | null = null;
let arranque: SalidaDelArranque | null = null;
let sesion: Awaited<ReturnType<BrowserContext["cookies"]>> | null = null;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  dueno = clienteDueno();
  arranque = await conCandadoDelSuperadmin(() => asegurarSuperadmin(dueno!));
});

test.afterAll(async () => {
  await dueno?.$disconnect();
});

test("el comando de arranque deja un superadmin sin empresa y no imprime sus datos (R18)", async () => {
  // La primera corrida lo crea; la siguiente sobre la misma base lo encuentra (R14). Las dos salen en 0.
  expect(arranque?.salida).toMatch(/Superadmin creado\.|Ya existe un superadmin\. No se ha cambiado nada\./);
  for (const valor of [
    SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD,
    SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL,
    SUPERADMIN_DE_PRUEBA.SUPERADMIN_DOCUMENTO,
  ]) {
    expect(arranque?.salida).not.toContain(valor);
  }
  const fila = await dueno!.usuario.findUnique({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL },
    select: { organizacionId: true, estado: true, rol: { select: { value: true } } },
  });
  expect(fila).toEqual({ organizacionId: null, estado: "activo", rol: { value: "superadmin" } });
});

test("entra con OTP y aterriza en «Empresas», con ese único ítem en el menú (R18, R6)", async ({ page }) => {
  test.setTimeout(180_000);
  await conCandadoDelSuperadmin(async () => {
    await olvidarDispositivos(dueno!, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL);
    await entrarConOtp(page, SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, SUPERADMIN_DE_PRUEBA.SUPERADMIN_PASSWORD);
  });

  await page.waitForURL("**/plataforma/empresas", { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
  expect(await enlacesDelMenu(page)).toEqual(["Empresas"]);
  // El marco pinta su nombre en el pie sin fallar por no tener empresa (R6).
  await expect(page.getByText(SUPERADMIN_DE_PRUEBA.SUPERADMIN_NOMBRE).first()).toBeVisible();
  sesion = await page.context().cookies();
});

test("/configuracion no le deja entrar (R6, R5)", async ({ page }) => {
  if (!sesion) throw new Error("no hay sesión del superadmin: falló el login del test anterior");
  await page.context().addCookies(sesion);
  const respuesta = await page.goto("/configuracion");
  // Desviación de T9 paso 4: la página responde a todo rol que no sea `maestro` con su aviso de
  // permiso y no con un 404; R5 admite los dos desenlaces. Lo que importa es que no ve nada de ella.
  expect(respuesta?.status()).toBe(200);
  await expect(page.getByRole("alert").filter({ hasText: SIN_PERMISO })).toHaveText(SIN_PERMISO);
  await expect(page.getByRole("link", { name: /configuraci[oó]n/i })).toHaveCount(0);
  await expect(page.locator('a[href^="/configuracion"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: NO_ENCONTRADO })).toHaveCount(0);
});
