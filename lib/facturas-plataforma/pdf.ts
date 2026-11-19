// SLT-199 (design §4; R8–R14, R26) — el PDF de una factura cerrada de la plataforma con el diseño de
// `docs/referencias/Factura-1-Ordenex.pdf`: cabecera con barra degradada, seis tarjetas, «Resumen» con tarifa,
// banda «TOTAL A PAGAR» con su nota y, en página aparte, «Desglose por día». Se compone con los componentes de
// `pdf-comun.ts`, que comparte con el anexo (R1).
//
// Función pura sobre jsPDF: recibe los datos, su resumen y el logo ya cargado (lo carga el componente) y devuelve
// los bytes. Los importes y los conteos son los de `resumirFactura` (R14); aquí solo cambia cómo se pintan.
import { estadoVisible } from "@/components/shared/facturas/facturas-vista";
import {
  COLORES,
  Lienzo,
  MEDIDAS,
  celdaImporte,
  type Celda,
  type Columna,
  type Fila,
  type LogoDelPdf,
} from "@/lib/facturas-plataforma/pdf-comun";
import {
  FACTURA_DESCARGA_TEXTOS as T,
  cantidadVisible,
  diaNumerico,
  fechaNumerica,
  importeDocumento,
  periodicidadVisible,
  periodoNumerico,
  planVisible,
  tarifaDeLaFactura,
  type ResumenDeFactura,
  type TarifaDeLaFactura,
} from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura } from "@/lib/types/factura-plataforma";

export type { LogoDelPdf };

const FILA = MEDIDAS.filaAmplia;

/** Anchos de la referencia (282 · 110 · 129 · 190 px) llevados al ancho útil del A4. */
const COLUMNAS_RESUMEN: readonly Columna[] = [
  { titulo: T.resumen.concepto, ancho: 72.2 },
  { titulo: T.resumen.cantidad, ancho: 28.2, derecha: true },
  { titulo: T.resumen.tarifa, ancho: 33, derecha: true },
  { titulo: T.resumen.importe, ancho: MEDIDAS.util - 133.4, derecha: true },
];

/** R10, R26: la celda de tarifa. */
function celdaTarifa(t: TarifaDeLaFactura): string {
  if (t.tipo === "unica") return importeDocumento(t.importe);
  return t.tipo === "varias" ? T.tarifa.varias : T.tarifa.sin;
}

/** R10, R11: la tabla «Resumen», la banda «TOTAL A PAGAR» y la nota. */
function resumen(l: Lienzo, r: ResumenDeFactura, tarifa: TarifaDeLaFactura): void {
  l.tituloSeccion(T.resumen.titulo);
  const precio = { texto: celdaTarifa(tarifa) };
  const filas: Fila[] = [
    {
      celdas: [
        { texto: T.resumen.cargos },
        { texto: cantidadVisible(r.cargos.cantidad) },
        precio,
        celdaImporte(r.cargos.importe),
      ],
    },
    {
      celdas: [
        { texto: T.resumen.reversos },
        { texto: cantidadVisible(r.reversos.cantidad) },
        precio,
        { texto: importeDocumento(r.reversos.importe), color: COLORES.rojo },
      ],
    },
    {
      celdas: [
        { texto: T.resumen.totalOrdenes },
        { texto: cantidadVisible(r.totalOrdenes.cantidad) },
        { texto: "" },
        celdaImporte(r.totalOrdenes.importe),
      ],
      negrita: true,
      filete: true,
    },
    {
      celdas: [
        { texto: T.resumen.cuota },
        { texto: T.resumen.sinCantidad },
        { texto: T.resumen.sinCantidad },
        celdaImporte(r.cuota),
      ],
    },
  ];
  l.tabla(COLUMNAS_RESUMEN, filas, FILA);
  l.bandaTotal(T.totalAPagar.toLocaleUpperCase("es"), importeDocumento(r.total));
  const notaTarifa =
    tarifa.tipo === "unica"
      ? T.notaTarifa.unica(importeDocumento(tarifa.importe))
      : tarifa.tipo === "varias"
        ? T.notaTarifa.varias
        : null;
  l.nota([T.notaMovimientos(cantidadVisible(r.movimientos)), notaTarifa, T.notaMoneda].filter(Boolean).join(" "));
}

/** Anchos de la referencia (169 · 91 · 107 · 155 · 189 px) llevados al ancho útil del A4. */
const COLUMNAS_DESGLOSE: readonly Columna[] = [
  { titulo: T.desglose.dia, ancho: 43.3 },
  { titulo: T.desglose.cargos, ancho: 23.3, derecha: true },
  { titulo: T.desglose.reversos, ancho: 27.4, derecha: true },
  { titulo: T.desglose.netas, ancho: 39.7, derecha: true },
  { titulo: T.desglose.importe, ancho: MEDIDAS.util - 133.7, derecha: true },
];

function* filasDelDesglose(r: ResumenDeFactura): Generator<Fila> {
  for (const d of r.dias) {
    yield {
      celdas: [
        { texto: diaNumerico(d.dia) },
        { texto: cantidadVisible(d.cargos) },
        { texto: cantidadVisible(d.reversos) },
        { texto: cantidadVisible(d.netas) },
        celdaImporte(d.importe),
      ],
    };
  }
}

/** R12: el desglose en página nueva, con su fila «Total» y la nota que remite al anexo. */
function desglose(l: Lienzo, r: ResumenDeFactura, numero: number, empresa: string): void {
  l.nuevaPagina();
  l.tituloSeccion(T.desglose.titulo);
  l.tabla(COLUMNAS_DESGLOSE, filasDelDesglose(r), FILA);
  if (r.dias.length === 0) l.filaDeAviso(T.desglose.vacio, FILA);
  const total: Celda[] = [
    { texto: T.desglose.total },
    { texto: cantidadVisible(r.cargos.cantidad) },
    { texto: cantidadVisible(r.reversos.cantidad) },
    { texto: cantidadVisible(r.totalOrdenes.cantidad) },
    celdaImporte(r.totalOrdenes.importe),
  ];
  l.filaTotal(COLUMNAS_DESGLOSE, { celdas: total }, FILA);
  l.y += 3;
  l.nota(T.desglose.notaAnexo(cantidadVisible(r.movimientos), numero, empresa));
}

/**
 * R8–R14: el PDF de una factura cerrada. `resumen` sale de `resumirFactura(datos)`, que ya comprobó el cuadre
 * (R7). Lanza si la factura no tiene número: solo se descargan las cerradas.
 */
export function construirPdfFactura(
  datos: DatosDescargaFactura,
  resumenDeFactura: ResumenDeFactura,
  logo: LogoDelPdf | null,
): ArrayBuffer {
  const { factura, empresaNombre } = datos;
  const numero = factura.numero;
  if (numero === null) throw new Error("construirPdfFactura: la factura no está cerrada (no tiene número)");
  const l = new Lienzo();
  l.cabecera({ logo, antetitulo: T.titulo, titulo: T.numero(numero), cliente: T.cliente(empresaNombre) });
  l.tarjetas(
    [
      [T.tarjetas.cliente, empresaNombre],
      [T.tarjetas.estado, estadoVisible(factura)],
      [T.tarjetas.periodo, periodoNumerico(factura.desde, factura.hasta)],
      [T.tarjetas.emision, fechaNumerica(factura.hasta)],
      [T.tarjetas.periodicidad, periodicidadVisible(datos)],
      [T.tarjetas.plan, planVisible(datos)],
    ],
    2,
  );
  resumen(l, resumenDeFactura, tarifaDeLaFactura(datos));
  desglose(l, resumenDeFactura, numero, empresaNombre);
  l.pies(T.pie(numero, empresaNombre));
  return l.bytes();
}
