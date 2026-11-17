// SLT-136 (design §5, R16, R17) — el Excel de una factura cerrada: una hoja «Movimientos» con una fila por cargo o
// reverso, en el orden de la lectura (R1). El valor va como número exacto con `#,##0.00` (`formato: "monto"`), sin
// redondear: lo convierte y lo comprueba `celdaMonto`. exceljs entra con `import()` dinámico dentro de
// `buildXlsxLibro`.
import { FACTURA_DESCARGA_TEXTOS, fechaNumerica } from "@/lib/facturas-plataforma/resumen";
import type { DatosDescargaFactura } from "@/lib/types/factura-plataforma";
import { horaDePared } from "@/lib/utils/calendario-zona";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { comprobarLimiteExcel } from "@/lib/utils/limite-excel";
import { buildXlsxLibro, type XlsxCellValue, type XlsxColumn } from "@/lib/utils/xlsx-template";

const T = FACTURA_DESCARGA_TEXTOS.excel;

const COLUMNAS: XlsxColumn[] = [
  { key: "fecha", header: T.fecha },
  { key: "guia", header: T.guia },
  { key: "remision", header: T.remision },
  { key: "tipo", header: T.tipo },
  { key: "valor", header: T.valor, formato: "monto" },
];

/**
 * R16, R17: el `.xlsx` de la factura. Sin movimientos, solo la fila de cabeceras. Lanza
 * `LimiteExcelExcedidoError` si la hoja pasa del límite de filas de Excel.
 */
export async function construirExcelFactura(datos: DatosDescargaFactura): Promise<ArrayBuffer> {
  const filas: Array<Record<string, XlsxCellValue>> = datos.movimientos.map((m) => ({
    fecha: `${fechaNumerica(m.instante)} ${horaDePared(m.instante, ZONA_CR)}`,
    guia: m.numGuia,
    remision: m.numRemision,
    tipo: T.tipos[m.tipo],
    valor: m.valor,
  }));
  comprobarLimiteExcel([{ titulo: T.hoja, filas }]);
  return buildXlsxLibro([{ nombre: T.hoja, columns: COLUMNAS, rows: filas }]);
}
