// SLT-136 (design §4, R7–R14, R17) — el PDF de una factura cerrada de la plataforma, según la plantilla de
// referencia en `docs/referencias/`: cabecera con marca, seis tarjetas, «Resumen», «Total a
// pagar» y, en página aparte, «Desglose por día».
//
// Función pura sobre jsPDF: recibe los datos, su resumen y el logo ya cargado (lo carga el componente) y devuelve
// los bytes. A4 vertical con la fuente embebida (`fuenteEtiqueta`), la única que trae el `₡`; todo texto pasa por
// `imprimible` (R13). La fuente es de un solo peso: la «negrita» es el mismo glifo relleno y con trazo.
//
// Altura de fila FIJA: así la paginación es exacta y una tabla partida repite su cabecera sin perder ni duplicar
// filas (R12), como el informe de tránsito.
import { jsPDF } from "jspdf";

import { estadoVisible } from "@/components/shared/facturas/facturas-vista";
import { MARCA_FACTURA } from "@/lib/config/marca";
import { money } from "@/lib/config/moneda";
import {
  FACTURA_DESCARGA_TEXTOS as T,
  cantidadVisible,
  diaNumerico,
  fechaNumerica,
  periodicidadVisible,
  periodoNumerico,
  planVisible,
  type ResumenDeFactura,
} from "@/lib/facturas-plataforma/resumen";
import { fuenteEtiqueta } from "@/lib/pdf/etiquetas-fuente";
import { registrarFuente } from "@/lib/pdf/etiquetas-fuente-registro";
import { imprimible } from "@/lib/pdf/imprimible";
import type { DatosDescargaFactura } from "@/lib/types/factura-plataforma";

/** Los bytes del PNG del logo configurado (`MARCA_FACTURA.logo`), o `null` si no se pudo cargar (R14). */
export type LogoDelPdf = Uint8Array;

type Color = readonly [number, number, number];

const ANCHO = 210;
const ALTO = 297;
const MARGEN = 14;
const UTIL = ANCHO - 2 * MARGEN;
/** Última coordenada en la que puede acabar contenido: el pie vive debajo. */
const LIMITE = ALTO - 20;
const ALTO_BANDA = 38;
const ALTO_FILA_RESUMEN = 8;
const ALTO_FILA_DESGLOSE = 6.5;
const ALTO_CABECERA_TABLA = 7;

// Los colores de la plantilla de referencia.
const TINTA: Color = [30, 27, 75];
const NOCHE: Color = [20, 18, 48];
const GRIS: Color = [109, 106, 138];
const VIOLETA: Color = [124, 58, 237];
const ROJO: Color = [190, 24, 93];
const FONDO: Color = [245, 243, 255];
const FONDO_ALTERNO: Color = [251, 250, 255];
const LINEA: Color = [232, 230, 245];
const BLANCO: Color = [255, 255, 255];
const ROSA: Color = [245, 208, 254];

interface Columna {
  titulo: string;
  ancho: number;
  derecha?: boolean;
}

interface Celda {
  texto: string;
  color?: Color;
}

interface Fila {
  celdas: Celda[];
  negrita?: boolean;
  /** Un filete de color encima de la fila (el total). */
  filete?: boolean;
}

class Lienzo {
  readonly doc: jsPDF;
  y = MARGEN;

  constructor() {
    this.doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    registrarFuente(this.doc, fuenteEtiqueta);
    this.doc.setFont(fuenteEtiqueta.nombre, fuenteEtiqueta.estilo);
  }

  estilo(pt: number, color: Color = TINTA): void {
    this.doc.setFont(fuenteEtiqueta.nombre, fuenteEtiqueta.estilo);
    this.doc.setFontSize(pt);
    this.doc.setTextColor(color[0], color[1], color[2]);
    this.doc.setDrawColor(color[0], color[1], color[2]);
  }

  /** Recorta a una línea con «…» para que la altura de fila sea fija. */
  recortado(t: string, ancho: number): string {
    const limpio = imprimible(t);
    if (this.doc.getTextWidth(limpio) <= ancho) return limpio;
    let corte = limpio;
    while (corte.length > 1 && this.doc.getTextWidth(`${corte}…`) > ancho) corte = corte.slice(0, -1);
    return `${corte}…`;
  }

  /** Escribe `t` (ya imprimible o no) en una línea; con `ancho`, recortado a él. */
  texto(t: string, x: number, y: number, op: { derecha?: boolean; negrita?: boolean; ancho?: number } = {}): void {
    const linea = op.ancho === undefined ? imprimible(t) : this.recortado(t, op.ancho);
    if (op.negrita) this.doc.setLineWidth(0.18);
    this.doc.text(linea, x, y, {
      ...(op.derecha ? { align: "right" as const } : {}),
      ...(op.negrita ? { renderingMode: "fillThenStroke" as const } : {}),
    });
  }

  rect(x: number, y: number, w: number, h: number, color: Color, radio = 0): void {
    this.doc.setFillColor(color[0], color[1], color[2]);
    if (radio > 0) this.doc.roundedRect(x, y, w, h, radio, radio, "F");
    else this.doc.rect(x, y, w, h, "F");
  }

  nuevaPagina(): void {
    this.doc.addPage("a4", "portrait");
    this.y = MARGEN;
  }

  /** Salta de página si `alto` no cabe. Devuelve `true` si saltó. */
  asegurar(alto: number): boolean {
    if (this.y + alto <= LIMITE) return false;
    this.nuevaPagina();
    return true;
  }

  cabeceraTabla(columnas: readonly Columna[]): void {
    this.rect(MARGEN, this.y, UTIL, ALTO_CABECERA_TABLA, TINTA);
    this.estilo(7.5, BLANCO);
    let x = MARGEN;
    for (const c of columnas) {
      this.texto(c.titulo, c.derecha ? x + c.ancho - 3 : x + 3, this.y + 4.7, { derecha: c.derecha });
      x += c.ancho;
    }
    this.y += ALTO_CABECERA_TABLA;
  }

  /** Una fila de altura fija: si no cabe, salta de página y repite la cabecera de la tabla (R12). */
  fila(columnas: readonly Columna[], fila: Fila, alto: number, indice: number): void {
    if (this.asegurar(alto)) this.cabeceraTabla(columnas);
    this.rect(MARGEN, this.y, UTIL, alto, indice % 2 === 0 ? FONDO_ALTERNO : FONDO);
    if (fila.filete) this.rect(MARGEN, this.y - 0.3, UTIL, 0.6, VIOLETA);
    const base = this.y + alto / 2 + 1.2;
    let x = MARGEN;
    columnas.forEach((c, i) => {
      const celda = fila.celdas[i];
      if (celda !== undefined && celda.texto !== "") {
        this.estilo(8.5, celda.color ?? TINTA);
        this.texto(celda.texto, c.derecha ? x + c.ancho - 3 : x + 3, base, {
          derecha: c.derecha,
          negrita: fila.negrita,
          ancho: c.ancho - 6,
        });
      }
      x += c.ancho;
    });
    this.y += alto;
    this.rect(MARGEN, this.y - 0.2, UTIL, 0.2, LINEA);
  }

  /** Una fila de una sola celda a todo el ancho (el desglose vacío, R17). */
  filaDeAviso(t: string, alto: number): void {
    this.rect(MARGEN, this.y, UTIL, alto, FONDO_ALTERNO);
    this.estilo(8.5, GRIS);
    this.texto(t, MARGEN + 3, this.y + alto / 2 + 1.2, { ancho: UTIL - 6 });
    this.y += alto;
    this.rect(MARGEN, this.y - 0.2, UTIL, 0.2, LINEA);
  }

  /** Un párrafo de hasta `maximo` líneas al ancho dado; la última se recorta con «…» si no cabe. */
  lineas(t: string, x: number, y: number, ancho: number, maximo: number, interlinea: number, negrita = false): void {
    const partidas = this.doc.splitTextToSize(imprimible(t), ancho) as string[];
    const visibles = partidas.slice(0, maximo);
    if (partidas.length > maximo) visibles[maximo - 1] = partidas.slice(maximo - 1).join(" ");
    visibles.forEach((linea, i) => this.texto(linea, x, y + i * interlinea, { negrita, ancho }));
  }

  titulo(t: string): void {
    this.estilo(12);
    this.texto(t, MARGEN, this.y + 5, { negrita: true });
    this.y += 9;
  }

  nota(t: string): void {
    this.estilo(7.5, GRIS);
    for (const linea of this.doc.splitTextToSize(imprimible(t), UTIL) as string[]) {
      this.asegurar(4);
      this.doc.text(linea, MARGEN, this.y + 3);
      this.y += 4;
    }
  }
}

/** Un importe de la base, o de la suma exacta, con el formato de dinero de la app (R13). */
function importe(valor: string): Celda {
  const texto = money(valor);
  return { texto, color: texto.startsWith("-") ? ROJO : undefined };
}

/** R7, R14: banda oscura con el logo (o «Singularis» en texto) y, a la derecha, el título, el número y el cliente. */
function cabecera(l: Lienzo, datos: DatosDescargaFactura, numero: number, logo: LogoDelPdf | null): void {
  l.rect(0, 0, ANCHO, ALTO_BANDA, NOCHE);
  if (!dibujarLogo(l, logo)) {
    l.estilo(18, BLANCO);
    l.texto(T.emisor, MARGEN, 22, { negrita: true });
  }
  const derecha = ANCHO - MARGEN;
  l.estilo(8, ROSA);
  l.texto(T.titulo, derecha, 13, { derecha: true });
  l.estilo(18, BLANCO);
  l.texto(T.numero(numero), derecha, 23, { derecha: true, negrita: true });
  l.estilo(9, BLANCO);
  l.texto(T.cliente(datos.empresaNombre), derecha, 30, { derecha: true, ancho: UTIL - 60 });
  l.rect(0, ALTO_BANDA, ANCHO, 1.2, VIOLETA);
  l.y = ALTO_BANDA + 9;
}

/** R14: el logo configurado; `false` si no lo hay o jsPDF no lo puede pintar. */
function dibujarLogo(l: Lienzo, logo: LogoDelPdf | null): boolean {
  if (logo === null) return false;
  const ancho = 48;
  const alto = (ancho * MARCA_FACTURA.logo.alto) / MARCA_FACTURA.logo.ancho;
  try {
    l.doc.addImage(logo, "PNG", MARGEN, (ALTO_BANDA - alto) / 2, ancho, alto);
    return true;
  } catch {
    // Un PNG que jsPDF no entiende cuenta como un logo que no se pudo cargar: va el nombre en texto (R14).
    return false;
  }
}

/** R8: rejilla de 2 × 3 tarjetas, etiqueta en versalitas y valor en negrita. */
function tarjetas(l: Lienzo, datos: DatosDescargaFactura): void {
  const { factura } = datos;
  const valores: [string, string][] = [
    [T.tarjetas.cliente, datos.empresaNombre],
    [T.tarjetas.estado, estadoVisible(factura)],
    [T.tarjetas.periodo, periodoNumerico(factura.desde, factura.hasta)],
    [T.tarjetas.emision, fechaNumerica(factura.hasta)],
    [T.tarjetas.periodicidad, periodicidadVisible(datos)],
    [T.tarjetas.plan, planVisible(datos)],
  ];
  const separacion = 4;
  const ancho = (UTIL - separacion * 2) / 3;
  const alto = 18;
  valores.forEach(([etiqueta, valor], i) => {
    const x = MARGEN + (i % 3) * (ancho + separacion);
    const y = l.y + Math.floor(i / 3) * (alto + separacion);
    l.rect(x, y, ancho, alto, FONDO, 2);
    l.estilo(6.5, GRIS);
    l.texto(etiqueta.toLocaleUpperCase("es"), x + 4, y + 5.5);
    l.estilo(9);
    l.lineas(valor, x + 4, y + 10.5, ancho - 8, 2, 4, true);
  });
  l.y += alto * 2 + separacion + 10;
}

const COLUMNAS_RESUMEN: readonly Columna[] = [
  { titulo: T.resumen.concepto, ancho: UTIL - 90 },
  { titulo: T.resumen.cantidad, ancho: 40, derecha: true },
  { titulo: T.resumen.importe, ancho: 50, derecha: true },
];

/** R9, R10: la tabla «Resumen», la franja «Total a pagar» y la nota de movimientos. */
function resumen(l: Lienzo, r: ResumenDeFactura): void {
  l.titulo(T.resumen.titulo);
  l.cabeceraTabla(COLUMNAS_RESUMEN);
  const filas: Fila[] = [
    { celdas: [{ texto: T.resumen.cargos }, { texto: cantidadVisible(r.cargos.cantidad) }, importe(r.cargos.importe)] },
    {
      celdas: [
        { texto: T.resumen.reversos, color: ROJO },
        { texto: cantidadVisible(r.reversos.cantidad), color: ROJO },
        { texto: money(r.reversos.importe), color: ROJO },
      ],
    },
    {
      celdas: [
        { texto: T.resumen.totalOrdenes },
        { texto: cantidadVisible(r.totalOrdenes.cantidad) },
        importe(r.totalOrdenes.importe),
      ],
      negrita: true,
      filete: true,
    },
    { celdas: [{ texto: T.resumen.cuota }, { texto: T.resumen.sinCantidad }, importe(r.cuota)] },
  ];
  filas.forEach((f, i) => l.fila(COLUMNAS_RESUMEN, f, ALTO_FILA_RESUMEN, i));

  l.y += 6;
  l.rect(MARGEN, l.y, UTIL, 15, NOCHE, 2);
  l.estilo(9, ROSA);
  l.texto(T.totalAPagar.toLocaleUpperCase("es"), MARGEN + 5, l.y + 9.3);
  l.estilo(16, BLANCO);
  l.texto(money(r.total), ANCHO - MARGEN - 5, l.y + 10, { derecha: true, negrita: true });
  l.y += 19;
  l.nota(T.notaMovimientos(cantidadVisible(r.movimientos)));
}

const COLUMNAS_DESGLOSE: readonly Columna[] = [
  { titulo: T.desglose.dia, ancho: UTIL - 150 },
  { titulo: T.desglose.cargos, ancho: 32, derecha: true },
  { titulo: T.desglose.reversos, ancho: 32, derecha: true },
  { titulo: T.desglose.netas, ancho: 40, derecha: true },
  { titulo: T.desglose.importe, ancho: 46, derecha: true },
];

/** R11, R12, R17: el desglose en página nueva, con su fila «Total» y la nota del Excel. */
function desglose(l: Lienzo, r: ResumenDeFactura): void {
  l.nuevaPagina();
  l.titulo(T.desglose.titulo);
  l.cabeceraTabla(COLUMNAS_DESGLOSE);
  if (r.dias.length === 0) {
    l.filaDeAviso(T.desglose.vacio, ALTO_FILA_DESGLOSE);
  }
  r.dias.forEach((d, i) => {
    const negativa = d.netas < 0 ? ROJO : undefined;
    l.fila(
      COLUMNAS_DESGLOSE,
      {
        celdas: [
          { texto: diaNumerico(d.dia) },
          { texto: cantidadVisible(d.cargos) },
          { texto: cantidadVisible(d.reversos) },
          { texto: cantidadVisible(d.netas), color: negativa },
          importe(d.importe),
        ],
      },
      ALTO_FILA_DESGLOSE,
      i,
    );
  });
  l.fila(
    COLUMNAS_DESGLOSE,
    {
      celdas: [
        { texto: T.desglose.total },
        { texto: cantidadVisible(r.cargos.cantidad) },
        { texto: cantidadVisible(r.reversos.cantidad) },
        { texto: cantidadVisible(r.totalOrdenes.cantidad) },
        importe(r.totalOrdenes.importe),
      ],
      negrita: true,
      filete: true,
    },
    ALTO_FILA_DESGLOSE,
    1,
  );
  l.y += 3;
  l.nota(T.desglose.nota);
}

/** R12: el pie de cada página, que se dibuja al final para conocer el total de páginas. */
function pies(l: Lienzo, datos: DatosDescargaFactura, numero: number): void {
  const total = l.doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    l.doc.setPage(i);
    l.rect(MARGEN, ALTO - 13, UTIL, 0.2, LINEA);
    l.estilo(7, GRIS);
    l.texto(T.pie(numero, datos.empresaNombre), MARGEN, ALTO - 8, { ancho: UTIL - 30 });
    l.texto(T.pagina(i, total), ANCHO - MARGEN, ALTO - 8, { derecha: true });
  }
}

/**
 * R7–R14, R17: el PDF de una factura cerrada. `resumen` sale de `resumirFactura(datos)`, que ya comprobó el
 * cuadre (R15). Lanza si la factura no tiene número: solo se descargan las cerradas (R4).
 */
export function construirPdfFactura(
  datos: DatosDescargaFactura,
  resumenDeFactura: ResumenDeFactura,
  logo: LogoDelPdf | null,
): ArrayBuffer {
  const numero = datos.factura.numero;
  if (numero === null) throw new Error("construirPdfFactura: la factura no está cerrada (no tiene número)");
  const l = new Lienzo();
  cabecera(l, datos, numero, logo);
  tarjetas(l, datos);
  resumen(l, resumenDeFactura);
  desglose(l, resumenDeFactura);
  pies(l, datos, numero);
  return l.doc.output("arraybuffer");
}
