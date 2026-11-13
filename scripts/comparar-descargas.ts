import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

import ExcelJS from "exceljs";

// SLT-125 (design §7; R35) — `pnpm descargas:comparar <a> <b>`: compara dos descargas del mismo tipo
// (CSV o XLSX) celda a celda.
//
// Para que una persona compruebe, sobre la copia de produccion, que las 7 descargas de una empresa de
// Costa Rica salen iguales con `dev` y con esta rama. Las descargas llevan datos de destinatarios: por
// eso el script solo imprime cifras y coordenadas de celda (`F<fila>C<columna>`), nunca un valor.
//
// - CSV: se lee con el lector CSV de `exceljs` (ya en el repo) con cada valor como texto literal, y se
//   dice ademas si los dos archivos son iguales byte a byte.
// - XLSX: la primera hoja; cada celda se compara por su valor crudo (tipo incluido: 12500 no es «12500»).
//   No se comparan bytes: el libro lleva la fecha de creacion en sus metadatos (design §11, alternativa 6).
//
// Salida: 0 sin celdas distintas, 1 con alguna, 2 si los argumentos o los archivos no valen.

const USO = "Uso: pnpm descargas:comparar <archivo-a> <archivo-b>   (los dos .csv o los dos .xlsx)";

/** Cuantas coordenadas se listan: la cifra va entera, la lista no inunda la consola. */
export const COORDENADAS_MAXIMAS = 200;

export type Matriz = string[][];

export interface Comparacion {
  filas: [number, number];
  columnas: [number, number];
  /** Coordenadas 1-based de las celdas distintas, fila a fila. */
  distintas: { fila: number; columna: number }[];
  /** Solo CSV: si los dos archivos son iguales byte a byte. */
  bytesIdenticos: boolean | null;
}

/** El valor de una celda como texto comparable. `JSON` conserva el tipo (numero, fecha, texto…). */
function clave(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  return JSON.stringify(valor);
}

function matrizDe(hoja: ExcelJS.Worksheet): Matriz {
  const m: Matriz = [];
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    const celdas: string[] = [];
    fila.eachCell({ includeEmpty: true }, (celda, c) => {
      celdas[c - 1] = clave(celda.value);
    });
    m[n - 1] = Array.from(celdas, (x) => x ?? "");
  });
  return Array.from(m, (f) => f ?? []);
}

export async function leerMatriz(contenido: Buffer, extension: "csv" | "xlsx"): Promise<Matriz> {
  const libro = new ExcelJS.Workbook();
  if (extension === "csv") {
    // La identidad evita el `map` por defecto de exceljs, que convierte a numero y a fecha.
    const hoja = await libro.csv.read(Readable.from(contenido), { map: (v: string) => v });
    return matrizDe(hoja);
  }
  await libro.xlsx.load(contenido as unknown as Parameters<typeof libro.xlsx.load>[0]);
  const hoja = libro.worksheets[0];
  return hoja === undefined ? [] : matrizDe(hoja);
}

/** Compara dos matrices celda a celda; una celda que falta en una cuenta como vacia. */
export function compararMatrices(a: Matriz, b: Matriz): Comparacion["distintas"] {
  const distintas: Comparacion["distintas"] = [];
  const filas = Math.max(a.length, b.length);
  for (let f = 0; f < filas; f++) {
    const fa = a[f] ?? [];
    const fb = b[f] ?? [];
    const columnas = Math.max(fa.length, fb.length);
    for (let c = 0; c < columnas; c++) {
      if ((fa[c] ?? "") !== (fb[c] ?? "")) distintas.push({ fila: f + 1, columna: c + 1 });
    }
  }
  return distintas;
}

function extensionDe(archivo: string): "csv" | "xlsx" | null {
  const ext = path.extname(archivo).toLowerCase();
  return ext === ".csv" ? "csv" : ext === ".xlsx" ? "xlsx" : null;
}

export async function compararArchivos(a: Buffer, b: Buffer, extension: "csv" | "xlsx"): Promise<Comparacion> {
  const ma = await leerMatriz(a, extension);
  const mb = await leerMatriz(b, extension);
  const ancho = (m: Matriz) => m.reduce((n, f) => Math.max(n, f.length), 0);
  return {
    filas: [ma.length, mb.length],
    columnas: [ancho(ma), ancho(mb)],
    distintas: compararMatrices(ma, mb),
    bytesIdenticos: extension === "csv" ? a.equals(b) : null,
  };
}

/** Solo cifras y coordenadas: nunca el valor de una celda. */
export function lineasDeComparacion(r: Comparacion): string[] {
  const lineas = [
    `filas: a=${r.filas[0]} b=${r.filas[1]}`,
    `columnas: a=${r.columnas[0]} b=${r.columnas[1]}`,
    ...(r.bytesIdenticos === null ? [] : [`bytes-identicos=${r.bytesIdenticos ? "si" : "no"}`]),
    `celdas-distintas=${r.distintas.length}`,
  ];
  if (r.distintas.length > 0) {
    const muestra = r.distintas.slice(0, COORDENADAS_MAXIMAS).map((d) => `F${d.fila}C${d.columna}`);
    const resto = r.distintas.length - muestra.length;
    lineas.push(`coordenadas: ${muestra.join(" ")}${resto > 0 ? ` … y ${resto} mas` : ""}`);
  }
  return lineas;
}

async function main(): Promise<void> {
  const [a, b, ...sobra] = process.argv.slice(2);
  const ext = a === undefined || b === undefined ? null : extensionDe(a);
  if (a === undefined || b === undefined || sobra.length > 0 || ext === null || extensionDe(b) !== ext) {
    console.error(USO);
    process.exitCode = 2;
    return;
  }
  let contenidos: [Buffer, Buffer];
  try {
    contenidos = [await readFile(a), await readFile(b)];
  } catch {
    // Sin la ruta: puede llevar el nombre de la empresa.
    console.error("ABORTA: no se pudo leer alguno de los dos archivos.");
    process.exitCode = 2;
    return;
  }
  const r = await compararArchivos(contenidos[0], contenidos[1], ext);
  for (const linea of lineasDeComparacion(r)) console.log(linea);
  process.exitCode = r.distintas.length === 0 ? 0 : 1;
}

// Solo auto-ejecuta cuando este archivo es el entrypoint (no cuando un test lo importa).
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((error: unknown) => {
    console.error(`comparar-descargas: fallo (${error instanceof Error ? error.name : "error"})`);
    process.exitCode = 2;
  });
}
