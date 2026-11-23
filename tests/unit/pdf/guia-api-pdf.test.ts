import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { analizarBloques } from "@/lib/ayuda/bloques";
import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import type { DocumentoAyuda } from "@/lib/ayuda/documento";
import { SLUG_GUIA_API } from "@/lib/ayuda/guia-api";
import { ErrorCaracterNoImprimible } from "@/lib/pdf/etiquetas-fuente-registro";
import { construirPdfGuiaApi } from "@/lib/pdf/guia-api-pdf";
import { COBERTURA_GUIA, fuenteGuiaBold, fuenteGuiaRegular } from "@/lib/pdf/guia-fuente";
import { LOGO_CORREO_PNG_BASE64 } from "@/lib/services/email/plantillas/logo-correo";

import {
  contenidoDePagina,
  fuentesDePagina,
  imagenesDePagina,
  objetos,
  paginas,
  textoLegible,
  textosDePagina,
} from "./pdf-inspector";
import { codePointsCubiertos, nombreFamilia } from "./ttf-lector";

// SLT-80 «Guía de integración por API en la ayuda» — R1301, R1309, R1310, R1311 sobre el PDF REAL de
// la guía vigente, leído con `pdf-inspector` (el texto, con el /ToUnicode que declara el propio
// documento).
//
// ⚠️ Los textos esperados de la portada y del pie son LITERALES del spec (R1310), no las constantes
// del generador: compararlos contra su propia fuente dejaría el test verde aunque el texto cambiara.

const RAIZ = path.resolve(__dirname, "../../..");
const TITULO = "Guía de integración — API de Servi Logistic";
const LOGO = Uint8Array.from(Buffer.from(LOGO_CORREO_PNG_BASE64, "base64"));

/** Los títulos del `.md` con una regex PROPIA sobre el texto crudo (no con `bloques.ts`). */
function titulosDelMarkdown(cuerpo: string): string[] {
  const titulos: string[] = [];
  let enCodigo = false;
  for (const linea of cuerpo.split(/\r?\n/)) {
    if (/^```/.test(linea)) {
      enCodigo = !enCodigo;
      continue;
    }
    if (enCodigo) continue;
    const m = /^#{1,6}\s+(.+)$/.exec(linea);
    // Dentro de `código` el texto va tal cual (`orden.gestion_*`); fuera, sin marcadores de énfasis.
    if (m) {
      titulos.push(
        m[1]
          .split(/(`[^`]+`)/)
          .map((t) => (t.startsWith("`") ? t.slice(1, -1) : t.replace(/\*/g, "")))
          .join(""),
      );
    }
  }
  return titulos;
}

const sinEspacios = (s: string): string => s.replace(/\s+/g, "");

/**
 * ¿Es este color el de la paleta? jsPDF escribe cada canal con 2-3 decimales (`0.82 rg`), así que
 * `#FFD000` vuelve como `#FFD100`: se admite ±2 por canal, muy lejos de cualquier otro color.
 */
function esColor(leido: string, hex: string): boolean {
  const canales = (h: string): number[] => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const a = canales(leido);
  const b = canales(hex);
  return a.every((v, k) => Math.abs(v - b[k]) <= 2);
}

interface TextoDePagina {
  texto: string;
  tamano: number;
  fuente: string;
}

function textosLegibles(bytes: Uint8Array, indice: number): TextoDePagina[] {
  const fuentes = fuentesDePagina(bytes, indice);
  return textosDePagina(bytes, indice).map((t) => {
    const f = fuentes.get(t.fuenteRes);
    return { texto: textoLegible(t, f), tamano: t.tamano, fuente: f?.baseFont ?? "" };
  });
}

/**
 * Color de relleno activo en cada `Tj` y en cada rectángulo relleno de la página. jsPDF pinta el
 * texto con el color de relleno (`rg`, o `g` si es gris), así que un solo recorrido del stream da los
 * dos. Las cadenas se neutralizan antes, para que un texto con «1 0 0 rg» no invente un color.
 */
function coloresDePagina(bytes: Uint8Array, indice: number): { textos: string[]; rellenos: string[] } {
  const stream = contenidoDePagina(bytes, indice)
    .replace(/\((?:\\[\s\S]|[^()\\])*\)/g, "()")
    .replace(/<[0-9a-fA-F\s]*>/g, "<>");
  const re =
    /(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+rg\b|(-?[\d.]+)\s+g\b|\s+re\s+(?:f\*|f|F|B\*|B)\b|(?:\(\)|<>)\s*Tj/g;
  const hex = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  let actual = "#000000";
  const textos: string[] = [];
  const rellenos: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream)) !== null) {
    if (m[1] !== undefined) actual = `#${hex(+m[1])}${hex(+m[2])}${hex(+m[3])}`;
    else if (m[4] !== undefined) actual = `#${hex(+m[4]).repeat(3)}`;
    else if (m[0].includes("Tj")) textos.push(actual);
    else rellenos.push(actual);
  }
  return { textos, rellenos };
}

describe("SLT-80 · PDF de la guía de integración (R1301, R1309–R1311)", () => {
  let doc: DocumentoAyuda;
  let pdf: Uint8Array;
  let total: number;

  beforeAll(async () => {
    const leido = await leerDocumentoAyuda(SLUG_GUIA_API);
    if (leido === null) throw new Error("SLT-80: la guía no está en el catálogo de Ayuda");
    doc = leido;
    pdf = construirPdfGuiaApi(analizarBloques(doc.cuerpo), doc, LOGO);
    total = paginas(objetos(pdf)).length;
  }, 60_000);

  it("R1311 · la guía vigente se genera sin error y da un PDF de varias páginas", () => {
    expect(new TextDecoder("latin1").decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(total, "SLT-80: portada + cuerpo").toBeGreaterThan(5);
  });

  it("R1301, R1309 · cada título del .md sale en el PDF, en el mismo orden y sin otros", () => {
    const esperados = titulosDelMarkdown(doc.cuerpo);
    expect(esperados.length, "SLT-80: la guía tiene títulos (si no, el test es vacuo)").toBeGreaterThan(30);

    // Los títulos se dibujan por encima de 10,5 pt; el cuerpo, el código y el pie, por debajo.
    const dibujados: string[] = [];
    for (let i = 1; i < total; i++) {
      for (const t of textosLegibles(pdf, i)) if (t.tamano > 10.5) dibujados.push(t.texto);
    }
    const recibido = sinEspacios(dibujados.join(""));
    const esperado = sinEspacios(esperados.join(""));
    // Primero el entorno de la primera diferencia: con ~65 títulos, el diff entero no se lee.
    let i = 0;
    while (i < esperado.length && recibido[i] === esperado[i]) i++;
    expect(recibido.slice(Math.max(0, i - 40), i + 40)).toBe(esperado.slice(Math.max(0, i - 40), i + 40));
    expect(recibido).toBe(esperado);
  });

  it("R1310 · portada: logo, franja #FFD000, título y versión; sin pie", () => {
    const imagenes = imagenesDePagina(pdf, 0);
    expect(imagenes).toHaveLength(1);
    for (let i = 1; i < total; i++) expect(imagenesDePagina(pdf, i)).toHaveLength(0);

    expect(coloresDePagina(pdf, 0).rellenos.some((c) => esColor(c, "#FFD000"))).toBe(true);

    const texto = textosLegibles(pdf, 0)
      .map((t) => t.texto)
      .join(" ");
    expect(sinEspacios(texto)).toContain(sinEspacios(TITULO));
    expect(texto).toContain(`Versión del documento: ${doc.actualizado}`);
    expect(texto).not.toContain(" / ");
  });

  it("R1310 · el pie «… · n / N» está en las páginas 2..N y no en la portada", () => {
    const portada = textosLegibles(pdf, 0).map((t) => t.texto);
    expect(portada.some((t) => t.includes(`${TITULO} ·`))).toBe(false);
    for (let i = 1; i < total; i++) {
      const textos = textosLegibles(pdf, i).map((t) => t.texto);
      expect(textos, `página ${i + 1}`).toContain(`${TITULO} · ${i + 1} / ${total}`);
    }
  });

  it("R1310 · todo el texto en #111111: ningún texto en #FFD000", () => {
    const colores = new Set<string>();
    for (let i = 0; i < total; i++) for (const c of coloresDePagina(pdf, i).textos) colores.add(c);
    expect(colores.size, "SLT-80: hay texto que mirar").toBeGreaterThan(0);
    expect([...colores].filter((c) => esColor(c, "#FFD000"))).toEqual([]);
    expect([...colores].filter((c) => !esColor(c, "#111111"))).toEqual([]);
  });

  it("R1310 · Archivo embebida (Regular y Bold) en el texto y Courier en el código", () => {
    const familias = new Set<string>();
    const bases = new Set<string>();
    for (let i = 0; i < total; i++) {
      for (const f of fuentesDePagina(pdf, i).values()) {
        bases.add(f.baseFont);
        if (f.fontFile2) familias.add(nombreFamilia(f.fontFile2));
      }
    }
    expect([...familias]).toEqual(["Archivo"]);
    expect([...bases].some((b) => /Courier/.test(b))).toBe(true);

    const tamanosCourier = new Set<number>();
    for (let i = 1; i < total; i++) {
      for (const t of textosLegibles(pdf, i)) if (/Courier/.test(t.fuente)) tamanosCourier.add(t.tamano);
    }
    expect(tamanosCourier.size, "SLT-80: algún bloque de código en Courier").toBeGreaterThan(0);
  });

  it("R1310 · si el logo no carga, la portada lleva «Servi Logistic» en texto y el PDF sale igual", () => {
    for (const logo of [null, new Uint8Array([1, 2, 3, 4])]) {
      const sinLogo = construirPdfGuiaApi(analizarBloques(doc.cuerpo), doc, logo);
      expect(imagenesDePagina(sinLogo, 0)).toHaveLength(0);
      const texto = textosLegibles(sinLogo, 0).map((t) => t.texto);
      expect(texto).toContain("Servi Logistic");
    }
  });

  it("R1311 · un carácter que Archivo no cubre lanza ErrorCaracterNoImprimible nombrándolo", () => {
    const md = `${doc.cuerpo}\n\nUn párrafo con un ideograma 鬱 en medio.\n`;
    let error: unknown;
    try {
      construirPdfGuiaApi(analizarBloques(md), doc, LOGO);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ErrorCaracterNoImprimible);
    expect((error as ErrorCaracterNoImprimible).caracter).toBe("鬱");
    expect((error as Error).message).toContain("U+9B31");
  });

  it("R1311 · y en un bloque de código, un carácter que Courier no escribe también lanza", () => {
    const md = "# Uno\n\n```\nconst x = \"→\";\n```\n";
    expect(() => construirPdfGuiaApi(analizarBloques(md), doc, LOGO)).toThrow(ErrorCaracterNoImprimible);
  });

  it("D4 · la cobertura declarada es la del archivo, y el base64 es el .ttf commiteado", () => {
    for (const [fuente, archivo] of [
      [fuenteGuiaRegular, "Archivo-guia-regular-subset.ttf"],
      [fuenteGuiaBold, "Archivo-guia-bold-subset.ttf"],
    ] as const) {
      const ttf = new Uint8Array(readFileSync(path.join(RAIZ, "assets", "fuentes", archivo)));
      expect(Buffer.from(fuente.base64, "base64").equals(Buffer.from(ttf)), archivo).toBe(true);
      expect(nombreFamilia(ttf)).toBe("Archivo");
      const declarados: number[] = [];
      for (const [desde, hasta] of COBERTURA_GUIA) for (let cp = desde; cp <= hasta; cp++) declarados.push(cp);
      expect(codePointsCubiertos(ttf), archivo).toEqual(declarados);
    }
  });
});
