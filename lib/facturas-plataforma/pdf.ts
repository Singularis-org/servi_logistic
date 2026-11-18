// SLT-136 (design §4, R7–R14, R17) — el PDF de una factura cerrada de la plataforma: cabecera con marca, tarjetas,
// «Resumen», «Total a pagar» y, en página aparte, «Desglose por día». Se compone con los componentes de
// `pdf-comun.ts` (SLT-199), que comparte con el anexo.
//
// Función pura sobre jsPDF: recibe los datos, su resumen y el logo ya cargado (lo carga el componente) y devuelve
// los bytes.
import { estadoVisible } from "@/components/shared/facturas/facturas-vista";
import { money } from "@/lib/config/moneda";
import {
  COLORES,
  Lienzo,
  MEDIDAS,
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
  periodicidadVisible,
  periodoNumerico,
  planVisible,
  type ResumenDeFactura,
} from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura } from "@/lib/types/factura-plataforma";

export type { LogoDelPdf };

const UTIL = MEDIDAS.util;
const FILA_RESUMEN = { alto: 8, letra: 8.5 };
const FILA_DESGLOSE = { alto: 6.5, letra: 8.5 };

/** Un importe de la base, o de la suma exacta, con el formato de dinero de la app (R13). */
function importe(valor: string): Celda {
  const texto = money(valor);
  return { texto, color: texto.startsWith("-") ? COLORES.rojo : undefined };
}

const COLUMNAS_RESUMEN: readonly Columna[] = [
  { titulo: T.resumen.concepto, ancho: UTIL - 90 },
  { titulo: T.resumen.cantidad, ancho: 40, derecha: true },
  { titulo: T.resumen.importe, ancho: 50, derecha: true },
];

/** R9, R10: la tabla «Resumen», la franja «Total a pagar» y la nota de movimientos. */
function resumen(l: Lienzo, r: ResumenDeFactura): void {
  l.tituloSeccion(T.resumen.titulo);
  const rojo = COLORES.rojo;
  const filas: Fila[] = [
    { celdas: [{ texto: T.resumen.cargos }, { texto: cantidadVisible(r.cargos.cantidad) }, importe(r.cargos.importe)] },
    {
      celdas: [
        { texto: T.resumen.reversos, color: rojo },
        { texto: cantidadVisible(r.reversos.cantidad), color: rojo },
        { texto: money(r.reversos.importe), color: rojo },
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
  l.tabla(COLUMNAS_RESUMEN, filas, FILA_RESUMEN);
  l.bandaTotal(T.totalAPagar.toLocaleUpperCase("es"), money(r.total));
  l.nota(T.notaMovimientos(cantidadVisible(r.movimientos)));
}

const COLUMNAS_DESGLOSE: readonly Columna[] = [
  { titulo: T.desglose.dia, ancho: UTIL - 150 },
  { titulo: T.desglose.cargos, ancho: 32, derecha: true },
  { titulo: T.desglose.reversos, ancho: 32, derecha: true },
  { titulo: T.desglose.netas, ancho: 40, derecha: true },
  { titulo: T.desglose.importe, ancho: 46, derecha: true },
];

function* filasDelDesglose(r: ResumenDeFactura): Generator<Fila> {
  for (const d of r.dias) {
    yield {
      celdas: [
        { texto: diaNumerico(d.dia) },
        { texto: cantidadVisible(d.cargos) },
        { texto: cantidadVisible(d.reversos) },
        { texto: cantidadVisible(d.netas), color: d.netas < 0 ? COLORES.rojo : undefined },
        importe(d.importe),
      ],
    };
  }
}

/** R11, R12, R17: el desglose en página nueva, con su fila «Total» y la nota del Excel. */
function desglose(l: Lienzo, r: ResumenDeFactura): void {
  l.nuevaPagina();
  l.tituloSeccion(T.desglose.titulo);
  l.tabla(COLUMNAS_DESGLOSE, filasDelDesglose(r), FILA_DESGLOSE);
  if (r.dias.length === 0) l.filaDeAviso(T.desglose.vacio, FILA_DESGLOSE);
  const total: Celda[] = [
    { texto: T.desglose.total },
    { texto: cantidadVisible(r.cargos.cantidad) },
    { texto: cantidadVisible(r.reversos.cantidad) },
    { texto: cantidadVisible(r.totalOrdenes.cantidad) },
    importe(r.totalOrdenes.importe),
  ];
  l.filaTotal(COLUMNAS_DESGLOSE, { celdas: total }, FILA_DESGLOSE);
  l.y += 3;
  l.nota(T.desglose.nota);
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
    3,
  );
  resumen(l, resumenDeFactura);
  desglose(l, resumenDeFactura);
  l.pies(T.pie(numero, empresaNombre));
  return l.bytes();
}
