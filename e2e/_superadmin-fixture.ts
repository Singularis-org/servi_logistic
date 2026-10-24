import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";

import { LogDelServidor } from "./_dos-empresas-fixture";

// SL-32 T9 y T17 — lo que comparten los dos E2E del superadmin: crearlo con el comando de arranque,
// leer el OTP del emisor de consola en el log del dev server y entrar por `/login`. SL-41 T12 añade
// leer de ese mismo log el enlace de bienvenida.

/**
 * Credenciales ficticias del único superadmin de la base de prueba. Fijas a propósito: el índice
 * permite un solo superadmin, así que T9 y T17 comparten este, y una segunda corrida solo lo
 * encuentra (`ya_existe`) si sabe con qué entra. Dominio `example.test`: nunca un buzón real.
 */
export const SUPERADMIN_DE_PRUEBA = {
  SUPERADMIN_EMAIL: "superadmin-e2e@example.test",
  SUPERADMIN_PASSWORD: "E2e-Superadmin-2026!",
  SUPERADMIN_NOMBRE: "Superadmin E2E",
  SUPERADMIN_TELEFONO: "88880000",
  SUPERADMIN_DOCUMENTO: "e2e-superadmin-0001",
  SUPERADMIN_TIPO_DOCUMENTO: "cedula",
} as const;

export interface SalidaDelArranque {
  codigo: number | null;
  salida: string;
}

/** Corre `pnpm arranque:superadmin` de verdad, con las credenciales de prueba en su entorno. */
export function correrArranque(): SalidaDelArranque {
  // Una sola cadena y con shell: en Windows `pnpm` es un `.cmd` que `spawnSync` sin shell no
  // encuentra, y pasar argumentos sueltos junto con `shell` está obsoleto (DEP0190).
  const r = spawnSync("pnpm arranque:superadmin", {
    env: { ...process.env, ...SUPERADMIN_DE_PRUEBA },
    encoding: "utf8",
    shell: true,
    timeout: 120_000,
  });
  return { codigo: r.status, salida: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

/**
 * Deja la base con EL superadmin de prueba: lo crea, o confirma que el que ya existe es este. Si
 * hay otro, falla: con un superadmin ajeno el login de prueba no entraría y el fallo despistaría.
 */
export async function asegurarSuperadmin(dueno: PrismaClient): Promise<SalidaDelArranque> {
  const arranque = correrArranque();
  expect(arranque.codigo, arranque.salida).toBe(0);
  const superadmins = await dueno.usuario.findMany({
    where: { rol: { value: "superadmin" } },
    select: { email: true, organizacionId: true },
  });
  if (superadmins.length !== 1 || superadmins[0].email !== SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL) {
    throw new Error(
      "SL-32 E2E: la base ya tiene un superadmin que no es el de prueba. Usa una base desechable recién migrada.",
    );
  }
  return arranque;
}

/**
 * Olvida los dispositivos confiados del usuario y sus intentos de login: así cada login pasa por el
 * OTP de dispositivo nuevo, que es lo que se prueba, y no por una confianza heredada. Los dos hacen
 * falta: el `RiskEngine` solo pide OTP si el dispositivo Y la IP son nuevos (40 + 30 ≥ 50), y un
 * login con éxito anterior desde la misma IP la deja reconocida.
 */
export async function olvidarDispositivos(dueno: PrismaClient, email: string): Promise<void> {
  await dueno.trustedDevice.deleteMany({ where: { usuario: { email } } });
  await dueno.loginAttempt.deleteMany({ where: { usuario: { email } } });
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Espera el código que el `ConsoleEmailSender` acaba de «enviar» a `email`. El asunto ya no lleva
 * el código (SL-32 m4): sin SMTP y con `AUTH_OTP_DEBUG_LOG=1`, el emisor escribe por stderr
 * `[email][debug] to=<email> cuerpo=<JSON del texto>`, y el código son los seis dígitos entre el
 * primer `\n\n` y el siguiente `\n`, literales en el JSON. Se filtra por destinatario porque stdout
 * y stderr no guardan el orden en el log mezclado. Solo mira lo escrito después de que `log` se
 * creó o leyó por última vez, así que un código de una corrida anterior no cuenta.
 */
export async function codigoEnviadoA(log: LogDelServidor, email: string, timeoutMs = 60_000): Promise<string> {
  const patron = new RegExp(`\\[email\\]\\[debug\\] to=${escaparRegex(email)} cuerpo="[^"]*?\\\\n(\\d{6})\\\\n`, "g");
  return ultimaCoincidencia(log, patron, timeoutMs, `ningún código para ${email}`);
}

/**
 * SL-41 T12 — espera el enlace de bienvenida que el `ConsoleEmailSender` acaba de «enviar» a
 * `email` y devuelve lo que va detrás de `#enlace=` (`<challengeId>.<secreto>`). Sale de la misma
 * línea de depuración que el código: el texto plano lleva la URL completa (R5), y sus caracteres
 * (base64url, guion y punto) no se escapan en el JSON. Se devuelve el valor y no la URL porque la
 * base de la URL es `NEXT_PUBLIC_APP_URL` del servidor, que puede no ser la `baseURL` de Playwright.
 */
export async function enlaceEnviadoA(log: LogDelServidor, email: string, timeoutMs = 60_000): Promise<string> {
  const patron = new RegExp(
    // `[^\n]` y no `[^"]`: el JSON deja la línea entera en una sola, y el saludo o el nombre de
    // la empresa podrían llevar comillas escapadas antes del enlace.
    `\\[email\\]\\[debug\\] to=${escaparRegex(email)} cuerpo="[^\\n]*?#enlace=([A-Za-z0-9_.-]+)`,
    "g",
  );
  return ultimaCoincidencia(
    log,
    patron,
    timeoutMs,
    `ningún enlace de bienvenida para ${email} (¿falta NEXT_PUBLIC_APP_URL en el dev server?)`,
  );
}

/** El primer grupo de la ÚLTIMA coincidencia de `patron` en lo nuevo del log, esperando hasta `timeoutMs`. */
async function ultimaCoincidencia(
  log: LogDelServidor,
  patron: RegExp,
  timeoutMs: number,
  queFalta: string,
): Promise<string> {
  let acumulado = "";
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    acumulado += log.nuevo();
    const coincidencias = Array.from(acumulado.matchAll(patron));
    if (coincidencias.length > 0) return coincidencias[coincidencias.length - 1][1];
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(
    `E2E: el log del servidor no recibió ${queFalta} en ${timeoutMs} ms. ` +
      "¿El dev server corre con AUTH_OTP_DEBUG_LOG=1 y su stderr va al log?",
  );
}

/**
 * Login completo por la UI: credenciales y el OTP de dispositivo nuevo, leído del log. Deja la
 * página fuera de `/login`, donde la haya llevado el redirect de la app.
 */
export async function entrarConOtp(page: Page, email: string, password: string): Promise<void> {
  const log = LogDelServidor.desdeEntorno();
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();

  const campoCodigo = page.getByLabel("Código de verificación");
  await expect(campoCodigo).toBeVisible({ timeout: 60_000 });
  await campoCodigo.fill(await codigoEnviadoA(log, email));
  await page.getByRole("button", { name: "Verificar código" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90_000 });
}

/**
 * Candado entre procesos: los workers de Playwright corren T9 y T17 a la vez, y los dos usan el
 * mismo superadmin. Sin él, los dos comandos de arranque chocan en el índice de un solo superadmin,
 * y los dos logins se cruzan los códigos del mismo email. Un candado de hace más de 3 min es de
 * una corrida muerta y se rompe.
 */
export async function conCandadoDelSuperadmin<T>(fn: () => Promise<T>): Promise<T> {
  const ruta = path.join(os.tmpdir(), "servi-logistic-e2e-superadmin.lock");
  const limite = Date.now() + 240_000;
  for (;;) {
    try {
      fs.mkdirSync(ruta);
      break;
    } catch {
      try {
        if (Date.now() - fs.statSync(ruta).mtimeMs > 180_000) fs.rmSync(ruta, { recursive: true, force: true });
      } catch {
        // lo acaba de soltar otro worker: se reintenta
      }
      if (Date.now() > limite) throw new Error("SL-32 E2E: no se pudo tomar el candado del superadmin en 4 min.");
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(ruta, { recursive: true, force: true });
  }
}

/** El rótulo de cada enlace del menú principal, en orden. */
export async function enlacesDelMenu(page: Page): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: "Navegación principal" });
  await expect(nav).toBeVisible();
  return (await nav.getByRole("link").allInnerTexts()).map((t) => t.trim());
}

/** Lo que pinta `app/(app)/not-found.tsx`: el 404 que ve el usuario dentro del portal. */
export const NO_ENCONTRADO = "No encontramos esta página";
