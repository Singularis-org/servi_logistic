// SLT-113 «Excel del modelo nuevo de cierres» (T1.1, R370/R372) — `DescargaConfig.tituloHoja`: el
// nombre de la hoja principal puede no ser la base del nombre de archivo. Ausente, todo como siempre.
// Los asertos RELEEN el binario con exceljs; los nombres esperados se escriben A MANO.
import ExcelJS from "exceljs";
import { describe, it, expect } from "vitest";

import type { DescargaColumna, DescargaFila } from "@/lib/types/descarga";
import { construirDescarga } from "@/lib/utils/descarga-dataset";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

const COLUMNAS: DescargaColumna[] = [
  { clave: "guia", encabezado: "Nº Guía" },
  { clave: "total", encabezado: "Se le cobra a la tienda", formato: "monto" },
];
const FILAS: DescargaFila[] = [{ guia: 101, total: "4520.00" }];

// 12 de noviembre de 2026, 12:00 en Costa Rica (18:00 UTC).
const FECHA = new Date(Date.UTC(2026, 10, 12, 18, 0));

async function nombresDeHojas(contenido: ArrayBuffer | string): Promise<string[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(contenido as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb.worksheets.map((hoja) => hoja.name);
}

describe("SLT-113 — tituloHoja (R370, R372)", () => {
  it("con tituloHoja «Gestiones», la hoja se llama «Gestiones» y el archivo sigue siendo «gestiones-de-cierres-<hoy>»", async () => {
    const archivo = await construirDescarga(
      { tipo: "xlsx", titulo: "Gestiones de cierres", tituloHoja: "Gestiones", columnas: COLUMNAS, filas: FILAS },
      ZONA_CR,
      FECHA,
    );
    expect(archivo.nombreArchivo).toBe("gestiones-de-cierres-2026-11-12.xlsx");
    expect(await nombresDeHojas(archivo.contenido)).toEqual(["Gestiones"]);
  });

  it("con tituloHoja y hojas adicionales, la principal es «Gestiones» y las demás siguen en su orden", async () => {
    const archivo = await construirDescarga(
      {
        tipo: "xlsx",
        titulo: "Gestiones de cierres",
        tituloHoja: "Gestiones",
        columnas: COLUMNAS,
        filas: FILAS,
        hojasAdicionales: [
          { titulo: "Rechazados por la tienda", columnas: [{ clave: "guia", encabezado: "Nº Guía" }], filas: [] },
          { titulo: "Gestiones modelo anterior", columnas: COLUMNAS, filas: FILAS },
        ],
      },
      ZONA_CR,
      FECHA,
    );
    expect(archivo.nombreArchivo).toBe("gestiones-de-cierres-2026-11-12.xlsx");
    expect(await nombresDeHojas(archivo.contenido)).toEqual([
      "Gestiones",
      "Rechazados por la tienda",
      "Gestiones modelo anterior",
    ]);
  });

  it("sin tituloHoja, la hoja se llama como el título (el archivo de siempre)", async () => {
    const archivo = await construirDescarga(
      { tipo: "xlsx", titulo: "Gestiones de cierres", columnas: COLUMNAS, filas: FILAS },
      ZONA_CR,
      FECHA,
    );
    expect(archivo.nombreArchivo).toBe("gestiones-de-cierres-2026-11-12.xlsx");
    expect(await nombresDeHojas(archivo.contenido)).toEqual(["Gestiones de cierres"]);
  });
});
