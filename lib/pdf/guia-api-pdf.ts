// SLT-80 «Guía de integración por API en la ayuda» (R1309–R1311) — el PDF de la guía de integración,
// generado desde el MISMO `.md` que pinta la pantalla de Ayuda (R1301): recibe los bloques de
// `analizarBloques` (`lib/ayuda/bloques.ts`, D5), no relee el Markdown por su cuenta.
//
// Estructura copiada de `lib/facturas-plataforma/pdf.ts` (lienzo jsPDF, logo con `addImage` y el nombre
// en texto si el PNG no carga, pies al final para conocer el total de páginas). La paleta NO: es la de
// `docs/marca.md` — texto en Negro Servi `#111111`, Amarillo Señal `#FFD000` solo en franjas y barras,
// NUNCA como color de texto («nunca texto amarillo sobre blanco»: 1.47:1).
//
// Tipografía (D4): Archivo embebida (Regular y Bold, `lib/pdf/guia-fuente.ts`) en todo el texto, y
// Courier estándar de jsPDF en los bloques de código. El código en línea va en Archivo: la guía lo usa
// con caracteres que Courier no escribe (`…`).
//
// Cobertura (R1311): ANTES de dibujar nada se comprueba cada texto contra su fuente. Un carácter que
// Archivo (o Courier, en un bloque de código) no tiene lanza `ErrorCaracterNoImprimible` nombrándolo:
// jsPDF lo borraría de la cadena en silencio, que es justo lo que no puede pasar en un manual.
import { jsPDF } from "jspdf";

import { partirInline, type BloqueMarkdown } from "@/lib/ayuda/bloques";
import type { DocumentoAyuda } from "@/lib/ayuda/documento";
import {
  caracterNoEscribibleEstandar,
  ErrorCaracterNoImprimible,
  exigirCobertura,
  registrarFuente,
} from "@/lib/pdf/etiquetas-fuente-registro";
import { MARCA } from "@/lib/config/marca";
import { fuenteGuiaBold, fuenteGuiaRegular } from "@/lib/pdf/guia-fuente";

/** Título de la portada y del pie (R1310). */
export const TITULO_PDF_GUIA_API = `Guía de integración — API de ${MARCA.nombre}`;

/** El pie de cada página menos la portada (R1310). */
export function pieGuiaApi(pagina: number, total: number): string {
  return `${TITULO_PDF_GUIA_API} · ${pagina} / ${total}`;
}

/** La línea de versión de la portada (R1310). */
export function versionGuiaApi(actualizado: string): string {
  return `Versión del documento: ${actualizado}`;
}

/** Lo que la portada escribe si el logo no se puede dibujar (R1310). */
export const NOMBRE_SIN_LOGO = MARCA.nombre;

/** Quién «es» la guía en el mensaje de `ErrorCaracterNoImprimible` (que habla de «la guia <x>»). */
const IDENTIDAD_EN_ERROR = "de integración por API";

type Color = readonly [number, number, number];

/** Negro Servi (`docs/marca.md`): todo el texto. */
const NEGRO: Color = [0x11, 0x11, 0x11];
/** Amarillo Señal: franja de portada, barra de títulos y de citas. Nunca texto. */
const AMARILLO: Color = [0xff, 0xd0, 0x00];
/** Fondo claro: fondo de los bloques de código, de las citas y de la cabecera de tabla. */
const FONDO: Color = [0xf7, 0xf7, 0xf5];
/** Filetes de tabla. */
const FILETE: Color = [0xdd, 0xdd, 0xda];

const ANCHO = 210;
const ALTO = 297;
const MARGEN = 18;
const UTIL = ANCHO - 2 * MARGEN;
/** Última coordenada en la que puede acabar contenido: el pie vive debajo. */
const LIMITE = ALTO - 22;
const PT_A_MM = 0.3528;

const PT_CUERPO = 9.5;
const PT_CODIGO = 8;
const PT_PIE = 7.5;
/** Cuerpo de cada nivel de título (`#` = 1). Todos por encima de 10,5 pt: el cuerpo nunca llega. */
const PT_TITULO: Record<number, number> = { 1: 16, 2: 13, 3: 11.5 };
const PT_TITULO_RESTO = 11;

const interlinea = (pt: number): number => pt * PT_A_MM * 1.35;

type Peso = "normal" | "bold";

/** Un trozo de una línea ya maquetada. */
interface Pieza {
  texto: string;
  peso: Peso;
}

/** Una palabra (o un pedazo de una) con el peso con el que se dibuja y si la precede un espacio. */
interface Palabra extends Pieza {
  espacio: boolean;
}

class Lienzo {
  readonly doc: jsPDF;
  y = MARGEN;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    registrarFuente(this.doc, fuenteGuiaRegular);
    registrarFuente(this.doc, fuenteGuiaBold);
    this.archivo(PT_CUERPO, "normal");
  }

  archivo(pt: number, peso: Peso): void {
    this.doc.setFont(fuenteGuiaRegular.nombre, peso);
    this.doc.setFontSize(pt);
    this.doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
  }

  courier(pt: number): void {
    this.doc.setFont("courier", "normal");
    this.doc.setFontSize(pt);
    this.doc.setTextColor(NEGRO[0], NEGRO[1], NEGRO[2]);
  }

  rect(x: number, y: number, w: number, h: number, color: Color): void {
    this.doc.setFillColor(color[0], color[1], color[2]);
    this.doc.rect(x, y, w, h, "F");
  }

  nuevaPagina(): void {
    this.doc.addPage("a4", "portrait");
    this.y = MARGEN;
  }

  /** Salta de página si `alto` no cabe. */
  asegurar(alto: number): void {
    if (this.y + alto > LIMITE) this.nuevaPagina();
  }

  ancho(texto: string, peso: Peso, pt: number): number {
    this.archivo(pt, peso);
    return this.doc.getTextWidth(texto);
  }

  /**
   * Parte texto con énfasis en líneas de `anchoMax`. Las negritas van en Archivo Bold; la cursiva y
   * el código en línea, en Archivo Regular (no hay cursiva embebida). Una palabra más ancha que la
   * línea (una URL, una ruta) se corta por caracteres: nada se sale del margen.
   */
  maquetar(texto: string, anchoMax: number, pt: number, pesoBase: Peso = "normal"): Pieza[][] {
    const palabras: Palabra[] = [];
    let espacioPendiente = false;
    for (const trozo of partirInline(texto)) {
      const peso: Peso = trozo.tipo === "negrita" ? "bold" : pesoBase;
      const partes = trozo.texto.split(/(\s+)/);
      for (const parte of partes) {
        if (parte === "") continue;
        if (/^\s+$/.test(parte)) {
          espacioPendiente = true;
          continue;
        }
        palabras.push({ texto: parte, peso, espacio: espacioPendiente && palabras.length > 0 });
        espacioPendiente = false;
      }
    }

    const lineas: Pieza[][] = [];
    let linea: Pieza[] = [];
    let x = 0;
    const espacio = this.ancho(" ", "normal", pt);
    const cerrar = (): void => {
      if (linea.length > 0) lineas.push(linea);
      linea = [];
      x = 0;
    };
    const anadir = (texto: string, peso: Peso, conEspacio: boolean): void => {
      const ultima = linea[linea.length - 1];
      if (ultima && ultima.peso === peso) ultima.texto += `${conEspacio ? " " : ""}${texto}`;
      else linea.push({ texto: `${conEspacio && linea.length > 0 ? " " : ""}${texto}`, peso });
    };

    for (const palabra of palabras) {
      const w = this.ancho(palabra.texto, palabra.peso, pt);
      const sep = palabra.espacio && linea.length > 0 ? espacio : 0;
      if (x + sep + w <= anchoMax) {
        anadir(palabra.texto, palabra.peso, sep > 0);
        x += sep + w;
        continue;
      }
      if (w <= anchoMax) {
        cerrar();
        anadir(palabra.texto, palabra.peso, false);
        x = w;
        continue;
      }
      // Más ancha que la línea: se corta por caracteres.
      if (linea.length > 0 && x + sep >= anchoMax * 0.6) cerrar();
      let resto = palabra.texto;
      let conEspacio = sep > 0 && linea.length > 0;
      while (resto.length > 0) {
        const disponible = anchoMax - x - (conEspacio ? espacio : 0);
        let n = resto.length;
        while (n > 1 && this.ancho(resto.slice(0, n), palabra.peso, pt) > disponible) n -= 1;
        if (this.ancho(resto.slice(0, n), palabra.peso, pt) > disponible && linea.length > 0) {
          cerrar();
          conEspacio = false;
          continue;
        }
        anadir(resto.slice(0, n), palabra.peso, conEspacio);
        x += (conEspacio ? espacio : 0) + this.ancho(resto.slice(0, n), palabra.peso, pt);
        resto = resto.slice(n);
        conEspacio = false;
        if (resto.length > 0) cerrar();
      }
    }
    cerrar();
    return lineas;
  }

  /** Dibuja una línea maquetada con la línea base en `y`. */
  linea(piezas: Pieza[], x: number, y: number, pt: number): void {
    let cursor = x;
    for (const pieza of piezas) {
      this.archivo(pt, pieza.peso);
      this.doc.text(pieza.texto, cursor, y);
      cursor += this.doc.getTextWidth(pieza.texto);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Cobertura (R1311): se comprueba TODO antes de dibujar, para que el error no deje un PDF a medias.
// ---------------------------------------------------------------------------------------------

function exigirArchivo(texto: string, campo: string): void {
  // Regular y Bold tienen el mismo cmap (`COBERTURA_GUIA`); basta con una.
  exigirCobertura(fuenteGuiaRegular, texto, campo, IDENTIDAD_EN_ERROR);
}

function exigirCourier(texto: string, campo: string): void {
  const falta = caracterNoEscribibleEstandar(texto.replace(/\n/g, ""));
  if (falta === null) return;
  throw new ErrorCaracterNoImprimible(
    IDENTIDAD_EN_ERROR,
    falta,
    falta.codePointAt(0) ?? 0,
    campo,
    "Courier",
  );
}

function textoInline(texto: string): string {
  return partirInline(texto)
    .map((t) => t.texto)
    .join("");
}

function exigirCoberturaDeBloques(bloques: readonly BloqueMarkdown[], actualizado: string): void {
  exigirArchivo(TITULO_PDF_GUIA_API, "título de la portada");
  exigirArchivo(versionGuiaApi(actualizado), "versión de la portada");
  exigirArchivo(NOMBRE_SIN_LOGO, "nombre de la portada");
  exigirArchivo(pieGuiaApi(0, 0), "pie de página");
  for (const bloque of bloques) {
    const campo = `línea ${bloque.linea + 1} del .md (${bloque.tipo})`;
    switch (bloque.tipo) {
      case "codigo":
        exigirCourier(bloque.texto, campo);
        break;
      case "titulo":
      case "parrafo":
      case "cita":
        exigirArchivo(textoInline(bloque.texto), campo);
        break;
      case "lista":
        for (const item of bloque.items) exigirArchivo(textoInline(item), campo);
        break;
      case "tabla":
        for (const celda of [...bloque.cabecera, ...bloque.filas.flat()]) {
          exigirArchivo(textoInline(celda), campo);
        }
        break;
      case "separador":
        break;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Portada
// ---------------------------------------------------------------------------------------------

/** R1310: el logo del correo (PNG 360×105); `false` si no lo hay o jsPDF no lo puede pintar. */
function dibujarLogo(l: Lienzo, logo: Uint8Array | null): boolean {
  if (logo === null) return false;
  const ancho = 70;
  const alto = (ancho * 105) / 360;
  try {
    l.doc.addImage(logo, "PNG", MARGEN, 34, ancho, alto);
    return true;
  } catch {
    // Un PNG que jsPDF no entiende cuenta como un logo que no se pudo cargar: va el nombre en texto.
    return false;
  }
}

function portada(l: Lienzo, actualizado: string, logo: Uint8Array | null): void {
  if (!dibujarLogo(l, logo)) {
    l.archivo(22, "bold");
    l.doc.text(NOMBRE_SIN_LOGO, MARGEN, 50);
  }
  // La franja de acento: un bloque, nunca un texto (docs/marca.md).
  l.rect(0, 72, ANCHO, 7, AMARILLO);

  let y = 104;
  for (const linea of l.maquetar(TITULO_PDF_GUIA_API, UTIL, 26, "bold")) {
    l.linea(linea, MARGEN, y, 26);
    y += interlinea(26);
  }
  l.archivo(11, "normal");
  l.doc.text(versionGuiaApi(actualizado), MARGEN, y + 6);
}

// ---------------------------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------------------------

function titulo(l: Lienzo, nivel: number, texto: string): void {
  const pt = PT_TITULO[nivel] ?? PT_TITULO_RESTO;
  const lineas = l.maquetar(texto, UTIL, pt, "bold");
  const alto = lineas.length * interlinea(pt);
  const aire = nivel === 1 ? 8 : 5;
  // Un título nunca se queda solo al pie: pide su alto y un par de líneas de cuerpo.
  l.y += aire;
  l.asegurar(alto + 2 * interlinea(PT_CUERPO));
  for (const linea of lineas) {
    l.y += interlinea(pt);
    l.linea(linea, MARGEN, l.y, pt);
  }
  if (nivel === 1) {
    l.rect(MARGEN, l.y + 2, 16, 1.2, AMARILLO);
    l.y += 3.2;
  }
  l.y += 1.5;
}

function parrafo(l: Lienzo, texto: string, x = MARGEN, ancho = UTIL): void {
  l.y += 2;
  for (const linea of l.maquetar(texto, ancho, PT_CUERPO)) {
    l.asegurar(interlinea(PT_CUERPO));
    l.y += interlinea(PT_CUERPO);
    l.linea(linea, x, l.y, PT_CUERPO);
  }
}

function lista(l: Lienzo, ordenada: boolean, items: readonly string[]): void {
  const sangria = 6;
  l.y += 1;
  items.forEach((item, n) => {
    const lineas = l.maquetar(item, UTIL - sangria, PT_CUERPO);
    l.y += 1;
    lineas.forEach((linea, i) => {
      l.asegurar(interlinea(PT_CUERPO));
      l.y += interlinea(PT_CUERPO);
      if (i === 0) {
        l.archivo(PT_CUERPO, "normal");
        l.doc.text(ordenada ? `${n + 1}.` : "•", MARGEN + 1, l.y);
      }
      l.linea(linea, MARGEN + sangria, l.y, PT_CUERPO);
    });
  });
}

/**
 * Una franja con fondo por línea (citas y código). Cada línea pinta SU banda antes de su texto y la
 * línea base queda dentro de la banda: así la banda de la línea siguiente no tapa los descendentes
 * de esta, y un salto de página puede caer entre dos líneas cualesquiera.
 */
function enBandas(
  l: Lienzo,
  cuantas: number,
  h: number,
  barra: boolean,
  dibujar: (i: number, base: number) => void,
): void {
  const relleno = 1.5;
  l.y += 3;
  for (let i = 0; i < cuantas; i++) {
    const primera = i === 0;
    const alto = h + (primera ? relleno : 0) + (i === cuantas - 1 ? relleno : 0);
    l.asegurar(alto);
    const arriba = l.y;
    l.rect(MARGEN, arriba, UTIL, alto, FONDO);
    if (barra) l.rect(MARGEN, arriba, 1.2, alto, AMARILLO);
    dibujar(i, arriba + (primera ? relleno : 0) + h * 0.75);
    l.y = arriba + alto;
  }
}

function cita(l: Lienzo, texto: string): void {
  const lineas = l.maquetar(texto, UTIL - 8, PT_CUERPO);
  enBandas(l, lineas.length, interlinea(PT_CUERPO), true, (i, base) =>
    l.linea(lineas[i], MARGEN + 5, base, PT_CUERPO),
  );
}

/** Los bloques de código: Courier, sin tocar el interior; las líneas largas se parten por caracteres. */
function codigo(l: Lienzo, texto: string): void {
  l.courier(PT_CODIGO);
  const porLinea = Math.max(10, Math.floor((UTIL - 6) / l.doc.getTextWidth("M")));
  const lineas: string[] = [];
  for (const original of texto.split("\n")) {
    if (original.length === 0) lineas.push("");
    for (let i = 0; i < original.length; i += porLinea) lineas.push(original.slice(i, i + porLinea));
  }
  enBandas(l, lineas.length, interlinea(PT_CODIGO), false, (i, base) => {
    if (lineas[i] === "") return;
    l.courier(PT_CODIGO);
    l.doc.text(lineas[i], MARGEN + 3, base);
  });
}

const RELLENO_CELDA = 1.5;

/**
 * Anchos de columna proporcionales a lo que traen. Suelo de cada columna: su palabra más ancha (para
 * que «Webhook» no se parta en «Webhoo/k»), con tope para que una ruta larga no se coma la tabla.
 */
function anchosDeColumna(l: Lienzo, cabecera: readonly string[], filas: readonly string[][]): number[] {
  const columnas = cabecera.length;
  const celdasDe = (c: number): string[] => [cabecera[c], ...filas.map((f) => f[c] ?? "")].map(textoInline);
  const peso = cabecera.map((_, c) => Math.min(60, Math.max(6, ...celdasDe(c).map((t) => t.length))));
  const suelo = cabecera.map((_, c) => {
    const palabras = celdasDe(c).flatMap((t) => t.split(/\s+/));
    const masAncha = Math.max(0, ...palabras.map((p) => l.ancho(p, "bold", PT_CUERPO)));
    return Math.min(masAncha + 2 * RELLENO_CELDA + 0.5, (UTIL / columnas) * 1.4);
  });
  const total = peso.reduce((a, b) => a + b, 0);
  const crudo = peso.map((p, c) => Math.max(suelo[c], (p / total) * UTIL));
  // Si los suelos se pasan del ancho útil, se reparte el exceso entre las columnas que van sobradas.
  let exceso = crudo.reduce((a, b) => a + b, 0) - UTIL;
  if (exceso <= 0) {
    const escala = UTIL / crudo.reduce((a, b) => a + b, 0);
    return crudo.map((w) => w * escala);
  }
  const holgura = crudo.map((w, c) => Math.max(0, w - suelo[c]));
  const totalHolgura = holgura.reduce((a, b) => a + b, 0);
  const anchos = crudo.map((w, c) => w - (totalHolgura > 0 ? (holgura[c] / totalHolgura) * exceso : 0));
  exceso = anchos.reduce((a, b) => a + b, 0) - UTIL;
  const escala = UTIL / (UTIL + Math.max(0, exceso));
  return anchos.map((w) => w * escala);
}

function tabla(l: Lienzo, cabecera: readonly string[], filas: readonly string[][]): void {
  const anchos = anchosDeColumna(l, cabecera, filas);
  const h = interlinea(PT_CUERPO);
  const maquetarFila = (celdas: readonly string[], peso: Peso): Pieza[][][] =>
    anchos.map((w, c) => l.maquetar(celdas[c] ?? "", w - 2 * RELLENO_CELDA, PT_CUERPO, peso));
  const altoDe = (celdas: Pieza[][][]): number =>
    Math.max(1, ...celdas.map((c) => c.length)) * h + 2 * RELLENO_CELDA;

  const dibujarFila = (celdas: Pieza[][][], fondo: Color | null): void => {
    const alto = altoDe(celdas);
    if (fondo) l.rect(MARGEN, l.y, UTIL, alto, fondo);
    let x = MARGEN;
    celdas.forEach((lineas, c) => {
      lineas.forEach((linea, i) =>
        l.linea(linea, x + RELLENO_CELDA, l.y + RELLENO_CELDA + (i + 1) * h - 1, PT_CUERPO),
      );
      x += anchos[c];
    });
    l.y += alto;
    l.rect(MARGEN, l.y - 0.2, UTIL, 0.2, FILETE);
  };

  const encabezado = maquetarFila(cabecera, "bold");
  const cuerpo = filas.map((fila) => maquetarFila(fila, "normal"));
  l.y += 3;
  // La cabecera nunca se queda sola al pie: pide su alto y el de la primera fila.
  l.asegurar(altoDe(encabezado) + (cuerpo.length > 0 ? altoDe(cuerpo[0]) : 0));
  dibujarFila(encabezado, FONDO);
  for (const celdas of cuerpo) {
    if (l.y + altoDe(celdas) > LIMITE) {
      // La tabla sigue en otra página: repite su cabecera, como el informe de tránsito.
      l.nuevaPagina();
      dibujarFila(encabezado, FONDO);
    }
    dibujarFila(celdas, null);
  }
}

function separador(l: Lienzo): void {
  l.y += 4;
  l.asegurar(2);
  l.rect(MARGEN, l.y, UTIL, 0.3, FILETE);
  l.y += 2;
}

/** El pie de cada página MENOS la portada; se dibuja al final para conocer el total (R1310). */
function pies(l: Lienzo): void {
  const total = l.doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    l.doc.setPage(i);
    l.rect(MARGEN, ALTO - 15, UTIL, 0.4, AMARILLO);
    l.archivo(PT_PIE, "normal");
    l.doc.text(pieGuiaApi(i, total), MARGEN, ALTO - 10);
  }
}

/**
 * R1309–R1311: el PDF de la guía de integración. `bloques` sale de `analizarBloques(doc.cuerpo)` y
 * `actualizado` del frontmatter (R1301). `logo` son los bytes del PNG del logo, o `null`.
 * Lanza `ErrorCaracterNoImprimible` si algún texto no cabe en su fuente.
 */
export function construirPdfGuiaApi(
  bloques: readonly BloqueMarkdown[],
  frontmatter: Pick<DocumentoAyuda, "actualizado">,
  logo: Uint8Array | null,
): Uint8Array {
  exigirCoberturaDeBloques(bloques, frontmatter.actualizado);

  const l = new Lienzo();
  portada(l, frontmatter.actualizado, logo);
  l.nuevaPagina();

  for (const bloque of bloques) {
    switch (bloque.tipo) {
      case "titulo":
        titulo(l, bloque.nivel, bloque.texto);
        break;
      case "parrafo":
        parrafo(l, bloque.texto);
        break;
      case "lista":
        lista(l, bloque.ordenada, bloque.items);
        break;
      case "cita":
        cita(l, bloque.texto);
        break;
      case "codigo":
        codigo(l, bloque.texto);
        break;
      case "tabla":
        tabla(l, bloque.cabecera, bloque.filas);
        break;
      case "separador":
        separador(l);
        break;
    }
  }

  pies(l);
  return new Uint8Array(l.doc.output("arraybuffer"));
}
