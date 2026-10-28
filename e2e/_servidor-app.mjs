// SL-44 D3 (R14) — lanzador de la app para el `webServer` de Playwright.
//
// Arranca `next start` (o `next dev` si `E2E_SERVIDOR=dev`) en el puerto `E2E_PUERTO` (3000 por
// defecto) y escribe su stdout y su stderr, a la vez y en el orden en que llegan, en el archivo de
// `E2E_LOG_SERVIDOR`. Tambien los reenvia a la consola. De ese log sale el OTP de los E2E (R15):
// `[email][debug] to=<email> cuerpo=...`, que escribe el emisor de consola con
// `AUTH_OTP_DEBUG_LOG=1`.
//
// Node puro: vale igual en Windows y en Linux, sin redirecciones de shell (`2>&1 | tee` no existe
// en cmd). `next` se lanza con el `node` de este proceso y la ruta de su bin, no con `pnpm` ni con
// el `.cmd` de `node_modules/.bin`: asi no hay shell intermedio que deje un `next` huerfano.
//
// El log se TRUNCA al arrancar: cada corrida de Playwright tiene su log entero y solo suyo (es el
// artefacto que sube CI cuando un grupo falla, R25). No se pierde nada que un spec necesite:
// `LogDelServidor` mide el tamano al crearse y solo lee lo escrito despues, y se crea dentro de un
// test, cuando este servidor ya esta arriba. Con append, el artefacto arrastraria corridas viejas y
// un OTP antiguo del mismo correo seguiria en el archivo.
//
// El entorno lo pone `playwright.config.ts` (`webServer.env`); este archivo no decide secretos ni
// SMTP: solo lanza, copia la salida y propaga la muerte.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function puertoDelEntorno() {
  const crudo = process.env.E2E_PUERTO;
  if (!crudo) return 3000;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`E2E_PUERTO no es un puerto valido: ${crudo}`);
  }
  return n;
}

function modoDelEntorno() {
  const modo = process.env.E2E_SERVIDOR || "start";
  if (modo !== "start" && modo !== "dev") {
    throw new Error(`E2E_SERVIDOR debe ser "start" o "dev", no ${modo}`);
  }
  return modo;
}

const rutaLog = process.env.E2E_LOG_SERVIDOR;
if (!rutaLog) {
  throw new Error("E2E_LOG_SERVIDOR no esta definido: el lanzador no sabe donde escribir el log del servidor.");
}

const puerto = puertoDelEntorno();
const modo = modoDelEntorno();

fs.mkdirSync(path.dirname(rutaLog), { recursive: true });
// `w`: trunca (ver cabecera). Se abre antes de lanzar `next` para que el archivo exista ya cuando
// Playwright de el servidor por listo.
const log = fs.createWriteStream(rutaLog, { flags: "w" });

const binNext = require.resolve("next/dist/bin/next");
const hijo = spawn(process.execPath, [binNext, modo, "-p", String(puerto)], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

hijo.stdout.on("data", (trozo) => {
  log.write(trozo);
  process.stdout.write(trozo);
});
hijo.stderr.on("data", (trozo) => {
  log.write(trozo);
  process.stderr.write(trozo);
});

let hijoVivo = true;

/** Mata a `next` y a lo que haya lanzado (`next dev` tiene su propio proceso hijo). */
function matarHijo(senal = "SIGTERM") {
  if (!hijoVivo || hijo.pid === undefined) return;
  if (process.platform === "win32") {
    // En Windows las senales no llegan al arbol: `taskkill /T` cierra `next` y sus hijos. Sincrono
    // para que tambien valga desde el evento `exit`.
    spawnSync("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    hijo.kill(senal);
  }
}

hijo.on("exit", (codigo, senal) => {
  hijoVivo = false;
  const salida = codigo ?? (senal ? 1 : 0);
  log.end(() => process.exit(salida));
});

hijo.on("error", (e) => {
  hijoVivo = false;
  process.stderr.write(`[servidor-app] no se pudo lanzar next: ${e.message}\n`);
  log.end(() => process.exit(1));
});

for (const senal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.once(senal, () => matarHijo(senal));
}
// Si el lanzador sale por cualquier otra via (excepcion, `process.exit`), `next` no se queda vivo.
process.once("exit", () => matarHijo("SIGKILL"));

process.stdout.write(`[servidor-app] next ${modo} en el puerto ${puerto}; log en E2E_LOG_SERVIDOR\n`);
