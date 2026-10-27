import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

// SL-44 D3 (R14, R15, R24, R26) — Playwright levanta todo lo que el E2E necesita: el doble de
// Storage y la app. Nada se arranca a mano.

const CI = !!process.env.CI;

// Los workers abren la base con `DATABASE_URL` (fixtures) y Playwright no lee el `.env`, a
// diferencia de `next`. En local se carga el `.env` del checkout con el lector de Node, que NO pisa
// lo que ya trae el entorno; en CI no hay `.env` y todo llega por el entorno del job.
const ENV_LOCAL = path.join(__dirname, ".env");
if (fs.existsSync(ENV_LOCAL)) process.loadEnvFile(ENV_LOCAL);

/** Puerto de la app. En local suele haber otra sesion en 3000: `E2E_PUERTO=3044` la evita. */
const PUERTO_APP = Number(process.env.E2E_PUERTO || 3000);
/** Puerto del doble de Storage; el mismo por defecto que `e2e/_storage-falso/servidor.mjs`. */
const PUERTO_STORAGE = Number(process.env.E2E_STORAGE_PUERTO || 54329);
const BASE_URL = `http://localhost:${PUERTO_APP}`;

// Se fijan en `process.env` y no solo en `webServer.env`: los specs los leen desde los workers,
// que heredan el entorno del proceso principal (el `LogDelServidor` lee el log; los specs de cron
// llaman con `CRON_SECRET`). El `||` respeta lo que ya traiga el entorno (CI lo genera, R23), y
// como el worker vuelve a evaluar este archivo con el valor heredado, no se regenera.
const LOG_SERVIDOR = (process.env.E2E_LOG_SERVIDOR ||= path.join(os.tmpdir(), "servi-logistic-e2e-servidor.log"));
const CRON_SECRET = (process.env.CRON_SECRET ||= randomBytes(32).toString("hex"));

// SL-36 (design §15, §18) — el anillo de claves de la boveda de integraciones. Sin el, la app
// arranca pero la pantalla `/configuracion/integraciones` responde `unexpected` al guardar. Si el
// entorno (o el `.env` local) ya trae un anillo, se respeta el par entero: una base local con
// integraciones cifradas con la clave del desarrollador no se volveria ilegible por correr el E2E.
// Si no, uno de prueba FIJO (no aleatorio: lo cifrado en una corrida tiene que leerse en la
// siguiente contra la misma base). Se deriva de un texto legible para que no tenga forma de
// secreto real: protege datos de prueba, no de nadie.
const ANILLO_E2E = {
  claves: `v1:${Buffer.from("e2e-clave-de-prueba-no-secreta!!", "utf8").toString("base64")}`,
  activa: "v1",
};
const { claves: INTEGRACIONES_CLAVES_CIFRADO, activa: INTEGRACIONES_CLAVE_ACTIVA } =
  process.env.INTEGRACIONES_CLAVES_CIFRADO && process.env.INTEGRACIONES_CLAVE_ACTIVA
    ? { claves: process.env.INTEGRACIONES_CLAVES_CIFRADO, activa: process.env.INTEGRACIONES_CLAVE_ACTIVA }
    : ANILLO_E2E;

/** Un patron por spec: un archivo que no se nombra en ningun proyecto no corre. */
function specs(...nombres: string[]): string[] {
  return nombres.map((n) => `**/${n}.spec.ts`);
}

export default defineConfig({
  testDir: "./e2e",
  // Un archivo detras de otro (ver `workers`).
  fullyParallel: false,
  forbidOnly: CI,
  // El reintento existe para tener la traza; un caso que solo pasa al reintentar deja el grupo en
  // rojo (R24).
  retries: CI ? 1 : 0,
  failOnFlakyTests: CI,
  // 1 tambien en local: el superadmin es unico por base y los crons (`corte-diario`,
  // `liberar-reprogramadas`, `procesar-devueltas-sla`) recorren todas las empresas de la base. Con
  // un solo worker, el cron de un spec solo toca datos de specs ya terminados.
  workers: 1,
  // `html` con `open: "never"`: el valor por defecto se queda sirviendo el informe al fallar.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Proyectos de D3. Cada `e2e/*.spec.ts` cae en exactamente uno (guardia `e2e-sin-saltos`, D7).
  projects: [
    {
      // El superadmin es único por base: su arranque y su alta de empresas van antes que el resto
      // (D3). Desde T7 ningún E2E afirma la plataforma sin empresas (eso es de `empresas-module`).
      name: "plataforma-vacia",
      use: { ...devices["Desktop Chrome"] },
      testMatch: specs("superadmin-arranque", "superadmin-empresas"),
    },
    {
      name: "aislamiento",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["plataforma-vacia"],
      // `pago-plataforma-sl45` va detrás de `cobro-plataforma-sl40`: los dos tocan el valor global del
      // cobro (workers: 1, en orden). `login-varias-empresas` (SL-18 R31): el mismo email y la misma
      // contraseña en dos empresas.
      testMatch: specs(
        "dos-empresas-humo",
        "zona-especial-dos-empresas",
        "wallet-iva-aparte-sl39",
        "marca",
        "auth",
        "login-varias-empresas",
        "rastreo-publico",
        "analitica-roles",
        "cobro-plataforma-sl40",
        "pago-plataforma-sl45",
        "integraciones-por-empresa",
      ),
    },
    {
      name: "reparto",
      use: { ...devices["Desktop Chrome"] },
      testMatch: specs(
        "asignacion-satelite",
        "recepcion-satelite",
        "mis-asignaciones",
        "devolucion-origen",
        "historial-orden",
        "reintentos-escalado",
        "reprogramacion-liberacion",
      ),
    },
    {
      name: "dinero",
      use: { ...devices["Desktop Chrome"] },
      testMatch: specs(
        "cierre-dia",
        "cierre-vencido-modelo",
        "cierres-admin",
        "cierres-admin-rechazos-sla",
        "cierre-bodega-satelite",
        "reglas-bloqueos-cierre",
        "wallet",
        "mi-wallet",
        "wallet-mensajeros",
      ),
    },
  ],
  webServer: [
    {
      // Doble del API de Storage (D2): la app le habla por `SUPABASE_URL`.
      command: "node e2e/_storage-falso/servidor.mjs",
      url: `http://127.0.0.1:${PUERTO_STORAGE}/salud`,
      env: { E2E_STORAGE_PUERTO: String(PUERTO_STORAGE) },
      reuseExistingServer: !CI,
      timeout: 30_000,
    },
    {
      // La app (`next start`, o `next dev` con `E2E_SERVIDOR=dev`), con su log en E2E_LOG_SERVIDOR.
      command: "node e2e/_servidor-app.mjs",
      url: BASE_URL,
      env: {
        E2E_PUERTO: String(PUERTO_APP),
        E2E_LOG_SERVIDOR: LOG_SERVIDOR,
        // El OTP sale por la linea de debug del emisor de consola (R14, R15).
        AUTH_OTP_DEBUG_LOG: "1",
        SUPABASE_URL: `http://127.0.0.1:${PUERTO_STORAGE}`,
        SUPABASE_SERVICE_ROLE_KEY: "clave-falsa-e2e",
        // Vacios y no borrados: `@next/env` respeta una clave ya definida aunque este vacia, pero
        // rellena una ausente con el `.env` local (medido en T1.3). Sin SMTP, emisor de consola.
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        CRON_SECRET,
        // SL-36 (design §15): la pantalla de integraciones prueba contra el doble
        // (`lib/clients/probadores/probador-doble.ts`, acepta los secretos `valido-...`), no contra
        // Meta, Google y Anthropic. El composition root lo ignora con `VERCEL_ENV=production`.
        INTEGRACIONES_PROBADOR_DOBLE: "1",
        INTEGRACIONES_CLAVES_CIFRADO,
        INTEGRACIONES_CLAVE_ACTIVA,
      },
      reuseExistingServer: !CI,
      // `next start` sube en segundos; `next dev` compila la primera ruta al pedir `url`.
      timeout: 180_000,
      // En Linux, SIGTERM al lanzador para que cierre `next` y vacie el log; en Windows Playwright
      // hace `taskkill /T` del arbol.
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
