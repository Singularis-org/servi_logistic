import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

/**
 * SLT-157 «Guía única leída por cámara o pistola» · R567 — GUARDIA: UNA SOLA LECTURA DE GUÍA.
 *
 * La etiqueta lleva dos códigos con el mismo `num_guia`: un CODE128 (dígitos) y un QR (la URL
 * `<origin>/paquete/<n>`). Antes cada camino aceptaba uno solo, con siete `/^\d+$/` y siete
 * `extractNumGuiaFromScan` sueltos y tres reglas distintas. `leerGuia` (`lib/utils/paquete-url.ts`)
 * es ahora la única: esta guardia impide que una superficie vuelva a interpretar la guía por su
 * cuenta, que es como las reglas volvieron a divergir.
 *
 * Vigila `app/` y `components/`. `lib/` queda fuera a propósito: ahí vive `leerGuia`.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const CARPETAS = ["app", "components"] as const;

/**
 * Excepciones con su porqué. `app/paquete/[numGuia]/page.tsx` valida el SEGMENTO DE RUTA de la
 * página pública del paquete, no una lectura de cámara ni de pistola; SLT-157 la deja fuera de
 * alcance («la página `/paquete/[numGuia]` no cambia»).
 */
const EXCEPCIONES_DIGITOS = new Set(["app/paquete/[numGuia]/page.tsx"]);

/** Las siete superficies de captura de SLT-157 (C1-C5, recogida, recolección, verificar guía). */
const SUPERFICIES_DE_CAPTURA = [
  "app/(app)/ordenes/_components/EscanerRecepcionBodegaCentral.tsx",
  "app/(app)/ordenes/_components/EscanerRecepcionOrigen.tsx",
  "app/(app)/recepcion-satelite/_components/EscanerRecepcion.tsx",
  "app/(app)/cierres-admin/_components/cierre-confirmacion-fisica.tsx",
  "app/(app)/mis-asignaciones/_components/RecogerPaqueteCard.tsx",
  "app/(app)/recoleccion/_components/RecoleccionModule.tsx",
  "app/(app)/mis-asignaciones/_components/VerificarGuiaGate.tsx",
] as const;

/** La regla de dígitos suelta, tal como se escribía (`/^\d+$/`). */
const REGLA_DIGITOS = "/^\\d+$/";

const IMPORTA_LEER_GUIA =
  /import\s*\{[^}]*\bleerGuia\b[^}]*\}\s*from\s*["']@\/lib\/utils\/paquete-url["']/;

const AVISO =
  "SLT-157: la guía se lee SOLO con `leerGuia` (lib/utils/paquete-url.ts), por cámara y por " +
  "teclado. No la interpretes por tu cuenta en una pantalla.";

/** Rutas relativas (con `/`) de los .ts/.tsx bajo `carpeta`, recursivo. */
function fuentesBajo(carpeta: string): string[] {
  const absoluta = path.join(RAIZ, carpeta);
  if (!existsSync(absoluta)) return [];
  const salida: string[] = [];
  for (const entrada of readdirSync(absoluta, { withFileTypes: true, recursive: true })) {
    if (!entrada.isFile()) continue;
    if (!/\.tsx?$/.test(entrada.name)) continue;
    const completa = path.join(entrada.parentPath, entrada.name);
    salida.push(path.relative(RAIZ, completa).split(path.sep).join("/"));
  }
  return salida;
}

function leer(relativa: string): string {
  return readFileSync(path.join(RAIZ, relativa), "utf8");
}

const FUENTES = CARPETAS.flatMap(fuentesBajo);

describe("R567 — una sola lectura de guía en app/ y components/", () => {
  it("el barrido encuentra las superficies (no es una guardia vacía)", () => {
    expect(FUENTES.length).toBeGreaterThan(100);
    for (const superficie of SUPERFICIES_DE_CAPTURA) {
      expect(FUENTES, `no se encontró ${superficie}`).toContain(superficie);
    }
  });

  it("ningún archivo nombra `extractNumGuiaFromScan` (retirada, sin alias)", () => {
    const infractores = FUENTES.filter((f) => leer(f).includes("extractNumGuiaFromScan"));
    expect(infractores, AVISO).toEqual([]);
  });

  it("ningún archivo aplica la regla de dígitos suelta `/^\\d+$/`", () => {
    const infractores = FUENTES.filter(
      (f) => !EXCEPCIONES_DIGITOS.has(f) && leer(f).includes(REGLA_DIGITOS),
    );
    expect(infractores, AVISO).toEqual([]);
  });

  it("las siete superficies de captura importan `leerGuia`", () => {
    const sinLeerGuia = SUPERFICIES_DE_CAPTURA.filter((f) => !IMPORTA_LEER_GUIA.test(leer(f)));
    expect(sinLeerGuia, AVISO).toEqual([]);
  });

  it("las siete superficies de captura no convierten lo leído con `Number(...)`", () => {
    const infractores = SUPERFICIES_DE_CAPTURA.filter((f) => /\bNumber\(/.test(leer(f)));
    expect(infractores, AVISO).toEqual([]);
  });

  it("las excepciones siguen existiendo (una excepción huérfana no tapa nada)", () => {
    for (const excepcion of EXCEPCIONES_DIGITOS) {
      expect(FUENTES, `excepción huérfana: ${excepcion}`).toContain(excepcion);
    }
  });
});
