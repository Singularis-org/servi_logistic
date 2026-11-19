// SLT-199 (design §6; R15–R21) — el anexo de movimientos de una factura cerrada, con el diseño de
// `docs/referencias/Factura-1-Ordenex-Detalle.pdf`: cabecera solo en la primera página, cuatro tarjetas, la línea
// del período y la tarifa, y la tabla «Movimientos» con su total neto. Se compone con `pdf-comun.ts` (R1).
//
// Función pura sobre jsPDF, como la factura: los mismos datos y el mismo resumen (R15), sin otra lectura.
import {
  COLORES,
  Lienzo,
  MEDIDAS,
  celdaImporte,
  type Columna,
  type Fila,
  type LogoDelPdf,
} from "@/lib/facturas-plataforma/pdf-comun";
import {
  FACTURA_DESCARGA_TEXTOS as T,
  cantidadVisible,
  fechaNumerica,
  importeDocumento,
  periodoNumerico,
  tarifaDeLaFactura,
  type ResumenDeFactura,
} from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura, MovimientoDeFactura } from "@/lib/types/factura-plataforma";

const A = T.anexo;
const FILA = MEDIDAS.filaCompacta;

/** Anchos de la referencia (65 · 115 · 92 · 107 · 204 · 128 px) llevados al ancho útil del A4. */
const COLUMNAS: readonly Columna[] = [
  { titulo: A.columnas.numero, ancho: 16.6 },
  { titulo: A.columnas.fecha, ancho: 29.4 },
  { titulo: A.columnas.tipo, ancho: 23.6 },
  { titulo: A.columnas.guia, ancho: 27.4 },
  { titulo: A.columnas.remision, ancho: 52.2 },
  { titulo: A.columnas.importe, ancho: MEDIDAS.util - 149.2, derecha: true },
];

/** R18: una fila por movimiento, sobre la marcha (no se copia el arreglo). «#» es el ordinal, sin agrupar. */
function* filas(movimientos: readonly MovimientoDeFactura[]): Generator<Fila> {
  let n = 0;
  for (const m of movimientos) {
    const tipo =
      m.tipo === "reverso"
        ? { texto: A.tipos.reverso, color: COLORES.rojo, negrita: true }
        : { texto: A.tipos.cargo, color: COLORES.verdeAzulado };
    yield {
      celdas: [
        { texto: String(++n) },
        { texto: fechaNumerica(m.instante) },
        tipo,
        { texto: m.numGuia === null ? A.sinGuia : String(m.numGuia) },
        { texto: m.numRemision },
        celdaImporte(m.valor),
      ],
    };
  }
}

/** R17, R26: «Periodo facturado: … .» y la tarifa. */
function lineaDelPeriodo(datos: DatosDescargaFactura): string {
  const tarifa = tarifaDeLaFactura(datos);
  const texto =
    tarifa.tipo === "unica" ? A.tarifa.unica(importeDocumento(tarifa.importe)) : A.tarifa[tarifa.tipo];
  return `${A.periodo(periodoNumerico(datos.factura.desde, datos.factura.hasta))} ${texto}`;
}

/**
 * R15–R21: el PDF del anexo. `resumen` sale de `resumirFactura(datos)`, que ya comprobó el cuadre (R7). Lanza si la
 * factura no tiene número: solo se descargan las cerradas.
 */
export function construirPdfAnexo(
  datos: DatosDescargaFactura,
  resumen: ResumenDeFactura,
  logo: LogoDelPdf | null,
): ArrayBuffer {
  const numero = datos.factura.numero;
  if (numero === null) throw new Error("construirPdfAnexo: la factura no está cerrada (no tiene número)");
  const l = new Lienzo();
  l.cabecera({ logo, antetitulo: A.antetitulo(numero), titulo: A.titulo, cliente: T.cliente(datos.empresaNombre) });
  const conteo = (cantidad: number, importe: string) =>
    A.conteoEImporte(cantidadVisible(cantidad), importeDocumento(importe));
  l.tarjetas(
    [
      [A.tarjetas.movimientos, cantidadVisible(resumen.movimientos)],
      [A.tarjetas.cargos, conteo(resumen.cargos.cantidad, resumen.cargos.importe)],
      [A.tarjetas.reversos, conteo(resumen.reversos.cantidad, resumen.reversos.importe)],
      [A.tarjetas.totalNeto, importeDocumento(resumen.totalOrdenes.importe)],
    ],
    4,
  );
  l.y += MEDIDAS.separacionTarjetas;
  l.nota(lineaDelPeriodo(datos));
  l.tituloSeccion(A.seccion);
  l.tabla(COLUMNAS, filas(datos.movimientos), FILA);
  if (datos.movimientos.length === 0) l.filaDeAviso(A.vacio, FILA);
  const etiqueta = { texto: A.totalNeto(cantidadVisible(resumen.movimientos)), abarca: COLUMNAS.length - 1 };
  l.filaTotal(COLUMNAS, { celdas: [etiqueta, celdaImporte(resumen.totalOrdenes.importe)] }, FILA);
  l.pies(A.pie);
  return l.bytes();
}
