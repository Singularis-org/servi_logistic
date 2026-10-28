// Genera las capturas de `public/screenshots/` que el diálogo de instalación de la PWA enseña.
//
// SL-9 — antes se tomaban a mano con Playwright, así que nadie podía repetirlas cuando cambiaba
// la marca o una pantalla, y quedaban mostrando una app que ya no existía. Este script las
// rehace de forma repetible. Hay que volver a correrlo cada vez que cambien `/` o `/login`.
//
// POR QUÉ LOS TAMAÑOS SALEN DEL MANIFIESTO: el navegador compara el PNG con el `sizes` que
// declara `public/manifest.json`; si no coinciden, degrada el diálogo sin avisar. Leyendo el
// manifiesto, el script no puede escribir un tamaño distinto del declarado. La única tabla
// escrita a mano es qué pantalla corresponde a cada captura.
//
// POR QUÉ TODO O NADA: si se escribiera una captura y fallara la siguiente,
// `public/screenshots/` quedaría con capturas de dos versiones de la app y nada se pondría rojo.
//
// El script NO levanta la app: la espera servida en `CAPTURAS_URL` (por defecto
// http://localhost:3000). Lo recomendado es `pnpm build && pnpm start`: sin el indicador de
// desarrollo de Next y con las fuentes ya servidas. `pnpm dev` también vale, porque el indicador
// se oculta antes de capturar.
//
// `@playwright/test` se carga con `import()` dentro de `main()`: así los tests importan las
// partes puras sin abrir ningún navegador.
//
// Uso: node scripts/capturas-pwa.mjs
//      CAPTURAS_URL=http://localhost:3044 node scripts/capturas-pwa.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// El nombre anterior de la plataforma, partido: este archivo no puede contenerlo literal (R17),
// y aun así tiene que buscarlo en las pantallas.
const NOMBRE_ANTERIOR = ["orden", "ex"].join("");

/** Ancho CSS del móvil con el que se mide la marca (SL-8, R8). */
const ANCHO_CSS_MOVIL = 360;

const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

const URL_POR_DEFECTO = "http://localhost:3000";

/** Captura → pantalla. Única tabla escrita a mano (R2). */
export const PANTALLA_POR_CAPTURA = {
  "/screenshots/inicio-narrow.png": "/",
  "/screenshots/ingreso-narrow.png": "/login",
  "/screenshots/inicio-wide.png": "/",
};

/**
 * @typedef {{ src: string, sizes: string, form_factor?: string }} CapturaDeclarada
 * @typedef {{ screenshots?: CapturaDeclarada[] }} Manifiesto
 * @typedef {{
 *   src: string,
 *   ruta: string,
 *   ancho: number,
 *   alto: number,
 *   viewport: { width: number, height: number },
 *   escala: number,
 * }} PasoDeCaptura
 */

/**
 * @param {string} src
 * @param {string} sizes
 * @returns {{ ancho: number, alto: number }}
 */
function leerSizes(src, sizes) {
  const m = /^(\d+)x(\d+)$/.exec(String(sizes));
  if (!m) throw new Error(`${src}: sizes "${sizes}" no tiene la forma ANCHOxALTO`);
  return { ancho: Number(m[1]), alto: Number(m[2]) };
}

/**
 * `narrow` se pinta a 360 px CSS y se escala: con 540 px CSS la landing pintaría su maquetado
 * intermedio, no el de teléfono.
 * @param {CapturaDeclarada} captura
 * @param {number} ancho
 * @param {number} alto
 * @returns {{ viewport: { width: number, height: number }, escala: number }}
 */
function viewportDe(captura, ancho, alto) {
  if (captura.form_factor === "wide") {
    return { viewport: { width: ancho, height: alto }, escala: 1 };
  }
  if (captura.form_factor === "narrow") {
    const altoCss = (alto * ANCHO_CSS_MOVIL) / ancho;
    if (!Number.isInteger(altoCss)) {
      throw new Error(
        `${captura.src}: ${ancho}x${alto} a ${ANCHO_CSS_MOVIL} px CSS no da un alto entero (${altoCss})`,
      );
    }
    return {
      viewport: { width: ANCHO_CSS_MOVIL, height: altoCss },
      escala: ancho / ANCHO_CSS_MOVIL,
    };
  }
  throw new Error(`${captura.src}: form_factor "${captura.form_factor}" no es narrow ni wide`);
}

/**
 * Plan desde el manifiesto (R5, R6). Lanza Error si una captura del manifiesto no tiene pantalla
 * o si una pantalla de la tabla no está en el manifiesto.
 * @param {Manifiesto} manifiesto
 * @returns {PasoDeCaptura[]}
 */
export function planDeCapturas(manifiesto) {
  const declaradas = manifiesto.screenshots ?? [];
  const sinPantalla = declaradas.filter((c) => !(c.src in PANTALLA_POR_CAPTURA)).map((c) => c.src);
  if (sinPantalla.length > 0) {
    throw new Error(
      `El manifiesto declara capturas sin pantalla en PANTALLA_POR_CAPTURA: ${sinPantalla.join(", ")}`,
    );
  }
  const srcDeclarados = new Set(declaradas.map((c) => c.src));
  const sobrantes = Object.keys(PANTALLA_POR_CAPTURA).filter((src) => !srcDeclarados.has(src));
  if (sobrantes.length > 0) {
    throw new Error(
      `PANTALLA_POR_CAPTURA asigna pantalla a capturas que el manifiesto no declara: ${sobrantes.join(", ")}`,
    );
  }
  return declaradas.map((captura) => {
    const { ancho, alto } = leerSizes(captura.src, captura.sizes);
    const { viewport, escala } = viewportDe(captura, ancho, alto);
    return {
      src: captura.src,
      ruta: PANTALLA_POR_CAPTURA[/** @type {keyof typeof PANTALLA_POR_CAPTURA} */ (captura.src)],
      ancho,
      alto,
      viewport,
      escala,
    };
  });
}

/**
 * R7. Devuelve la URL normalizada o lanza Error si el host no es localhost ni 127.0.0.1.
 * Solo local: las capturas tienen que ser de la app de este árbol, no de un despliegue.
 * @param {string} texto
 * @returns {string}
 */
export function urlBaseLocal(texto) {
  let url;
  try {
    url = new URL(texto);
  } catch {
    throw new Error(`CAPTURAS_URL no es una URL válida: "${texto}"`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`CAPTURAS_URL tiene que ser http o https: "${texto}"`);
  }
  if (!HOSTS_LOCALES.has(url.hostname)) {
    throw new Error(
      `CAPTURAS_URL tiene que apuntar a localhost o 127.0.0.1, no a "${url.hostname}": las capturas salen de la app de este árbol`,
    );
  }
  return url.origin;
}

/**
 * R9. Recibe lo observado en la página y devuelve la lista de motivos de fallo (vacía = se puede
 * capturar).
 * @param {{ texto: string, logos: string[], archivoCargada: boolean, indicadorVisible: boolean }} o
 * @returns {string[]}
 */
export function fallosDePantalla(o) {
  const motivos = [];
  if (o.texto.toLowerCase().includes(NOMBRE_ANTERIOR)) {
    motivos.push("contiene el nombre anterior de la plataforma");
  }
  if (!o.logos.some((src) => src.includes("/brand/"))) {
    motivos.push("no muestra ningún logo servido desde /brand/");
  }
  if (!o.archivoCargada) {
    motivos.push("la fuente Archivo no está cargada");
  }
  if (o.indicadorVisible) {
    motivos.push("se ve el indicador de desarrollo de Next");
  }
  return motivos;
}

/**
 * R9. Devuelve `promesa` o, si no se resuelve en `ms`, la rechaza con `Error(motivo)`. Así una
 * espera dentro de la página que nunca termina corta el script en vez de colgarlo.
 * @template T
 * @param {Promise<T>} promesa
 * @param {number} ms
 * @param {string} motivo
 * @returns {Promise<T>}
 */
export function conTope(promesa, ms, motivo) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let reloj;
  const tope = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(motivo)), ms);
  });
  return /** @type {Promise<T>} */ (Promise.race([promesa, tope])).finally(() => clearTimeout(reloj));
}

/** Tope de la espera de fuentes e imágenes de una pantalla. */
const TOPE_ESPERA_MS = 30000;

/** Firma de 8 bytes con la que empieza todo PNG. */
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Ancho y alto de la cabecera IHDR: lo que mide de verdad el PNG escrito (R10). `null` si el
 * buffer no empieza por la firma PNG seguida del bloque IHDR.
 * @param {Buffer} png
 * @returns {{ ancho: number, alto: number } | null}
 */
export function dimensionesPng(png) {
  if (png.length < 24 || !png.subarray(0, 8).equals(FIRMA_PNG)) return null;
  if (png.toString("ascii", 12, 16) !== "IHDR") return null;
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

/**
 * R10. Compara lo que mide el PNG con lo que el plan (el manifiesto) declara para esa captura.
 * Devuelve `null` si coinciden o el motivo del fallo, nombrando la captura.
 * @param {Buffer} png
 * @param {Pick<PasoDeCaptura, "src" | "ancho" | "alto">} paso
 * @returns {string | null}
 */
export function fallosDeTamano(png, paso) {
  const medidas = dimensionesPng(png);
  if (medidas === null) return `${paso.src} no es un PNG válido`;
  const { ancho, alto } = medidas;
  if (ancho !== paso.ancho || alto !== paso.alto) {
    return `${paso.src} mide ${ancho}x${alto} y el manifiesto declara ${paso.ancho}x${paso.alto}`;
  }
  return null;
}

/** @param {string} mensaje */
function salirConError(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

/** @param {string} base */
async function comprobarQueResponde(base) {
  const aviso = `La app no responde en ${base}: arráncala con pnpm build && pnpm start`;
  let respuesta;
  try {
    respuesta = await fetch(base, { signal: AbortSignal.timeout(15000) });
  } catch (err) {
    // `fetch` envuelve la causa real (ECONNREFUSED, timeout...) en `cause`, a veces sin mensaje.
    const causa = err instanceof Error && err.cause instanceof Error ? err.cause : err;
    const detalle = causa?.code ?? causa?.name ?? String(causa);
    salirConError(`${aviso}\n  (${detalle})`);
    return;
  }
  if (!respuesta.ok) salirConError(`${aviso}\n  (respondió ${respuesta.status})`);
}

async function cargarChromium() {
  try {
    return (await import("@playwright/test")).chromium;
  } catch (err) {
    salirConError(`No se pudo cargar @playwright/test: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Pasos 4 y 5 de D1: abre la pantalla lista para capturar y devuelve lo observado.
 * @param {import("@playwright/test").Page} page
 * @param {string} url
 */
async function prepararYObservar(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  // Con `pnpm dev` Next pinta su indicador dentro de `nextjs-portal`; no es parte de la app.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // Las `img` con `loading="lazy"` fuera de pantalla no cargan nunca solas: se pasan a `eager`.
  // Un `<img>` emite `load` o `error`, no `loadend`. El tope evita colgarse si alguna no termina.
  await conTope(
    page.evaluate(async () => {
      await document.fonts.ready;
      const imagenes = Array.from(document.images);
      for (const img of imagenes) img.loading = "eager";
      await Promise.all(
        imagenes
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((ok) => {
                img.addEventListener("load", ok, { once: true });
                img.addEventListener("error", ok, { once: true });
                if (img.complete) ok(undefined);
              }),
          ),
      );
    }),
    TOPE_ESPERA_MS,
    `las fuentes o las imágenes no terminaron de cargar en ${TOPE_ESPERA_MS / 1000} s`,
  );
  return page.evaluate(() => {
    const visible = (/** @type {Element} */ el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.opacity !== "0";
    };
    const portal = document.querySelector("nextjs-portal");
    return {
      texto: document.body.innerText,
      // `complete && naturalWidth > 0`: un logo de /brand/ que dio 404 no cuenta como mostrado.
      logos: Array.from(document.images)
        .filter(
          (img) =>
            img.src.includes("/brand/") && img.complete && img.naturalWidth > 0 && visible(img),
        )
        .map((img) => img.src),
      archivoCargada: document.fonts.check("16px Archivo"),
      indicadorVisible: portal !== null && getComputedStyle(portal).display !== "none",
    };
  });
}

/**
 * Paso 6 de D1: las capturas en memoria, sin escribir nada todavía.
 * @param {PasoDeCaptura[]} plan
 * @param {string} base
 */
async function capturarEnMemoria(plan, base) {
  const chromium = await cargarChromium();
  let navegador;
  try {
    navegador = await chromium.launch();
  } catch (err) {
    salirConError(
      `No se pudo lanzar chromium (${err instanceof Error ? err.message.split("\n")[0] : err}).\nInstálalo con: pnpm exec playwright install chromium`,
    );
    return [];
  }
  try {
    const resultados = [];
    for (const paso of plan) {
      const contexto = await navegador.newContext({
        viewport: paso.viewport,
        deviceScaleFactor: paso.escala,
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const page = await contexto.newPage();
      let observado;
      try {
        observado = await prepararYObservar(page, `${base}${paso.ruta}`);
      } catch (err) {
        // Un tope cumplido es un fallo de esa pantalla: entra en el todo o nada como los demás.
        resultados.push({ paso, png: null, motivos: [err instanceof Error ? err.message : String(err)] });
        await contexto.close();
        continue;
      }
      const png = await page.screenshot({ type: "png", animations: "disabled", caret: "hide" });
      resultados.push({ paso, png, motivos: fallosDePantalla(observado) });
      await contexto.close();
    }
    return resultados;
  } finally {
    await navegador.close();
  }
}

async function main() {
  // Paso 1 (R7) y paso 2 (R6): los dos cortan antes de abrir el navegador.
  const base = urlBaseLocal(process.env.CAPTURAS_URL ?? URL_POR_DEFECTO);
  const manifiesto = JSON.parse(readFileSync(resolve(root, "public", "manifest.json"), "utf8"));
  const plan = planDeCapturas(manifiesto);

  // Paso 3 (R8).
  await comprobarQueResponde(base);

  // Pasos 4 a 6 (R9): todo o nada.
  const resultados = await capturarEnMemoria(plan, base);
  const fallidas = resultados.filter((r) => r.motivos.length > 0);
  if (fallidas.length > 0) {
    for (const { paso, motivos } of fallidas) {
      console.error(`${paso.src} (pantalla ${paso.ruta}): ${motivos.join("; ")}`);
    }
    salirConError("No se escribió ninguna captura.");
  }

  // Paso 7 (R10): se relee lo escrito, no lo que se creía escribir.
  const malMedidas = [];
  for (const { paso, png } of resultados) {
    if (png === null) continue; // inalcanzable: una pantalla sin captura ya salió arriba con código 1
    const destino = resolve(root, "public", paso.src.replace(/^\//, ""));
    writeFileSync(destino, png);
    const fallo = fallosDeTamano(readFileSync(destino), paso);
    if (fallo !== null) {
      malMedidas.push(fallo);
      continue;
    }
    console.log(`Generada ${paso.src} desde ${paso.ruta} (${paso.ancho}x${paso.alto})`);
  }
  if (malMedidas.length > 0) salirConError(malMedidas.join("\n"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
