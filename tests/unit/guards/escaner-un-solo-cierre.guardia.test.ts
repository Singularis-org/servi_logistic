// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R928; decisión de Carlos del
// 2026-11-17): el escáner es UN solo componente. La barra con el título y el único «Cerrar» de
// 44 × 44 px son de `components/shared/EscanerModal.tsx`, para todos los usos.
//
// Esta guardia recorre `app/` y `components/`. En cada archivo que MONTA `<EscanerModal`:
// - no admite `DialogClose`, `showCloseButton` ni un botón «Cerrar» propio (ninguna pantalla pinta
//   su propio cierre del diálogo del escáner);
// - exige `titulo=` en la etiqueta de apertura de cada `<EscanerModal` (el typecheck lo refuerza:
//   `titulo` es obligatorio).
// Se lee el código sin comentarios: la prosa que nombra estas piezas no dispara.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { quitarComentarios } from "../../fixtures/sin-comentarios";

const RAIZ = process.cwd();
const COMPONENTE = path.join("components", "shared", "EscanerModal.tsx");

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const ruta = path.join(dir, entrada);
    if (statSync(ruta).isDirectory()) return recorrer(ruta);
    return /\.tsx$/.test(entrada) ? [ruta] : [];
  });
}

function relativa(archivo: string): string {
  return path.relative(RAIZ, archivo);
}

/**
 * La etiqueta de apertura que empieza en `inicio` (`<EscanerModal …>`): termina en el primer `>`
 * fuera de llaves, así que las props con JSX dentro (`acciones={<>…</>}`) no la cortan.
 */
function etiquetaDeApertura(fuente: string, inicio: number): string {
  let profundidad = 0;
  for (let i = inicio + 1; i < fuente.length; i++) {
    const c = fuente[i];
    if (c === "{") profundidad++;
    else if (c === "}") profundidad--;
    else if (c === ">" && profundidad === 0) return fuente.slice(inicio, i + 1);
  }
  return fuente.slice(inicio);
}

const MONTAJES = ["app", "components"]
  .flatMap((dir) => recorrer(path.join(RAIZ, dir)))
  .filter((archivo) => relativa(archivo) !== COMPONENTE)
  .map((archivo) => ({ archivo: relativa(archivo), codigo: quitarComentarios(readFileSync(archivo, "utf8")) }))
  .filter(({ codigo }) => /<EscanerModal\b/.test(codigo));

/** Un cierre propio del diálogo del escáner. */
const CIERRES_PROPIOS: readonly [string, RegExp][] = [
  ["DialogClose", /\bDialogClose\b/],
  ["showCloseButton", /\bshowCloseButton\b/],
  ["ESCANER_CERRAR_LABEL", /\bESCANER_CERRAR_LABEL\b/],
  ['aria-label="Cerrar"', /aria-label=\{?["'`]Cerrar["'`]\}?/],
  ["botón con el texto «Cerrar»", />\s*Cerrar\s*</],
];

describe("SLT-193 · R928 — el escáner pinta un solo cierre, el de EscanerModal", () => {
  it("la guardia no está vacía: encuentra los montajes de hoy", () => {
    // Reparto, Recoger, Recolección, satélite, Órdenes, recepción continua y cámara del buscador.
    expect(MONTAJES.length).toBeGreaterThanOrEqual(7);
  });

  it("ningún archivo que monta `<EscanerModal` pinta su propio cierre", () => {
    const fallos = MONTAJES.flatMap(({ archivo, codigo }) =>
      CIERRES_PROPIOS.filter(([, re]) => re.test(codigo)).map(([nombre]) => `${archivo}: ${nombre}`),
    );
    expect(fallos).toEqual([]);
  });

  it("cada `<EscanerModal` lleva `titulo=`", () => {
    const fallos: string[] = [];
    let total = 0;
    for (const { archivo, codigo } of MONTAJES) {
      const re = /<EscanerModal\b/g;
      for (let m = re.exec(codigo); m; m = re.exec(codigo)) {
        total++;
        if (!/\btitulo=/.test(etiquetaDeApertura(codigo, m.index))) fallos.push(archivo);
      }
    }
    expect(total).toBeGreaterThanOrEqual(7);
    expect(fallos).toEqual([]);
  });
});
