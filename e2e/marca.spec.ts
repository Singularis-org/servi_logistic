import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "fs";
import path from "path";
import { COOKIE_TEMA } from "../lib/tema/tema";
import { confiarDispositivo, crearEmpresaE2E, type UsuarioE2E } from "../tests/fabricas/e2e";

/**
 * SL-8 T13 — verificación de la marca en el navegador real (R8, R21, R27, R28; design D9).
 *
 * Por pantalla hace las seis cosas de D9:
 *  1. captura a `_trabajo/capturas-SL-8/<pantalla>-<ancho>-<tema>.png` (fuera de git);
 *  2. recorre los nodos de texto visibles y falla si alguno pinta `rgb(255, 208, 0)` sobre un
 *     fondo de luminancia mayor de 0.5; devuelve el recuento;
 *  3. la primera familia de `body` y de un `h1`/`h2` contiene «Archivo», y `document.fonts` la
 *     tiene en `loaded` (R21);
 *  4. `document.body.innerText` no contiene el nombre anterior de la plataforma;
 *  5. el `src` de los logos visibles es el que piden R2 a R4;
 *  6. a 360 px, `scrollWidth <= 360` (R8).
 * Las cifras de cada pantalla van a `_trabajo/capturas-SL-8/cifras.json`.
 *
 * SESIÓN (SL-44 T3.1/T4.3; R7, R10). El `beforeAll` da de alta una empresa con la fábrica del
 * E2E (`crearEmpresaE2E`: el servicio del superadmin, correo `@example.test` por corrida) y su
 * `maestro` entra por el `/login` real. Para que el login no pida OTP, la fábrica confía de
 * antemano el dispositivo del navegador (`confiarDispositivo`), igual que haría un primer login
 * con OTP superado. El primer caso es ese login, mirado por fuera: sale a `/dashboard` sin pasar
 * por el código. La base es desechable: no se borra nada. Sin base, el `beforeAll` FALLA.
 */

// El nombre anterior de la plataforma, partido: este archivo no puede contenerlo literal (R26).
const NOMBRE_ANTERIOR = ["orden", "ex"].join("");

const AMARILLO = { r: 255, g: 208, b: 0 };

const LOGO = {
  horizontalClaro: "/brand/logo-horizontal-fondo-claro.svg",
  horizontalOscuro: "/brand/logo-horizontal-fondo-oscuro.svg",
  isotipo: "/brand/isotipo.svg",
  isotipoBlanco: "/brand/isotipo-mono-blanco.svg",
} as const;

const DIR_CAPTURAS = path.join(process.cwd(), "_trabajo", "capturas-SL-8");
const ARCHIVO_CIFRAS = path.join(DIR_CAPTURAS, "cifras.json");

type Tema = "claro" | "oscuro";

interface Cifras {
  nodosMedidos: number;
  amarillosSobreClaro: number;
  ejemplosAmarillo: string[];
  familiaBody: string;
  familiaEncabezado: string | null;
  archivoCargada: boolean;
  nombreAnteriorEnTexto: boolean;
  logos: string[];
  scrollWidth: number;
}

// Un solo worker, en orden: un usuario por corrida y las cifras se escriben sin carreras.
test.describe.configure({ mode: "default" });

let maestro: UsuarioE2E | null = null;
let cookiesSesion: Awaited<ReturnType<BrowserContext["cookies"]>> = [];

/** Entra por `/login` con el dispositivo ya confiado: sin OTP, la app lo lleva a `/dashboard`. */
async function entrarSinOtp(page: Page, u: UsuarioE2E): Promise<void> {
  await confiarDispositivo(u, await page.evaluate(() => navigator.userAgent));
  await page.goto("/login");
  await page.fill('input[type="email"]', u.email);
  await page.fill('input[type="password"]', u.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  maestro = (await crearEmpresaE2E("marca")).maestro;
  const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await contexto.newPage();
  await entrarSinOtp(page, maestro);
  cookiesSesion = await contexto.cookies();
  await contexto.close();
});

test("un usuario de la fábrica entra por /login sin OTP (SL-44 T3.1)", async ({ page }) => {
  if (!maestro) throw new Error("no hay maestro: falló el beforeAll");
  await entrarSinOtp(page, maestro);
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByLabel("Código de verificación")).toHaveCount(0);
  expect((await page.context().cookies()).some((c) => c.name === "session")).toBe(true);
});

/** Recorre el DOM en el navegador y devuelve las cifras de D9 (puntos 2 a 6). */
async function medir(page: Page, ambitoLogos: string): Promise<Cifras> {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(
    ({ amarillo, nombreAnterior, ambito }) => {
      const lienzo = document.createElement("canvas");
      lienzo.width = 1;
      lienzo.height = 1;
      const ctx = lienzo.getContext("2d", { willReadFrequently: true })!;

      /** Cualquier color CSS (rgb, oklch, color-mix ya resuelto…) a sRGB 0-255 + alfa 0-1. */
      function aRgba(color: string): [number, number, number, number] {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "rgba(0,0,0,0)";
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        if (d[3] === 0) return [0, 0, 0, 0];
        // getImageData devuelve el color premultiplicado deshecho; basta para comparar.
        return [d[0], d[1], d[2], d[3] / 255];
      }

      function luminancia([r, g, b]: [number, number, number, number]): number {
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      }

      function sobre(
        arriba: [number, number, number, number],
        abajo: [number, number, number, number],
      ): [number, number, number, number] {
        const a = arriba[3];
        return [
          arriba[0] * a + abajo[0] * (1 - a),
          arriba[1] * a + abajo[1] * (1 - a),
          arriba[2] * a + abajo[2] * (1 - a),
          1,
        ];
      }

      const FUNCIONES_COLOR = /(rgba?|hsla?|oklch|oklab|lab|lch|color)\([^()]*\)|#[0-9a-fA-F]{3,8}\b/g;

      /** Fondo efectivo: compone hacia arriba hasta el primer fondo opaco. */
      function fondoEfectivo(el: Element | null): [number, number, number, number] {
        const capas: [number, number, number, number][] = [];
        let nodo: Element | null = el;
        while (nodo) {
          const cs = getComputedStyle(nodo);
          const img = cs.backgroundImage;
          if (img && img.includes("gradient")) {
            // Sobre foto o degradado: el color del degradado que la cubre. Se toma la parada más
            // clara con alfa >= 0.5 (lectura conservadora: si alguna parte es clara, cuenta).
            const paradas = (img.match(FUNCIONES_COLOR) ?? [])
              .map(aRgba)
              .filter((c) => c[3] >= 0.5);
            if (paradas.length > 0) {
              const masClara = paradas.reduce((x, y) => (luminancia(y) > luminancia(x) ? y : x));
              capas.push([masClara[0], masClara[1], masClara[2], 1]);
              break;
            }
          }
          const bg = aRgba(cs.backgroundColor);
          if (bg[3] > 0) {
            capas.push(bg);
            if (bg[3] >= 0.999) break;
          }
          nodo = nodo.parentElement;
        }
        let resultado: [number, number, number, number] = [255, 255, 255, 1];
        for (let i = capas.length - 1; i >= 0; i--) resultado = sobre(capas[i], resultado);
        return resultado;
      }

      function opacidadAcumulada(el: Element | null): number {
        let o = 1;
        for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
        return o;
      }

      let nodosMedidos = 0;
      let amarillosSobreClaro = 0;
      const ejemplosAmarillo: string[] = [];
      const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let t = recorrido.nextNode(); t; t = recorrido.nextNode()) {
        const texto = t.textContent?.trim() ?? "";
        const padre = t.parentElement;
        if (!texto || !padre) continue;
        const etiqueta = padre.tagName;
        if (etiqueta === "SCRIPT" || etiqueta === "STYLE" || etiqueta === "NOSCRIPT") continue;
        const rango = document.createRange();
        rango.selectNodeContents(t);
        const rects = Array.from(rango.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
        if (rects.length === 0) continue;
        const cs = getComputedStyle(padre);
        if (cs.visibility !== "visible" || opacidadAcumulada(padre) < 0.05) continue;
        nodosMedidos++;
        const c = aRgba(cs.color);
        const esAmarillo =
          c[3] >= 0.5 && c[0] === amarillo.r && c[1] === amarillo.g && c[2] === amarillo.b;
        if (esAmarillo && luminancia(fondoEfectivo(padre)) > 0.5) {
          amarillosSobreClaro++;
          if (ejemplosAmarillo.length < 5) ejemplosAmarillo.push(texto.slice(0, 60));
        }
      }

      const primeraFamilia = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].trim();
      const encabezado = Array.from(document.querySelectorAll("h1, h2")).find(
        (h) => h.getClientRects().length > 0,
      );
      const archivoCargada = Array.from(document.fonts).some(
        (f) => f.family.includes("Archivo") && f.status === "loaded",
      );

      const raiz = document.querySelector(ambito) ?? document.body;
      const logos = Array.from(raiz.querySelectorAll<HTMLImageElement>('img[src*="/brand/"]'))
        .filter((img) => {
          const r = img.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            getComputedStyle(img).visibility === "visible" &&
            opacidadAcumulada(img) > 0.5
          );
        })
        .map((img) => new URL(img.src).pathname);

      return {
        nodosMedidos,
        amarillosSobreClaro,
        ejemplosAmarillo,
        familiaBody: primeraFamilia(document.body),
        familiaEncabezado: encabezado ? primeraFamilia(encabezado) : null,
        archivoCargada,
        nombreAnteriorEnTexto: document.body.innerText.toLowerCase().includes(nombreAnterior),
        logos: Array.from(new Set(logos)).sort(),
        scrollWidth: document.documentElement.scrollWidth,
      };
    },
    { amarillo: AMARILLO, nombreAnterior: NOMBRE_ANTERIOR, ambito: ambitoLogos },
  );
}

function guardarCifras(clave: string, cifras: Cifras): void {
  fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
  const previas = fs.existsSync(ARCHIVO_CIFRAS)
    ? (JSON.parse(fs.readFileSync(ARCHIVO_CIFRAS, "utf8")) as Record<string, Cifras>)
    : {};
  previas[clave] = cifras;
  fs.writeFileSync(ARCHIVO_CIFRAS, `${JSON.stringify(previas, null, 2)}\n`);
}

/** Las seis cosas de D9 para una pantalla ya cargada. */
async function verificarPantalla(
  page: Page,
  opciones: { pantalla: string; ancho: number; tema: Tema; ambitoLogos: string; logos: string[] },
): Promise<void> {
  const clave = `${opciones.pantalla}-${opciones.ancho}-${opciones.tema}`;
  fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
  await page.screenshot({ path: path.join(DIR_CAPTURAS, `${clave}.png`) });

  const cifras = await medir(page, opciones.ambitoLogos);
  guardarCifras(clave, cifras);

  expect(cifras.nodosMedidos, `${clave}: no se midió ningún texto`).toBeGreaterThan(0);
  expect(cifras.amarillosSobreClaro, `${clave}: amarillo sobre claro en ${cifras.ejemplosAmarillo.join(" | ")}`).toBe(0);
  expect(cifras.familiaBody, `${clave}: familia de body`).toContain("Archivo");
  expect(cifras.familiaEncabezado, `${clave}: familia del h1/h2`).toContain("Archivo");
  expect(cifras.archivoCargada, `${clave}: Archivo no consta como cargada`).toBe(true);
  expect(cifras.nombreAnteriorEnTexto, `${clave}: el texto visible lleva el nombre anterior`).toBe(false);
  expect(cifras.logos, `${clave}: logos visibles`).toEqual([...opciones.logos].sort());
  if (opciones.ancho === 360) {
    expect(cifras.scrollWidth, `${clave}: desplazamiento horizontal (R8)`).toBeLessThanOrEqual(360);
  }
}

async function temaEnCookie(page: Page, tema: Tema): Promise<void> {
  await page.context().addCookies([
    { name: COOKIE_TEMA, value: tema, domain: "localhost", path: "/" },
  ]);
}

for (const ancho of [1280, 360] as const) {
  test(`landing a ${ancho} px: barra y héroe, y pie (claro)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Bajo md la barra pinta el isotipo; desde md, el horizontal. Siempre sobre oscuro (R6).
    const logoBarra = ancho < 768 ? LOGO.isotipoBlanco : LOGO.horizontalOscuro;
    await verificarPantalla(page, {
      pantalla: "landing-barra-heroe",
      ancho,
      tema: "claro",
      ambitoLogos: "header, nav",
      logos: [logoBarra],
    });

    await page.locator("footer").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);
    await verificarPantalla(page, {
      pantalla: "landing-pie",
      ancho,
      tema: "claro",
      ambitoLogos: "footer",
      logos: [LOGO.horizontalOscuro],
    });
  });

  test(`login a ${ancho} px (claro)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 800 });
    await page.emulateMedia({ colorScheme: "light" });
    await temaEnCookie(page, "claro");
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // Desde lg se ve el panel de marca (oscuro); por debajo, la cabecera móvil (claro).
    await verificarPantalla(page, {
      pantalla: "login",
      ancho,
      tema: "claro",
      ambitoLogos: "body",
      logos: [ancho >= 1024 ? LOGO.horizontalOscuro : LOGO.horizontalClaro],
    });
  });
}

for (const tema of ["claro", "oscuro"] as const) {
  test(`dashboard a 1280 px, barra expandida y colapsada (${tema})`, async ({ page }) => {
    expect(cookiesSesion.length, "no hay sesión: el login del beforeAll no dejó cookies").toBeGreaterThan(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ colorScheme: tema === "oscuro" ? "dark" : "light" });
    await page.context().addCookies(cookiesSesion);
    await temaEnCookie(page, tema);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/dashboard/);

    const barra = '[data-sidebar="sidebar"]';
    const expandir = page.getByRole("button", { name: "Expandir menú" });
    if (await expandir.isVisible()) await expandir.click();
    await page.waitForTimeout(500);
    await verificarPantalla(page, {
      pantalla: "dashboard-expandida",
      ancho: 1280,
      tema,
      ambitoLogos: barra,
      logos: [LOGO.horizontalOscuro],
    });

    await page.getByRole("button", { name: "Colapsar menú" }).click();
    await page.waitForTimeout(500);
    await verificarPantalla(page, {
      pantalla: "dashboard-colapsada",
      ancho: 1280,
      tema,
      ambitoLogos: barra,
      logos: [LOGO.isotipoBlanco],
    });

    // Deja la barra expandida para la siguiente corrida (la recuerda en cookie).
    await page.getByRole("button", { name: "Expandir menú" }).click();
  });
}
