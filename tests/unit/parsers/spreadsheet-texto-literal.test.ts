import { describe, it, expect } from "vitest";
import { parseSpreadsheet } from "@/lib/parsers/spreadsheet";

// SL-20 T3.1 (design §5, riesgo §12) — el codigo oficial de un nodo es TEXTO. Sin `textoLiteral`,
// exceljs pasa cada valor CSV por `Number()` y `"01"` llega como `1`: dos codigos distintos (`01` y
// `1`) se volverian el mismo y la regla de prefijo de R17 se compararia contra un numero recortado.

const CABECERA = "nivel_1,codigo_nivel_1,nivel_2,codigo_nivel_2,nivel_3,codigo_nivel_3";

function csv(...lineas: string[]): Buffer {
  return Buffer.from(lineas.join("\r\n"), "utf8");
}

describe("parseSpreadsheet — opcion textoLiteral (SL-20)", () => {
  it("con textoLiteral, «01» y «10101» llegan como texto, con su cero inicial", async () => {
    const { rows } = await parseSpreadsheet(
      csv(CABECERA, "San José,01,Carmen,10101,Centro,0010101"),
      "csv",
      { textoLiteral: true },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].codigo_nivel_1).toBe("01");
    expect(rows[0].codigo_nivel_2).toBe("10101");
    expect(rows[0].codigo_nivel_3).toBe("0010101");
  });

  it("con textoLiteral, un valor con forma de fecha no se convierte en fecha", async () => {
    const { rows } = await parseSpreadsheet(csv(CABECERA, "A1,2026-01-02,B2,,,"), "csv", {
      textoLiteral: true,
    });

    expect(rows[0].codigo_nivel_1).toBe("2026-01-02");
  });

  it("contraprueba: sin la opcion, el comportamiento de siempre sigue perdiendo el cero", async () => {
    const { rows } = await parseSpreadsheet(csv(CABECERA, "San José,01,Carmen,10101,,"), "csv");

    // Es lo que hace a la opcion necesaria; si esto cambiara, la carga masiva de ordenes habria
    // cambiado tambien, y eso no lo pide SL-20.
    expect(rows[0].codigo_nivel_1).toBe("1");
  });

  it("con textoLiteral, se mantienen comillas, comas internas, recorte y filas vacias descartadas", async () => {
    const { headers, rows } = await parseSpreadsheet(
      csv(" NIVEL_1 ,codigo_nivel_1", '"San José, centro", 01 ', ",", "Alajuela,2"),
      "csv",
      { textoLiteral: true },
    );

    expect(headers).toEqual(["nivel_1", "codigo_nivel_1"]);
    expect(rows).toEqual([
      { nivel_1: "San José, centro", codigo_nivel_1: "01" },
      { nivel_1: "Alajuela", codigo_nivel_1: "2" },
    ]);
  });

  it("devuelve el numero de fila de origen de cada fila aunque haya filas vacias en medio", async () => {
    const { rows, numerosDeFila } = await parseSpreadsheet(
      csv(CABECERA, "A1,1,B1,101,,", ",,,,,", "A2,2,B2,201,,"),
      "csv",
      { textoLiteral: true },
    );

    expect(rows.map((r) => r.nivel_1)).toEqual(["A1", "A2"]);
    expect(numerosDeFila).toEqual([2, 4]);
  });
});
