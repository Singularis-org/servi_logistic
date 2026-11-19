/**
 * SLT-80 (D5) — el ÚNICO analizador de bloques del Markdown de Ayuda.
 *
 * Pasa las líneas de un `.md` a una lista de bloques (título, párrafo, lista, tabla, cita,
 * código y separador). Lo consumen dos pintores: `markdown.tsx` (React, la pantalla) y
 * `lib/pdf/guia-api-pdf.ts` (jsPDF, la descarga). Con un solo analizador, la pantalla y el
 * PDF no pueden leer el mismo `.md` de dos formas distintas sin que nada se ponga rojo.
 *
 * El texto de cada bloque se devuelve CRUDO, con la sintaxis en línea (`**`, `*`, `` ` ``)
 * intacta: cada pintor la interpreta a su manera. El subconjunto que se entiende (y lo que
 * no) está documentado en `markdown.tsx`.
 */

/** `linea`: línea (0-based) donde empieza el bloque; es su clave estable. */
export type BloqueMarkdown = { linea: number } & (
  | { tipo: "codigo"; lenguaje: string; texto: string }
  | { tipo: "titulo"; nivel: number; texto: string }
  | { tipo: "separador" }
  | { tipo: "tabla"; cabecera: string[]; filas: string[][] }
  | { tipo: "cita"; texto: string }
  | { tipo: "lista"; ordenada: boolean; items: string[] }
  | { tipo: "parrafo"; texto: string }
);

/** Los patrones de énfasis en línea, en orden de prioridad (`**` antes que `*`). */
const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

/** Un trozo de texto de una línea con su énfasis, ya sin los marcadores. */
export interface TrozoInline {
  tipo: "texto" | "negrita" | "cursiva" | "codigo";
  texto: string;
}

/**
 * El texto de una línea partido en trozos: negritas, cursivas, código en línea y texto literal.
 * Es la misma gramática para la pantalla y para el PDF.
 */
export function partirInline(texto: string): TrozoInline[] {
  return texto
    .split(INLINE)
    .filter((trozo) => trozo !== "")
    .map((trozo): TrozoInline => {
      if (trozo.startsWith("**") && trozo.endsWith("**") && trozo.length > 4) {
        return { tipo: "negrita", texto: trozo.slice(2, -2) };
      }
      if (trozo.startsWith("*") && trozo.endsWith("*") && trozo.length > 2) {
        return { tipo: "cursiva", texto: trozo.slice(1, -1) };
      }
      if (trozo.startsWith("`") && trozo.endsWith("`") && trozo.length > 2) {
        return { tipo: "codigo", texto: trozo.slice(1, -1) };
      }
      return { tipo: "texto", texto: trozo };
    });
}

/** Es la fila separadora de una tabla (`| --- | --- |`), no una fila de datos. */
function esSeparadorDeTabla(linea: string): boolean {
  return /^\|[\s:|-]+\|$/.test(linea.trim()) && linea.includes("-");
}

/** `| a | b |` -> `["a","b"]`. */
function celdas(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((celda) => celda.trim());
}

/** ¿Esta línea empieza un bloque distinto? Corta el párrafo en curso. */
function arrancaOtroBloque(linea: string): boolean {
  return (
    /^#{1,6}\s/.test(linea) ||
    /^>\s?/.test(linea) ||
    /^```/.test(linea) ||
    /^\s*[-*+]\s+/.test(linea) ||
    /^\s*\d+\.\s+/.test(linea) ||
    /^(-{3,}|\*{3,}|_{3,})\s*$/.test(linea) ||
    linea.trim().startsWith("|")
  );
}

/** Markdown -> bloques, en el orden del documento. */
export function analizarBloques(markdown: string): BloqueMarkdown[] {
  const lineas = markdown.split(/\r?\n/);
  const bloques: BloqueMarkdown[] = [];
  let i = 0;

  while (i < lineas.length) {
    const linea = lineas[i];
    const inicio = i;

    if (linea.trim() === "") {
      i += 1;
      continue;
    }

    // Bloque de código: se copia TAL CUAL, sin tocar el interior.
    const apertura = /^```\s*(\S*)\s*$/.exec(linea);
    if (apertura) {
      const dentro: string[] = [];
      i += 1;
      while (i < lineas.length && !/^```\s*$/.test(lineas[i])) {
        dentro.push(lineas[i]);
        i += 1;
      }
      i += 1; // la línea de cierre
      bloques.push({ linea: inicio, tipo: "codigo", lenguaje: apertura[1], texto: dentro.join("\n") });
      continue;
    }

    const titulo = /^(#{1,6})\s+(.*)$/.exec(linea);
    if (titulo) {
      bloques.push({ linea: inicio, tipo: "titulo", nivel: titulo[1].length, texto: titulo[2] });
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(linea)) {
      bloques.push({ linea: inicio, tipo: "separador" });
      i += 1;
      continue;
    }

    // Tabla: una fila con tuberías seguida de la fila separadora.
    if (linea.trim().startsWith("|") && i + 1 < lineas.length && esSeparadorDeTabla(lineas[i + 1])) {
      const cabecera = celdas(linea);
      i += 2;
      const filas: string[][] = [];
      while (i < lineas.length && lineas[i].trim().startsWith("|")) {
        filas.push(celdas(lineas[i]));
        i += 1;
      }
      bloques.push({ linea: inicio, tipo: "tabla", cabecera, filas });
      continue;
    }

    // Cita: el aviso de riesgo del README («los avisos de riesgo se destacan»).
    if (/^>\s?/.test(linea)) {
      const dentro: string[] = [];
      while (i < lineas.length && /^>\s?/.test(lineas[i])) {
        dentro.push(lineas[i].replace(/^>\s?/, ""));
        i += 1;
      }
      bloques.push({ linea: inicio, tipo: "cita", texto: dentro.join(" ") });
      continue;
    }

    // Listas. Sin anidamiento: ningún documento lo usa (medido) y soportarlo a medias es peor.
    const vinieta = /^\s*[-*+]\s+(.*)$/.exec(linea);
    const numerada = /^\s*\d+\.\s+(.*)$/.exec(linea);
    if (vinieta || numerada) {
      const ordenada = numerada !== null;
      const patron = ordenada ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      const items: string[] = [];
      while (i < lineas.length) {
        const item = patron.exec(lineas[i]);
        if (item) {
          items.push(item[1]);
          i += 1;
          continue;
        }
        // Continuación del ítem anterior (el Markdown de la carpeta parte líneas a ~100
        // columnas, así que casi todo ítem largo tiene una segunda línea sangrada).
        if (items.length > 0 && /^\s+\S/.test(lineas[i]) && !/^\s*$/.test(lineas[i])) {
          items[items.length - 1] += ` ${lineas[i].trim()}`;
          i += 1;
          continue;
        }
        break;
      }
      bloques.push({ linea: inicio, tipo: "lista", ordenada, items });
      continue;
    }

    // Párrafo: todas las líneas seguidas hasta una en blanco o el arranque de otro bloque.
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i].trim() !== "" && !arrancaOtroBloque(lineas[i])) {
      parrafo.push(lineas[i].trim());
      i += 1;
    }
    if (parrafo.length > 0) {
      bloques.push({ linea: inicio, tipo: "parrafo", texto: parrafo.join(" ") });
      continue;
    }
    i += 1;
  }

  return bloques;
}
