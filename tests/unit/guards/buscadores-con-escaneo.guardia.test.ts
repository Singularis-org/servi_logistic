import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { quitarComentarios } from "@/tests/fixtures/sin-comentarios";

/**
 * SLT-160 «Buscar escaneando en los listados» (R609, D1) — GUARDIA: la prop `escaneo` de
 * `BuscadorFiltros` la pasan SOLO los buscadores con guía B1-B8, y los ocho la pasan. B7 y B8
 * comparten montaje (`EstadoCuenta`), así que son siete archivos. `/cierres-admin` (B9) busca por
 * folio, que no se imprime en ningún código: no la lleva.
 */

const RAIZ = path.resolve(__dirname, "../../..");

const CON_ESCANEO = [
  "app/(app)/ordenes/_components/OrdenesListado.tsx", // B1
  "app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx", // B2
  "app/(app)/novedades/_components/NovedadesFiltrosBarra.tsx", // B3
  "app/(app)/historico/conversaciones/_components/HistoricoFiltrosBar.tsx", // B4
  "app/(app)/historico/acciones/_components/HistorialAccionesFiltrosBar.tsx", // B5
  "app/(app)/wallet/_components/LibroCajaBarra.tsx", // B6
  "components/shared/estado-cuenta/EstadoCuenta.tsx", // B7 y B8
  "app/(app)/recoleccion/_components/RecoleccionModule.tsx", // SLT-194 (R940): Recolección
];

const CIERRES_ADMIN = "app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx";

/** Las etiquetas de apertura `<BuscadorFiltros …>` de una fuente, contando llaves (`=>` va dentro). */
function aperturasDeBuscador(fuente: string): string[] {
  const codigo = quitarComentarios(fuente);
  const aperturas: string[] = [];
  const marca = /<BuscadorFiltros\b/g;
  let m: RegExpExecArray | null;
  while ((m = marca.exec(codigo)) !== null) {
    let profundidad = 0;
    let i = m.index + m[0].length;
    for (; i < codigo.length; i++) {
      const c = codigo[i];
      if (c === "{") profundidad++;
      else if (c === "}") profundidad--;
      else if (c === ">" && profundidad === 0) break;
    }
    aperturas.push(codigo.slice(m.index, i + 1));
  }
  return aperturas;
}

/** ¿Alguna apertura pasa `escaneo` (suelta o `escaneo={…}`) como prop de primer nivel? */
function pasaEscaneo(fuente: string): boolean {
  return aperturasDeBuscador(fuente).some((apertura) => {
    let profundidad = 0;
    let plano = "";
    for (const c of apertura) {
      if (c === "{") profundidad++;
      else if (c === "}") profundidad--;
      else if (profundidad === 0) plano += c;
    }
    return /\sescaneo(?=[\s=/>])/.test(plano);
  });
}

function fuentesTsx(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = path.join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...fuentesTsx(ruta));
    else if (ruta.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

const leer = (relativa: string) => readFileSync(path.join(RAIZ, relativa), "utf8");

describe("SLT-160 — guardia: buscadores con `escaneo` (R609)", () => {
  it.each(CON_ESCANEO)("%s monta `BuscadorFiltros` con `escaneo`", (archivo) => {
    const fuente = leer(archivo);
    expect(aperturasDeBuscador(fuente).length).toBeGreaterThan(0);
    expect(pasaEscaneo(fuente)).toBe(true);
  });

  it("`/cierres-admin` monta `BuscadorFiltros` sin `escaneo`", () => {
    const fuente = leer(CIERRES_ADMIN);
    expect(aperturasDeBuscador(fuente).length).toBeGreaterThan(0); // no vacuidad
    expect(pasaEscaneo(fuente)).toBe(false);
  });

  it("ningún otro montaje de `app/` o `components/` pasa `escaneo`", () => {
    const conEscaneo = [
      ...fuentesTsx(path.join(RAIZ, "app")),
      ...fuentesTsx(path.join(RAIZ, "components")),
    ]
      .filter((ruta) => pasaEscaneo(readFileSync(ruta, "utf8")))
      .map((ruta) => path.relative(RAIZ, ruta).split(path.sep).join("/"))
      .sort();
    expect(conEscaneo).toEqual([...CON_ESCANEO].sort());
  });

  // SLT-160 (R772, DC2): el nombre accesible propio de B1 y B2 (B3-B7 ya lo tenían).
  it.each([
    ["app/(app)/ordenes/_components/OrdenesListado.tsx", "Buscar órdenes"],
    ["app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx", "Buscar órdenes de la bodega"],
  ])("R772: %s nombra su campo «%s»", (archivo, nombre) => {
    const aperturas = aperturasDeBuscador(leer(archivo));
    expect(aperturas).toHaveLength(1);
    expect(aperturas[0]).toContain(`label="${nombre}"`);
  });

  it("contraprueba: el detector ve y no ve `escaneo` donde toca", () => {
    const con = `<BuscadorFiltros\n  escaneo\n  onChange={(t) => f(t > 1)}\n/>`;
    const sin = `<BuscadorFiltros\n  onChange={(t) => f({ escaneo: t })}\n/>`;
    const otroComponente = `<Otro escaneo />\n<BuscadorFiltros onChange={f} />`;
    expect(pasaEscaneo(con)).toBe(true);
    expect(pasaEscaneo(sin)).toBe(false);
    expect(pasaEscaneo(otroComponente)).toBe(false);
  });
});
