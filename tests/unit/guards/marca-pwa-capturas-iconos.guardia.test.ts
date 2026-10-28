import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

// SL-9 — GUARDIA DE LAS CAPTURAS DE LA PWA Y DE LOS ICONOS SUELTOS (R3, R4, R13; design D2).
//
// Una captura con la marca anterior compila, despliega y no pone rojo nada: solo se ve en la
// ficha de instalacion. Un PNG que cambia no lo relaciona ningun grafo de imports, asi que esta
// guardia vive en `tests/unit/guards/` y corre siempre.

const RAIZ = path.resolve(__dirname, "..", "..", "..");
const CAPTURAS = ["inicio-narrow.png", "ingreso-narrow.png", "inicio-wide.png"] as const;

function rutaCaptura(nombre: string): string {
  return path.join(RAIZ, "public", "screenshots", nombre);
}

/* -------------------------------------------------------------------------- */
/* 1 · R3 — ninguna captura es la de la marca anterior, byte a byte           */
/* -------------------------------------------------------------------------- */

/** SHA-256 de las tres capturas tal como estaban en `dev` antes de SL-9 (medidas en T1). */
const HUELLAS_MARCA_ANTERIOR: Record<(typeof CAPTURAS)[number], string> = {
  "inicio-narrow.png": "aa0f6826301706c9059611da3f80358ee0d100f7c858a5b4994a20c40c81f2bb",
  "ingreso-narrow.png": "79cba346f3ac7fd8f93846af85d5460c76e66957f3910e4e8bc6719419d0a0e9",
  "inicio-wide.png": "4ca3d4adfd3ac62d51b76a79a6ea7dd6b1ca2cb6a89be7e74acbfd7c3b7cfc0a",
};

describe("marca · capturas de la PWA · huellas (R3)", () => {
  it.each(CAPTURAS)("%s no es la captura de la marca anterior", (nombre) => {
    const sha = crypto.createHash("sha256").update(fs.readFileSync(rutaCaptura(nombre))).digest("hex");
    expect(sha, `${nombre} sigue siendo la captura de la marca anterior`).not.toBe(
      HUELLAS_MARCA_ANTERIOR[nombre],
    );
  });
});

/* -------------------------------------------------------------------------- */
/* 2 · R4 — los colores de cada captura                                       */
/* -------------------------------------------------------------------------- */

type Rgb = readonly [number, number, number];

/** Naranja y navy de la marca anterior (`specs/SL-8-marca-logo-paleta-fuente/design.md > D5`). */
const COLORES_MARCA_ANTERIOR: readonly Rgb[] = [
  [0xf2, 0x64, 0x19],
  [0x0b, 0x25, 0x45],
];
/** Negro y amarillo de la marca nueva. */
const COLORES_MARCA_NUEVA: readonly Rgb[] = [
  [0x11, 0x11, 0x11],
  [0xff, 0xd0, 0x00],
];
const DISTANCIA_MAXIMA = 24;

// Umbrales (decision del humano, 2026-10-28; `design.md > D2 > Umbral fijado`). Medidas, con la
// marca anterior sumando naranja y navy:
//
//   captura          anterior/viejas  anterior/nuevas      nueva/viejas  nueva/nuevas
//   inicio-narrow    78.323 %         1.289 % (todo navy)  0 %           18.509 %
//   ingreso-narrow    2.283 %         0.015 %              0 %            4.197 %
//   inicio-wide      81.199 %         0.836 % (todo navy)  0 %           23.020 %
//
// El navy que queda en las capturas nuevas viene del titulo de servicios de la landing:
// `TituloSeccion` (`app/_landing/primitivas.tsx`) usa `text-asfalto-9`, y `--color-asfalto-9`
// vale `#0d2444`, a distancia <= 24 del navy `#0b2545`. Los tokens `asfalto-*` son de SL-33, que
// los cambiara; al cerrar SL-33 las capturas se regeneran con el script y este hueco se agranda.
// Por eso el umbral de la marca anterior es < 1.8 %: entre el maximo de las nuevas (1.289 %) y
// el minimo de las viejas (2.283 %).
const UMBRAL_MARCA_ANTERIOR = 0.018;
const UMBRAL_MARCA_NUEVA = 0.01;

/** Fraccion de pixeles a distancia euclidea RGB <= 24 de alguno de los colores dados. */
async function fraccionCercana(nombre: string, colores: readonly Rgb[]): Promise<number> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(rutaCaptura(nombre))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const limite = DISTANCIA_MAXIMA * DISTANCIA_MAXIMA;
  const total = info.width * info.height;
  let cerca = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const alguno = colores.some(([cr, cg, cb]) => {
      const dr = r - cr;
      const dg = g - cg;
      const db = b - cb;
      return dr * dr + dg * dg + db * db <= limite;
    });
    if (alguno) cerca++;
  }
  return cerca / total;
}

describe("marca · capturas de la PWA · colores (R4)", () => {
  it.each(CAPTURAS)("%s apenas tiene naranja o navy de la marca anterior", async (nombre) => {
    const fraccion = await fraccionCercana(nombre, COLORES_MARCA_ANTERIOR);
    expect(fraccion, `${nombre}: ${(fraccion * 100).toFixed(3)} % de la marca anterior`).toBeLessThan(
      UMBRAL_MARCA_ANTERIOR,
    );
  });

  it.each(CAPTURAS)("%s tiene negro o amarillo de la marca nueva", async (nombre) => {
    const fraccion = await fraccionCercana(nombre, COLORES_MARCA_NUEVA);
    expect(
      fraccion,
      `${nombre}: ${(fraccion * 100).toFixed(3)} % de la marca nueva`,
    ).toBeGreaterThanOrEqual(UMBRAL_MARCA_NUEVA);
  });
});

/* -------------------------------------------------------------------------- */
/* 3 · R13 — los cuatro iconos sueltos no existen ni se nombran                */
/* -------------------------------------------------------------------------- */

// Se arman por partes para que este archivo no repita el literal entero que se busca.
const ICONOS_BORRADOS = ["envios", "entregadas", "wallet", "transacciones"].map(
  (sufijo) => `icono_${sufijo}`,
);
const CARPETAS_RECORRIDAS = ["app", "components", "lib", "public"];
const EXTENSIONES_BINARIAS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".pdf",
  ".zip",
]);

/**
 * Archivos de texto versionados, o nuevos sin ignorar, bajo `app/`, `components/`, `lib/` y
 * `public/`. Parte de `git ls-files` (como `sin-nombre-heredado`) para que un archivo local
 * ignorado no ponga roja la guardia en una maquina y no en otra; `--others --exclude-standard`
 * mete lo nuevo sin commitear, para que no espere al commit para salir en rojo.
 */
function archivosRecorridos(): string[] {
  const salida = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", ...CARPETAS_RECORRIDAS],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return (
    salida
      .split("\0")
      .filter((r) => r.length > 0 && !EXTENSIONES_BINARIAS.has(path.extname(r).toLowerCase()))
      .map((r) => path.join(RAIZ, r))
      // `ls-files` lista tambien lo borrado del arbol y aun no commiteado.
      .filter((ruta) => fs.existsSync(ruta) && fs.statSync(ruta).isFile())
  );
}

describe("marca · iconos sueltos borrados (R13)", () => {
  // El recorrido corre aqui y no al cargar el modulo: si falla, sale en los casos con nombre.
  let ARCHIVOS_RECORRIDOS: string[] = [];
  beforeAll(() => {
    ARCHIVOS_RECORRIDOS = archivosRecorridos();
  });

  it("los cuatro png no existen", () => {
    for (const icono of ICONOS_BORRADOS) {
      const ruta = path.join(RAIZ, "public", "icons", `${icono}.png`);
      expect(fs.existsSync(ruta), `${icono}.png sigue existiendo`).toBe(false);
    }
  });

  it("ningun archivo de texto de app, components, lib o public los nombra", () => {
    const hallazgos: string[] = [];
    for (const archivo of ARCHIVOS_RECORRIDOS) {
      const contenido = fs.readFileSync(archivo, "utf8");
      for (const icono of ICONOS_BORRADOS) {
        if (contenido.includes(icono)) {
          hallazgos.push(`${path.relative(RAIZ, archivo)}: ${icono}`);
        }
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it("anti-vacuidad: el recorrido lee mas de 100 archivos e incluye KpisMensajero.tsx", () => {
    expect(ARCHIVOS_RECORRIDOS.length).toBeGreaterThan(100);
    expect(ARCHIVOS_RECORRIDOS.some((ruta) => path.basename(ruta) === "KpisMensajero.tsx")).toBe(
      true,
    );
  });
});
