import { describe, it, expect } from "vitest";
import { folioCierre, normalizarFolio } from "@/lib/utils/folio-cierre";
import { folioDe } from "@/components/private/cierres/detalle/detalle-cierre-vista";

// SLT-113 «Excel del modelo nuevo de cierres» (T2.1, R375) — el folio del archivo es el de la
// pantalla: una sola definición. Literal escrito a mano, no derivado de la función.
describe("folioCierre (SLT-113, R375)", () => {
  const id = "3f2a9c10-7b4e-4d21-9a0f-0000abcd1234";

  it("los últimos 8 del id, en mayúsculas", () => {
    expect(folioCierre(id)).toBe("ABCD1234");
  });

  it("la pantalla (`folioDe`) da el mismo folio que el archivo", () => {
    expect(folioDe(id)).toBe("ABCD1234");
  });
});

// SLT-138 (R171) — la normalización del texto del buscador por folio de la cola del mensajero.
// El folio es el de R156: los últimos 8 caracteres del id del cierre, en mayúsculas.

describe("normalizarFolio (SLT-138, R171)", () => {
  it("recorta los extremos, quita un «#» inicial y pasa a mayúsculas", () => {
    expect(normalizarFolio("  #3f2a  ")).toEqual({ tipo: "buscar", texto: "3F2A" });
    expect(normalizarFolio("a13f2a02")).toEqual({ tipo: "buscar", texto: "A13F2A02" });
    expect(normalizarFolio("beef")).toEqual({ tipo: "buscar", texto: "BEEF" });
  });

  it("quita UN «#», no dos: el segundo queda y no es un carácter de folio", () => {
    expect(normalizarFolio("##3F2A")).toEqual({ tipo: "imposible" });
  });

  it("vacío tras normalizar → se ignora", () => {
    expect(normalizarFolio("")).toEqual({ tipo: "ignorar" });
    expect(normalizarFolio("   ")).toEqual({ tipo: "ignorar" });
    expect(normalizarFolio(" # ")).toEqual({ tipo: "ignorar" });
    // El recorte va ANTES de quitar el «#»: un espacio detrás de él es interior y no es de folio.
    expect(normalizarFolio("# 3F2A")).toEqual({ tipo: "imposible" });
  });

  it("un carácter fuera de 0-9A-F → imposible", () => {
    expect(normalizarFolio("3G2A")).toEqual({ tipo: "imposible" });
    expect(normalizarFolio("3F-2A")).toEqual({ tipo: "imposible" });
    expect(normalizarFolio("3F 2A")).toEqual({ tipo: "imposible" });
    expect(normalizarFolio("ZZ")).toEqual({ tipo: "imposible" });
    // Los comodines de un LIKE no son caracteres de folio: nunca llegan al SQL.
    expect(normalizarFolio("%")).toEqual({ tipo: "imposible" });
    expect(normalizarFolio("3F_A")).toEqual({ tipo: "imposible" });
  });

  it("más de 8 caracteres no cabe en un folio → imposible; 8 sí", () => {
    expect(normalizarFolio("3F2A00010")).toEqual({ tipo: "imposible" });
    expect(normalizarFolio("#3F2A0001")).toEqual({ tipo: "buscar", texto: "3F2A0001" });
  });
});
