import type { Color } from "@/lib/facturas-plataforma/pdf-comun";
import { contenidoDePagina, fuentesDePagina, objetos, paginas, textoLegible, textosDePagina } from "../pdf/pdf-inspector";

// SLT-199 — lectura de los PDF de la factura y del anexo para sus tests: el texto con la fuente que declara el
// propio documento, y el color de relleno activo de cada texto y de cada rectángulo, del content stream.

/** Milímetros a puntos PDF. */
export const PT = 72 / 25.4;

export interface TextoLeido {
  texto: string;
  fuente: string;
  x: number;
  y: number;
  tamano: number;
  color: Color;
}

const COLOR_O_TEXTO =
  /([\d.]+) ([\d.]+) ([\d.]+) rg|([\d.]+) g\b|\((?:\\[\s\S]|[^()\\])*\)\s*Tj|<[0-9a-fA-F]*>\s*Tj/g;

/** El color de relleno activo en cada `Tj`, en el mismo orden que `textosDePagina`. */
function coloresDeTextos(contenido: string): Color[] {
  const out: Color[] = [];
  let color: Color = [0, 0, 0];
  for (const m of contenido.matchAll(COLOR_O_TEXTO)) {
    if (m[1] !== undefined) color = [m[1], m[2], m[3]].map((c) => Number(c) * 255) as unknown as Color;
    else if (m[4] !== undefined) color = [0, 1, 2].map(() => Number(m[4]) * 255) as unknown as Color;
    else out.push(color);
  }
  return out;
}

/** Cada página como la lista de sus textos, en orden de dibujo. */
export function leerPdf(buffer: ArrayBuffer | Uint8Array) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const n = paginas(objetos(bytes)).length;
  const pags: TextoLeido[][] = Array.from({ length: n }, (_, i) => {
    const fuentes = fuentesDePagina(bytes, i);
    const colores = coloresDeTextos(contenidoDePagina(bytes, i));
    return textosDePagina(bytes, i).map((t, j) => {
      const fuente = fuentes.get(t.fuenteRes);
      return { texto: textoLegible(t, fuente), fuente: fuente?.baseFont ?? "", x: t.x, y: t.y, tamano: t.tamano, color: colores[j] };
    });
  });
  return { bytes, pags, textos: pags.map((p) => p.map((t) => t.texto)) };
}

export interface RectanguloLeido {
  x: number;
  y: number;
  w: number;
  h: number;
  color: Color;
}

/** Los rectángulos rellenos (`re f`) en orden de dibujo, con el color de relleno activo. */
export function rectangulosConColor(contenido: string): RectanguloLeido[] {
  const out: RectanguloLeido[] = [];
  const re = /([\d.]+) ([\d.]+) ([\d.]+) rg|([\d.]+) g\b|(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s+f/g;
  let color: Color = [0, 0, 0];
  for (const m of contenido.matchAll(re)) {
    if (m[1] !== undefined) color = [m[1], m[2], m[3]].map((c) => Number(c) * 255) as unknown as Color;
    else if (m[4] !== undefined) color = [0, 1, 2].map(() => Number(m[4]) * 255) as unknown as Color;
    else out.push({ x: Number(m[5]), y: Number(m[6]), w: Number(m[7]), h: Math.abs(Number(m[8])), color });
  }
  return out;
}

/**
 * Toda figura rellena (`re` o un trazado `m`/`l`/`c` cerrado con `f`), con su caja y el color de relleno activo: la
 * banda y la banda de total son rectángulos redondeados, que jsPDF dibuja como trazado y no como `re`.
 */
export function figurasRellenas(contenido: string): RectanguloLeido[] {
  const limpio = contenido.replace(/\((?:\\[\s\S]|[^()\\])*\)/g, "()").replace(/<[0-9a-fA-F\s]*>/g, "<>");
  const re =
    /([\d.]+) ([\d.]+) ([\d.]+) rg|([\d.]+) g\b|(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\b|((?:-?[\d.]+ )+)[mlc]\b|\b([fn])\b/g;
  const out: RectanguloLeido[] = [];
  let color: Color = [0, 0, 0];
  let xs: number[] = [];
  let ys: number[] = [];
  for (const m of limpio.matchAll(re)) {
    if (m[1] !== undefined) color = [m[1], m[2], m[3]].map((c) => Number(c) * 255) as unknown as Color;
    else if (m[4] !== undefined) color = [0, 1, 2].map(() => Number(m[4]) * 255) as unknown as Color;
    else if (m[5] !== undefined) {
      const [x, y, w, h] = [m[5], m[6], m[7], m[8]].map(Number);
      xs.push(x, x + w);
      ys.push(y, y + h);
    } else if (m[9] !== undefined) {
      const n = m[9].trim().split(/\s+/).map(Number);
      n.forEach((v, i) => (i % 2 === 0 ? xs : ys).push(v));
    } else {
      if (m[10] === "f" && xs.length > 0) {
        const [x, y] = [Math.min(...xs), Math.min(...ys)];
        out.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, color });
      }
      xs = [];
      ys = [];
    }
  }
  return out;
}

/** jsPDF escribe cada canal con dos decimales: hasta ~2 de 255 de diferencia. */
export function mismoColor(a: Color, b: Color): boolean {
  return a.every((c, i) => Math.abs(c - b[i]) <= 2.6);
}

/** Los textos que se dibujaron justo después de `etiqueta` en la página. */
export function tras(pagina: readonly string[], etiqueta: string, saltos = 1): string[] {
  const i = pagina.indexOf(etiqueta);
  if (i < 0) throw new Error(`no está «${etiqueta}»`);
  return pagina.slice(i + 1, i + 1 + saltos);
}
