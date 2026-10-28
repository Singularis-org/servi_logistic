// Feature 15 — Parseo de archivos CSV/XLSX de carga masiva (R13-R16).
// Borde tipado: sin `any` cruzando la frontera (docs/architecture.md, "borde
// tipado"). Usa exceljs (decision humana 2026-07-10) para cubrir ambos formatos
// con una sola dependencia.
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { ValidationError, MSG } from "@/lib/errors";

/** Extensiones de archivo soportadas por el parser (R13). */
export type SpreadsheetExt = "csv" | "xlsx";

/** Una fila normalizada: clave = header normalizado (lowercase+trim, R16). */
export type RawRow = Record<string, string>;

export interface ParsedSpreadsheet {
  /** Cabeceras detectadas, normalizadas (lowercase+trim, R16). */
  headers: string[];
  /** Filas de datos (excluye la cabecera); filas completamente vacias se descartan. */
  rows: RawRow[];
  /**
   * SL-20 — el numero de registro de origen de cada fila de `rows` (mismo indice; la cabecera es
   * el 1). Existe porque las filas vacias se descartan: sin el, el indice de `rows` ya no dice en
   * que linea del archivo estaba la fila, y la carga de la division tiene que citar la linea de cada
   * error (R25). En un CSV es la linea del archivo mientras ningun valor lleve un salto de linea
   * entre comillas; con uno, cuenta registros y no lineas fisicas.
   */
  numerosDeFila: number[];
}

/** Opciones de lectura. Sin ellas el comportamiento es el de siempre (la carga masiva de ordenes). */
export interface OpcionesParseo {
  /**
   * SL-20 — lee el CSV TAL CUAL, sin que exceljs convierta tipos. Por defecto exceljs pasa cada
   * valor CSV por `Number()` y por un detector de fechas, asi que el codigo oficial `"01"` llega
   * como `1` y pierde el cero que lo distingue. No afecta a XLSX: alli el tipo lo guarda el propio
   * archivo, no lo adivina el lector.
   */
  textoLiteral?: boolean;
}

const SUPPORTED_EXTENSIONS = new Set<SpreadsheetExt>(["csv", "xlsx"]);

function isSupportedExt(ext: string): ext is SpreadsheetExt {
  return SUPPORTED_EXTENSIONS.has(ext as SpreadsheetExt);
}

/** R13: rechaza cualquier extension que no sea csv/xlsx antes de intentar parsear. */
function assertSupportedExt(ext: string): asserts ext is SpreadsheetExt {
  if (!isSupportedExt(ext)) {
    throw new ValidationError(MSG.VALIDATION_ERROR, {
      fieldErrors: { file: ["tipo de archivo no soportado; use .csv o .xlsx"] },
    });
  }
}

/**
 * Convierte el valor crudo de una celda de exceljs a texto plano, resolviendo
 * los casos especiales (rich text, hipervinculo, formula) sin recurrir a `any`.
 */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("richText" in value) {
      return value.richText.map((t) => t.text).join("");
    }
    if ("text" in value && "hyperlink" in value) {
      return value.text;
    }
    if ("formula" in value) {
      const result = value.result;
      if (result === undefined || result === null) return "";
      if (typeof result === "object") return ""; // CellErrorValue: sin valor util
      return cellToString(result);
    }
    if ("error" in value) return "";
  }
  return "";
}

/** CUANDO el archivo sea CSV (R14): parsea respetando comillas/saltos internos. */
async function readCsvWorksheet(buffer: Buffer, textoLiteral: boolean): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  const stream = Readable.from(buffer);
  if (!textoLiteral) return workbook.csv.read(stream);
  // fast-csv entrega cada valor como string; la identidad evita el `map` por defecto de exceljs,
  // que es el que convierte a numero y a fecha.
  return workbook.csv.read(stream, { map: (valor: string) => valor });
}

/** CUANDO el archivo sea XLSX (R15): lee la primera hoja. */
async function readXlsxWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  // exceljs declara en su propio .d.ts un tipo local `Buffer` (extends ArrayBuffer)
  // que en TS estricto es incompatible con el Buffer real de Node (generico,
  // ArrayBufferLike). Cast dirigido y documentado: unico punto de friccion de
  // tipos de la libreria, sin recurrir a `any` explicito.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new ValidationError(MSG.VALIDATION_ERROR, {
      fieldErrors: { file: ["el archivo no contiene hojas"] },
    });
  }
  return worksheet;
}

/** R16: normaliza cabecera -> columna, y arma las filas de datos. */
function extractRows(worksheet: ExcelJS.Worksheet): ParsedSpreadsheet {
  const headerRow = worksheet.getRow(1);
  const headerByCol = new Map<number, string>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = cellToString(cell.value).trim().toLowerCase();
    if (normalized !== "") headerByCol.set(colNumber, normalized);
  });

  const rows: RawRow[] = [];
  const numerosDeFila: number[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // cabecera
    const record: RawRow = {};
    let hasValue = false;
    for (const [colNumber, header] of headerByCol) {
      const raw = cellToString(row.getCell(colNumber).value).trim();
      record[header] = raw;
      if (raw !== "") hasValue = true;
    }
    if (!hasValue) return; // descarta filas completamente vacias
    rows.push(record);
    numerosDeFila.push(rowNumber);
  });

  return { headers: [...headerByCol.values()], rows, numerosDeFila };
}

/**
 * Parsea un archivo CSV o XLSX a filas normalizadas (R13-R16). `ext` es la
 * extension sin punto (p.ej. "csv", "xlsx"), insensible a mayusculas.
 */
export async function parseSpreadsheet(
  buffer: Buffer,
  ext: string,
  opciones: OpcionesParseo = {},
): Promise<ParsedSpreadsheet> {
  const normalizedExt = ext.trim().toLowerCase().replace(/^\./, "");
  assertSupportedExt(normalizedExt);

  const worksheet =
    normalizedExt === "csv"
      ? await readCsvWorksheet(buffer, opciones.textoLiteral === true)
      : await readXlsxWorksheet(buffer);

  return extractRows(worksheet);
}
