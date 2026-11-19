// SLT-199 (design §2, §3; R1, R2, R5, R6) — lo que se ve igual en la factura y en el anexo: los colores, las
// medidas y los componentes (cabecera con barra degradada, tarjetas, títulos, tablas, banda de total y pies).
// `pdf.ts` y `anexo.ts` solo componen; así los dos documentos no pueden divergir en estilo (R1).
//
// Los tokens salen de las plantillas de `docs/referencias/` (la factura y su detalle de referencia), medidas en px CSS y pasadas
// a mm (1 px = 0,2646 mm). Las referencias son tamaño carta; aquí el papel es A4 con el mismo margen de 14 mm.
//
// Altura de fila FIJA: así la paginación es exacta y una tabla partida repite su cabecera sin perder ni duplicar
// filas (R5), como el informe de tránsito.
import { jsPDF } from "jspdf";

import { MARCA_FACTURA } from "@/lib/config/marca";
import { FACTURA_DESCARGA_TEXTOS as T, importeDocumento } from "@/lib/facturas-plataforma/resumen";
import { fuenteEtiqueta } from "@/lib/pdf/etiquetas-fuente";
import { registrarFuente, seguroEnFuenteEstandar } from "@/lib/pdf/etiquetas-fuente-registro";
import { imprimible } from "@/lib/pdf/imprimible";

/** Los bytes del PNG del logo configurado (`MARCA_FACTURA.logo`), o `null` si no se pudo cargar (R6). */
export type LogoDelPdf = Uint8Array;

export type Color = readonly [number, number, number];

/** Tokens de la referencia: uno por papel, no por documento. */
export const COLORES = {
  noche: [20, 18, 48],
  tinta: [30, 27, 75],
  gris: [109, 106, 138],
  /** El antetítulo de la cabecera. */
  grisClaro: [169, 166, 201],
  /** El texto del pie, más oscuro que `gris`. */
  textoPie: [56, 55, 71],
  violeta: [124, 58, 237],
  rojo: [190, 24, 93],
  verdeAzulado: [14, 116, 144],
  fondoTarjeta: [245, 243, 255],
  bordeTarjeta: [232, 230, 245],
  fondoFila: [255, 255, 255],
  fondoFilaAlterna: [251, 250, 255],
  linea: [237, 235, 250],
  blanco: [255, 255, 255],
  rosa: [245, 208, 254],
  /** Cian → violeta → rosa, a tramos iguales. */
  degradado: [[34, 211, 238], [124, 58, 237], [236, 72, 153]],
} as const satisfies Record<string, Color | readonly Color[]>;

/** Alto de una fila de tabla y cuerpo de su letra (pt): cada tabla usa uno fijo (R5). */
export interface FormatoFila {
  alto: number;
  letra: number;
}

export const MEDIDAS = {
  ancho: 210,
  alto: 297,
  margen: 14,
  util: 210 - 2 * 14,
  /** Última coordenada en la que puede acabar contenido: el pie vive debajo. */
  limite: 297 - 18,
  altoBanda: 24.6,
  altoBarra: 1.3,
  radioBanda: 2.6,
  /** Separación horizontal del logo y de los textos de la cabecera con el borde de la banda. */
  sangriaBanda: 5.8,
  anchoLogo: 32.8,
  altoTarjeta: 15.1,
  separacionTarjetas: 2.6,
  radioTarjeta: 2.1,
  /** Lo que se deja libre encima de un título de sección, también al principio de una página. */
  aireTitulo: 6.5,
  altoCabeceraTabla: 7,
  altoBandaTotal: 15.6,
  radioBandaTotal: 2.1,
  /** Línea base del pie. */
  yPie: 297 - 6.4,
  /** Tiras de color con las que se dibuja la barra degradada (jsPDF no pinta degradados sin su API avanzada). */
  tiras: 60,
  filaCompacta: { alto: 4.4, letra: 7.4 },
  filaAmplia: { alto: 9.6, letra: 12 },
} as const;

const { ancho: ANCHO, margen: MARGEN, util: UTIL } = MEDIDAS;
/** Lo que separa el texto de una celda de su borde. */
const SANGRIA_CELDA = 2;

export interface Columna {
  titulo: string;
  ancho: number;
  derecha?: boolean;
}

export interface Celda {
  texto: string;
  color?: Color;
  negrita?: boolean;
  /** Columnas que ocupa, desde la suya (por defecto 1): la etiqueta de un total que no cabe en «#». */
  abarca?: number;
}

/** R3: un importe de la base con el formato de documento; si es negativo, en rojo. */
export function celdaImporte(valor: string): Celda {
  const texto = importeDocumento(valor);
  return { texto, color: texto.startsWith("-") ? COLORES.rojo : undefined };
}

export interface Fila {
  celdas: Celda[];
  negrita?: boolean;
  /** Un filete de color encima de la fila y el fondo de tarjeta (un total). */
  filete?: boolean;
}

interface OpcionesTexto {
  derecha?: boolean;
  negrita?: boolean;
  ancho?: number;
  tamano?: number;
  color?: Color;
}

/** El color en el tramo `t` ∈ [0, 1] del degradado. */
function colorDelDegradado(t: number): Color {
  const [a, b] = t < 0.5 ? [COLORES.degradado[0], COLORES.degradado[1]] : [COLORES.degradado[1], COLORES.degradado[2]];
  const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * f)) as unknown as Color;
}

export class Lienzo {
  readonly doc: jsPDF;
  y: number = MARGEN;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    registrarFuente(this.doc, fuenteEtiqueta);
  }

  estilo(pt: number, color: Color = COLORES.tinta): void {
    this.doc.setFontSize(pt);
    this.color(color);
  }

  /** El trazo va con el texto: es el que engorda la negrita fingida de la fuente embebida. */
  private color(color: Color): void {
    this.doc.setTextColor(color[0], color[1], color[2]);
    this.doc.setDrawColor(color[0], color[1], color[2]);
  }

  /** Recorta a una línea con «…» para que la altura de fila sea fija. */
  recortado(t: string, ancho: number): string {
    if (this.doc.getTextWidth(t) <= ancho) return t;
    let corte = t;
    while (corte.length > 1 && this.doc.getTextWidth(`${corte}…`) > ancho) corte = corte.slice(0, -1);
    return `${corte}…`;
  }

  /**
   * R2: escribe `t` en una línea con la Helvetica de jsPDF. La Helvetica borra en silencio lo que no está en
   * WinAnsi (el `₡`, las comillas tipográficas): ese texto va ENTERO con la fuente embebida, que tiene las mismas
   * métricas, y lo que tampoco cubre sale «?». Entero y no por carácter, para que cada celda siga siendo un solo
   * texto alineable. La embebida es de un solo peso: su «negrita» es el glifo relleno y con trazo.
   */
  texto(t: string, x: number, y: number, op: OpcionesTexto = {}): void {
    if (op.tamano !== undefined) this.doc.setFontSize(op.tamano);
    if (op.color !== undefined) this.color(op.color);
    let linea = t.replace(/[\r\n\t]+/g, " ");
    let embebida = !seguroEnFuenteEstandar(linea);
    if (embebida) linea = imprimible(linea);
    this.fuente(embebida, op.negrita);
    if (op.ancho !== undefined) linea = this.recortado(linea, op.ancho);
    // El «…» del recorte tampoco está en WinAnsi.
    if (!embebida && !seguroEnFuenteEstandar(linea)) this.fuente((embebida = true), op.negrita);
    const fingida = embebida && op.negrita === true;
    if (fingida) this.doc.setLineWidth(0.18);
    this.doc.text(linea, x, y, {
      ...(op.derecha ? { align: "right" as const } : {}),
      ...(fingida ? { renderingMode: "fillThenStroke" as const } : {}),
    });
  }

  private fuente(embebida: boolean, negrita = false): void {
    if (embebida) this.doc.setFont(fuenteEtiqueta.nombre, fuenteEtiqueta.estilo);
    else this.doc.setFont("helvetica", negrita ? "bold" : "normal");
  }

  rect(x: number, y: number, w: number, h: number, color: Color, radio = 0): void {
    this.doc.setFillColor(color[0], color[1], color[2]);
    if (radio > 0) this.doc.roundedRect(x, y, w, h, radio, radio, "F");
    else this.doc.rect(x, y, w, h, "F");
  }

  /** Tiras contiguas con el color interpolado; cada una monta un poco sobre la siguiente para no dejar rendijas. */
  private degradado(x: number, y: number, w: number, h: number, vertical: boolean, tiras: number): void {
    for (let i = 0; i < tiras; i++) {
      const color = colorDelDegradado(i / (tiras - 1));
      if (vertical) this.rect(x, y + (h * i) / tiras, w, h / tiras + (i < tiras - 1 ? 0.05 : 0), color);
      else this.rect(x + (w * i) / tiras, y, w / tiras + (i < tiras - 1 ? 0.05 : 0), h, color);
    }
  }

  nuevaPagina(): void {
    this.doc.addPage("a4", "portrait");
    this.y = MARGEN;
  }

  /** Salta de página si `alto` no cabe. Devuelve `true` si saltó. */
  asegurar(alto: number): boolean {
    if (this.y + alto <= MEDIDAS.limite) return false;
    this.nuevaPagina();
    return true;
  }

  /**
   * R6, R8, R16: banda oscura redondeada con el logo (o «Singularis» en texto) y, a la derecha, el antetítulo, el
   * título y el cliente; su borde inferior es la barra degradada, recortada a las esquinas de la banda.
   */
  cabecera(op: { logo: LogoDelPdf | null; antetitulo: string; titulo: string; cliente: string }): void {
    const { altoBanda, altoBarra, radioBanda, sangriaBanda } = MEDIDAS;
    const arriba = this.y;
    const alto = altoBanda + altoBarra;
    this.rect(MARGEN, arriba, UTIL, alto, COLORES.noche, radioBanda);
    if (!this.logo(op.logo, arriba + alto / 2)) {
      const op = { tamano: 18, color: COLORES.blanco, negrita: true };
      this.texto(T.emisor, MARGEN + sangriaBanda, arriba + alto / 2 + 2.2, op);
    }
    const derecha = MARGEN + UTIL - sangriaBanda;
    this.texto(op.antetitulo, derecha, arriba + 7.7, { derecha: true, tamano: 8, color: COLORES.grisClaro });
    this.texto(op.titulo, derecha, arriba + 14.6, { derecha: true, negrita: true, tamano: 18, color: COLORES.blanco });
    const cliente = { derecha: true, ancho: UTIL - 60, tamano: 10, color: COLORES.rosa };
    this.texto(op.cliente, derecha, arriba + 19.6, cliente);
    this.doc.saveGraphicsState();
    this.doc.roundedRect(MARGEN, arriba, UTIL, alto, radioBanda, radioBanda, null);
    this.doc.clip();
    this.doc.discardPath();
    this.barraDegradada(arriba + altoBanda);
    this.doc.restoreGraphicsState();
    this.y = arriba + alto + 3.8;
  }

  barraDegradada(y: number): void {
    this.degradado(MARGEN, y, UTIL, MEDIDAS.altoBarra, false, MEDIDAS.tiras);
  }

  /** R6: el logo configurado; `false` si no lo hay o jsPDF no lo puede pintar. */
  private logo(logo: LogoDelPdf | null, centro: number): boolean {
    if (logo === null) return false;
    const ancho = MEDIDAS.anchoLogo;
    const alto = (ancho * MARCA_FACTURA.logo.alto) / MARCA_FACTURA.logo.ancho;
    try {
      this.doc.addImage(logo, "PNG", MARGEN + MEDIDAS.sangriaBanda, centro - alto / 2, ancho, alto);
      return true;
    } catch {
      // Un PNG que jsPDF no entiende cuenta como un logo que no se pudo cargar: va el nombre en texto (R6).
      return false;
    }
  }

  /** Rejilla de tarjetas en `columnas` columnas: etiqueta en versalitas y valor en negrita, hasta dos líneas. */
  tarjetas(valores: readonly (readonly [etiqueta: string, valor: string])[], columnas: number): void {
    const { altoTarjeta: alto, separacionTarjetas: sep, radioTarjeta: radio } = MEDIDAS;
    const ancho = (UTIL - sep * (columnas - 1)) / columnas;
    this.doc.setLineWidth(0.26);
    valores.forEach(([etiqueta, valor], i) => {
      const x = MARGEN + (i % columnas) * (ancho + sep);
      const y = this.y + Math.floor(i / columnas) * (alto + sep);
      this.doc.setDrawColor(COLORES.bordeTarjeta[0], COLORES.bordeTarjeta[1], COLORES.bordeTarjeta[2]);
      this.doc.setFillColor(COLORES.fondoTarjeta[0], COLORES.fondoTarjeta[1], COLORES.fondoTarjeta[2]);
      this.doc.roundedRect(x, y, ancho, alto, radio, radio, "FD");
      this.texto(etiqueta.toLocaleUpperCase("es"), x + 3.2, y + 5.7, { tamano: 7.5, color: COLORES.gris });
      this.estilo(9.5);
      this.lineas(valor, x + 3.2, y + 11, ancho - 6.4, 2, 3.8, true);
    });
    const filas = Math.ceil(valores.length / columnas);
    this.y += filas * alto + (filas - 1) * sep;
  }

  /** Un párrafo de hasta `maximo` líneas al ancho dado; la última se recorta con «…» si no cabe. */
  lineas(t: string, x: number, y: number, ancho: number, maximo: number, interlinea: number, negrita = false): void {
    this.fuente(!seguroEnFuenteEstandar(t), negrita);
    const partidas = this.doc.splitTextToSize(t, ancho) as string[];
    const visibles = partidas.slice(0, maximo);
    if (partidas.length > maximo) visibles[maximo - 1] = partidas.slice(maximo - 1).join(" ");
    visibles.forEach((linea, i) => this.texto(linea, x, y + i * interlinea, { negrita, ancho }));
  }

  /** Título con el filete degradado vertical a su izquierda; deja aire encima también al empezar página. */
  tituloSeccion(t: string): void {
    this.y += MEDIDAS.aireTitulo;
    this.degradado(MARGEN, this.y, 1.06, 3.7, true, 12);
    this.texto(t, MARGEN + 3.2, this.y + 2.9, { negrita: true, tamano: 11, color: COLORES.tinta });
    this.y += 6.6;
  }

  cabeceraTabla(columnas: readonly Columna[]): void {
    const alto = MEDIDAS.altoCabeceraTabla;
    this.rect(MARGEN, this.y, UTIL, alto, COLORES.tinta);
    this.doc.setFontSize(7.6);
    const titulos = columnas.map((c) => ({ texto: c.titulo }));
    this.celdas(columnas, titulos, this.y + 4.3, COLORES.blanco, true);
    this.y += alto;
  }

  private celdas(
    columnas: readonly Columna[],
    celdas: readonly Celda[],
    base: number,
    color: Color,
    negrita?: boolean,
  ): void {
    let x = MARGEN;
    for (let i = 0, j = 0; i < columnas.length; j++) {
      const celda = celdas[j];
      const tramo = columnas.slice(i, i + (celda?.abarca ?? 1));
      const ancho = tramo.reduce((suma, c) => suma + c.ancho, 0);
      const derecha = tramo[tramo.length - 1].derecha;
      if (celda !== undefined && celda.texto !== "") {
        this.texto(celda.texto, derecha ? x + ancho - SANGRIA_CELDA : x + SANGRIA_CELDA, base, {
          derecha,
          negrita: negrita || celda.negrita,
          color: celda.color ?? color,
          ancho: ancho - 2 * SANGRIA_CELDA,
        });
      }
      x += ancho;
      i += tramo.length;
    }
  }

  /** R5: la cabecera y las filas, con fondos alternos; una fila que no cabe salta de página y repite la cabecera. */
  tabla(columnas: readonly Columna[], filas: Iterable<Fila>, formato: FormatoFila): void {
    this.cabeceraTabla(columnas);
    let i = 0;
    for (const f of filas) this.fila(columnas, f, formato, i++);
  }

  /** Una fila de altura fija. */
  private fila(columnas: readonly Columna[], fila: Fila, formato: FormatoFila, indice: number): void {
    const { alto, letra } = formato;
    if (this.asegurar(alto)) this.cabeceraTabla(columnas);
    const fondo = fila.filete ? COLORES.fondoTarjeta : indice % 2 === 0 ? COLORES.fondoFila : COLORES.fondoFilaAlterna;
    this.rect(MARGEN, this.y, UTIL, alto, fondo);
    if (fila.filete) this.rect(MARGEN, this.y - 0.26, UTIL, 0.53, COLORES.violeta);
    this.doc.setFontSize(letra);
    this.celdas(columnas, fila.celdas, this.y + alto / 2 + letra * 0.12, COLORES.tinta, fila.negrita);
    this.y += alto;
    this.rect(MARGEN, this.y - 0.26, UTIL, 0.26, COLORES.linea);
  }

  /** La fila de total: negrita, fondo de tarjeta y filete violeta encima. */
  filaTotal(columnas: readonly Columna[], fila: Fila, formato: FormatoFila): void {
    this.fila(columnas, { ...fila, negrita: true, filete: true }, formato, 0);
  }

  /** Una fila de una sola celda a todo el ancho (una tabla vacía). */
  filaDeAviso(t: string, formato: FormatoFila): void {
    this.rect(MARGEN, this.y, UTIL, formato.alto, COLORES.fondoFila);
    this.texto(t, MARGEN + SANGRIA_CELDA, this.y + formato.alto / 2 + formato.letra * 0.12, {
      ancho: UTIL - 2 * SANGRIA_CELDA,
      tamano: formato.letra,
      color: COLORES.gris,
    });
    this.y += formato.alto;
    this.rect(MARGEN, this.y - 0.26, UTIL, 0.26, COLORES.linea);
  }

  /** La banda oscura del total a pagar. */
  bandaTotal(etiqueta: string, importe: string): void {
    this.asegurar(3.2 + MEDIDAS.altoBandaTotal);
    this.y += 3.2;
    this.rect(MARGEN, this.y, UTIL, MEDIDAS.altoBandaTotal, COLORES.noche, MEDIDAS.radioBandaTotal);
    this.texto(etiqueta, MARGEN + 4.2, this.y + 9, { tamano: 9, color: COLORES.rosa });
    const op = { derecha: true, negrita: true, tamano: 18, color: COLORES.blanco };
    this.texto(importe, ANCHO - MARGEN - 4.2, this.y + 10, op);
    this.y += MEDIDAS.altoBandaTotal + 1.8;
  }

  nota(t: string): void {
    this.estilo(8, COLORES.gris);
    this.fuente(!seguroEnFuenteEstandar(t));
    for (const linea of this.doc.splitTextToSize(t, UTIL) as string[]) {
      this.asegurar(4.2);
      this.texto(linea, MARGEN, this.y + 3.2);
      this.y += 4.2;
    }
  }

  /** R5: el pie de cada página, que se dibuja al final para conocer el total de páginas. */
  pies(textoIzquierda: string): void {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.estilo(7, COLORES.textoPie);
      this.texto(textoIzquierda, MARGEN, MEDIDAS.yPie, { ancho: UTIL - 30 });
      this.texto(T.pagina(i, total), ANCHO - MARGEN, MEDIDAS.yPie, { derecha: true });
    }
  }

  bytes(): ArrayBuffer {
    return this.doc.output("arraybuffer");
  }
}
