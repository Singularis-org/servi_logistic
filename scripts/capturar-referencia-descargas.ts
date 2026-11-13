// SLT-125 (T1.2; design §7) — CAPTURA, UNA SOLA VEZ, LA REFERENCIA DE LAS DESCARGAS DE COSTA RICA.
//
// Pasa `tests/fixtures/descargas-cr/entrada.ts` por las funciones de columnas y de fila de las 7
// descargas que nombran lugares, y por los dos generadores (`buildCsvRows` y `buildXlsxRows`), con el
// código de ANTES de SLT-125. Guarda el CSV como texto y la matriz de celdas del XLSX en
// `tests/fixtures/descargas-cr/referencia.json`.
//
// Se corrió en el commit de la referencia, antes del primer cambio de `lib/` o `app/`. Después NO se
// vuelve a correr sobre ese archivo: es la foto del comportamiento de hoy, y regenerarla con el código
// nuevo haría pasar cualquier cambio. Por eso se niega a sobrescribirlo. Con `--salida <ruta>` escribe
// en otro sitio (para comprobar que la captura es determinista).
//
// Sin base de datos ni red: solo módulos puros y `exceljs` en memoria.
//
// Uso: pnpm exec tsx scripts/capturar-referencia-descargas.ts [--salida <ruta>]

import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ExcelJS from "exceljs";

import {
  COLUMNAS_DESCARGA_DIA_DEVUELTAS,
  COLUMNAS_DESCARGA_DIA_ENTREGADAS,
  COLUMNAS_DESCARGA_DIA_INCIDENTES,
  COLUMNAS_DESCARGA_DIA_RECHAZADAS,
  COLUMNAS_DESCARGA_DIA_REPROGRAMADAS,
  filaDescargaDiaDevuelta,
  filaDescargaDiaEntregada,
  filaDescargaDiaIncidente,
  filaDescargaDiaRechazada,
  filaDescargaDiaReprogramada,
} from "@/app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas";
import {
  columnasDescargaGestionesFundidaPara,
  filaDescargaGestionFundida,
} from "@/app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas";
import {
  columnasDescargaCobertura,
  filaCobertura,
} from "@/app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas";
import { COLUMNAS_DESCARGA_AYUDA, filaDescargaAyuda } from "@/app/(app)/novedades/_components/ayuda-descarga-columnas";
import {
  COLUMNAS_DESCARGA_NOVEDADES,
  filaDescargaNovedad,
} from "@/app/(app)/novedades/_components/novedades-descarga-columnas";
import { columnasDescargaOrdenes, filaDescargaOrden } from "@/app/(app)/ordenes/_components/ordenes-descarga-columnas";
import {
  columnasDescargaSatelite,
  filaDescargaSatelite,
} from "@/app/(app)/recepcion-satelite/_components/satelite-descarga-columnas";
import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { buildCsvRows } from "@/lib/utils/csv-template";
import { buildXlsxRows } from "@/lib/utils/xlsx-template";
import {
  CIERRE_DIA_CR,
  CIERRES_ADMIN_CR,
  COBERTURA_CR,
  ETIQUETAS_CR_DESCARGAS,
  NOVEDADES_CR,
  ORDENES_CR,
  SATELITE_CR,
} from "@/tests/fixtures/descargas-cr/entrada";

const REFERENCIA = path.resolve("tests/fixtures/descargas-cr/referencia.json");

type Celda = string | number | boolean | null;

export interface DescargaCapturada {
  columnas: DescargaColumna[];
  csv: string;
  /** Fila 1 = cabeceras; una fila por elemento, una celda por columna declarada. */
  xlsx: Celda[][];
}

interface Descarga {
  nombre: string;
  columnas: DescargaColumna[];
  filas: DescargaFila[];
}

function descargas(): Descarga[] {
  const de = <T>(nombre: string, columnas: DescargaColumna[], datos: readonly T[], fila: (d: T) => DescargaFila) => ({
    nombre,
    columnas,
    filas: datos.map(fila),
  });
  return [
    de("ordenes", columnasDescargaOrdenes(ETIQUETAS_CR_DESCARGAS), ORDENES_CR, filaDescargaOrden),
    de("satelite", columnasDescargaSatelite(ETIQUETAS_CR_DESCARGAS), SATELITE_CR, filaDescargaSatelite),
    de("novedades", COLUMNAS_DESCARGA_NOVEDADES, NOVEDADES_CR, filaDescargaNovedad),
    de("ayuda", COLUMNAS_DESCARGA_AYUDA, NOVEDADES_CR, filaDescargaAyuda),
    de("cierre-dia-entregadas", COLUMNAS_DESCARGA_DIA_ENTREGADAS, CIERRE_DIA_CR, filaDescargaDiaEntregada),
    de("cierre-dia-reprogramadas", COLUMNAS_DESCARGA_DIA_REPROGRAMADAS, CIERRE_DIA_CR, filaDescargaDiaReprogramada),
    de("cierre-dia-devueltas", COLUMNAS_DESCARGA_DIA_DEVUELTAS, CIERRE_DIA_CR, filaDescargaDiaDevuelta),
    de("cierre-dia-rechazadas", COLUMNAS_DESCARGA_DIA_RECHAZADAS, CIERRE_DIA_CR, filaDescargaDiaRechazada),
    de("cierre-dia-incidentes", COLUMNAS_DESCARGA_DIA_INCIDENTES, CIERRE_DIA_CR, filaDescargaDiaIncidente),
    de("cierres-admin-fundida", columnasDescargaGestionesFundidaPara("admin"), CIERRES_ADMIN_CR, filaDescargaGestionFundida),
    de(
      "cierres-admin-fundida-satelite",
      columnasDescargaGestionesFundidaPara("satelite"),
      CIERRES_ADMIN_CR,
      filaDescargaGestionFundida,
    ),
    de("cobertura", columnasDescargaCobertura(ETIQUETAS_CR_DESCARGAS), COBERTURA_CR, filaCobertura(ETIQUETAS_CR_DESCARGAS)),
  ];
}

/** La misma traducción de vocabulario que hace `construirDescarga` antes de llamar a los generadores. */
function columnasDelGenerador(columnas: DescargaColumna[]) {
  return columnas.map((c) => ({ key: c.clave, header: c.encabezado, ...(c.formato !== undefined ? { formato: c.formato } : {}) }));
}

/** Las celdas del libro, no sus bytes: el XLSX lleva la fecha de creación en los metadatos. */
async function celdasDelXlsx(binario: ArrayBuffer, columnas: number): Promise<Celda[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(binario);
  const hoja = libro.worksheets[0];
  if (hoja === undefined) throw new Error("capturar-referencia-descargas: el XLSX salió sin hojas");
  const filas: Celda[][] = [];
  for (let r = 1; r <= hoja.rowCount; r++) {
    const fila: Celda[] = [];
    for (let c = 1; c <= columnas; c++) {
      const valor = hoja.getRow(r).getCell(c).value;
      if (valor !== null && typeof valor === "object") {
        throw new Error(`capturar-referencia-descargas: celda ${r},${c} con un valor compuesto no esperado`);
      }
      fila.push(valor === undefined ? null : valor);
    }
    filas.push(fila);
  }
  return filas;
}

export async function capturar(): Promise<Record<string, DescargaCapturada>> {
  const salida: Record<string, DescargaCapturada> = {};
  for (const d of descargas()) {
    const columnas = columnasDelGenerador(d.columnas);
    salida[d.nombre] = {
      columnas: d.columnas,
      csv: buildCsvRows(columnas, d.filas),
      xlsx: await celdasDelXlsx(await buildXlsxRows(columnas, d.filas), columnas.length),
    };
  }
  return salida;
}

function rutaDeSalida(argv: readonly string[]): string {
  const i = argv.indexOf("--salida");
  if (i === -1) return REFERENCIA;
  const ruta = argv[i + 1];
  if (ruta === undefined) throw new Error("capturar-referencia-descargas: --salida necesita una ruta");
  return path.resolve(ruta);
}

async function main(): Promise<void> {
  const destino = rutaDeSalida(process.argv.slice(2));
  if (existsSync(destino)) {
    throw new Error(`capturar-referencia-descargas: ${destino} ya existe y la referencia no se regenera`);
  }
  const capturadas = await capturar();
  writeFileSync(destino, `${JSON.stringify({ v: 1, descargas: capturadas }, null, 2)}\n`, "utf8");
  console.log(`capturar-referencia-descargas: ${Object.keys(capturadas).length} descargas en ${destino}`);
}

// Solo corre como entrypoint: si un test importa `capturar`, no escribe nada.
const esEntrypoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (esEntrypoint) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
