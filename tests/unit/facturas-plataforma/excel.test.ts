import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { construirExcelFactura } from "@/lib/facturas-plataforma/excel";
import type { DatosDescargaFactura } from "@/lib/types/factura-plataforma";
import { FORMATO_EXCEL_MONTO } from "@/lib/utils/xlsx-monto";
import { datosDescarga, enPlataforma, factura, movimiento } from "../../components/_facturas-plataforma";

// SLT-136 (T3.1) — R16 y R17: se relee el libro con exceljs.

async function hojaDe(datos: DatosDescargaFactura) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await construirExcelFactura(datos)) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

function valores(fila: ExcelJS.Row): unknown[] {
  return (fila.values as unknown[]).slice(1);
}

describe("SLT-136 R16 — la hoja «Movimientos», una fila por movimiento", () => {
  it("una sola hoja «Movimientos» con las cinco cabeceras", async () => {
    const wb = await hojaDe(datosDescarga());
    expect(wb.worksheets.map((h) => h.name)).toEqual(["Movimientos"]);
    expect(valores(wb.worksheets[0].getRow(1))).toEqual(["Fecha", "Guía", "Remisión", "Tipo", "Valor"]);
  });

  it("fecha y hora de la plataforma, guía (vacía si no la hay), remisión, Cobrado/Reverso y valor con signo", async () => {
    const hoja = (await hojaDe(datosDescarga())).worksheets[0];
    expect(hoja.rowCount).toBe(4);
    expect(valores(hoja.getRow(2))).toEqual(["17/11/2026 09:30", 1001, "R-1001", "Cobrado", 300]);
    expect(valores(hoja.getRow(3))).toEqual(["18/11/2026 10:00", 1002, "R-1002", "Cobrado", 300]);
    const reverso = hoja.getRow(4);
    expect(reverso.getCell(1).value).toBe("18/11/2026 15:45");
    expect(reverso.getCell(2).value).toBeNull();
    expect(reverso.getCell(3).value).toBe("R-1001");
    expect(reverso.getCell(4).value).toBe("Reverso");
    expect(reverso.getCell(5).value).toBe(-300);
  });

  it("el valor es un número exacto con #,##0.00, igual al de la base", async () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "1234.56", reversos: "0.00", totalOrdenes: "1234.56", movimientos: 1, total: "1234.56" }),
      movimientos: [movimiento({ instante: enPlataforma("2026-11-17", "23:30"), valor: "1234.56" })],
    });
    const celda = (await hojaDe(datos)).worksheets[0].getRow(2).getCell(5);
    expect(celda.value).toBe(1234.56);
    expect(celda.numFmt).toBe(FORMATO_EXCEL_MONTO);
    expect(FORMATO_EXCEL_MONTO).toBe("#,##0.00");
    // 23:30 de la plataforma, no el día siguiente de UTC.
    expect((await hojaDe(datos)).worksheets[0].getRow(2).getCell(1).value).toBe("17/11/2026 23:30");
  });
});

describe("SLT-136 R17 — sin movimientos", () => {
  it("solo la fila de cabeceras", async () => {
    const datos = datosDescarga({
      factura: factura({ cargos: "0.00", reversos: "0.00", totalOrdenes: "0.00", movimientos: 0, total: "0.00" }),
      movimientos: [],
    });
    const hoja = (await hojaDe(datos)).worksheets[0];
    expect(hoja.rowCount).toBe(1);
    expect(valores(hoja.getRow(1))).toEqual(["Fecha", "Guía", "Remisión", "Tipo", "Valor"]);
  });
});
