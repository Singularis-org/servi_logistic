import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

// SL-40 (design §11.3, R26) — la deuda con la plataforma: Σ cargo − Σ reverso, como texto con dos
// decimales y sin pasar por `number`. SL-45 (design §3, R13, R14): menos los pagos vigentes, con su
// estado y su importe en positivo. Los casos de SL-40 van sin pagos ("0.00") y miran `deuda`.

const cargo = (monto: string) => ({ tipo: "cargo" as const, monto });
const reverso = (monto: string) => ({ tipo: "reverso" as const, monto });

describe("SL-40 — derivarDeudaPlataforma (R26)", () => {
  it("resta los reversos de los cargos", () => {
    expect(derivarDeudaPlataforma([cargo("2100.00"), reverso("1000.00")], "0.00").deuda).toBe("1100.00");
  });

  it("sin reversos, la deuda es la suma de los cargos", () => {
    expect(derivarDeudaPlataforma([cargo("1500.00")], "0.00").deuda).toBe("1500.00");
  });

  it("sin movimientos, la deuda es 0.00", () => {
    expect(derivarDeudaPlataforma([], "0.00").deuda).toBe("0.00");
  });

  it("todo revertido deja la deuda en 0.00", () => {
    expect(derivarDeudaPlataforma([reverso("500.00"), cargo("500.00")], "0.00").deuda).toBe("0.00");
  });

  it("devuelve siempre dos decimales, aunque la suma llegue con menos", () => {
    expect(derivarDeudaPlataforma([cargo("600"), reverso("0.5")], "0.00").deuda).toBe("599.50");
  });

  it("conserva los céntimos donde un number ya no los guarda", () => {
    // 1234567890123456.78 no cabe exacto en un double (paso de 0.25): con `Number` la resta da
    // 1234567890123456.75.
    expect(derivarDeudaPlataforma([cargo("1234567890123456.78"), reverso("0.01")], "0.00").deuda).toBe("1234567890123456.77");
  });

  it("la fuente no convierte importes a number (SL-40 R26, SL-45 R14)", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../lib/utils/deuda-plataforma.ts"), "utf8");
    const codigo = fuente.replace(/\/\/[^\n]*/g, "");
    expect(codigo).not.toMatch(/\bNumber\s*\(|parseFloat|parseInt|\+\s*s\.monto|\.toNumber\s*\(/);
  });
});

describe("SL-45 — derivarDeudaPlataforma con pagos (R13, R14)", () => {
  it("resta los pagos vigentes: 1.500 de cargos y 1.000 pagados → debe 500,00", () => {
    expect(derivarDeudaPlataforma([cargo("1500.00")], "1000.00")).toEqual({ deuda: "500.00", estado: "debe", importe: "500.00" });
  });

  it("con cargos y reversos: 2.100 − 1.000 de reversos − 600 pagados → debe 500,00", () => {
    expect(derivarDeudaPlataforma([cargo("2100.00"), reverso("1000.00")], "600.00")).toEqual({
      deuda: "500.00",
      estado: "debe",
      importe: "500.00",
    });
  });

  it("pagado exactamente lo que se debe → al día, 0,00 sin signo", () => {
    expect(derivarDeudaPlataforma([cargo("1500.00")], "1500.00")).toEqual({ deuda: "0.00", estado: "al_dia", importe: "0.00" });
  });

  it("todo revertido y pagado: un cero que nace de restas no sale «-0.00»", () => {
    expect(derivarDeudaPlataforma([reverso("500.00"), cargo("500.00")], "0.00")).toEqual({ deuda: "0.00", estado: "al_dia", importe: "0.00" });
    expect(derivarDeudaPlataforma([], "0")).toEqual({ deuda: "0.00", estado: "al_dia", importe: "0.00" });
  });

  it("un reverso tras pagar deja saldo a favor: la deuda con signo y el importe en positivo (R3)", () => {
    expect(derivarDeudaPlataforma([cargo("1500.00"), reverso("500.00")], "1500.00")).toEqual({
      deuda: "-500.00",
      estado: "a_favor",
      importe: "500.00",
    });
  });

  it("un céntimo decide el estado", () => {
    expect(derivarDeudaPlataforma([cargo("100.00")], "99.99")).toEqual({ deuda: "0.01", estado: "debe", importe: "0.01" });
    expect(derivarDeudaPlataforma([cargo("100.00")], "100.01")).toEqual({ deuda: "-0.01", estado: "a_favor", importe: "0.01" });
  });

  it("conserva los céntimos de los pagos donde un number ya no los guarda", () => {
    expect(derivarDeudaPlataforma([cargo("1234567890123456.78")], "0.01")).toEqual({
      deuda: "1234567890123456.77",
      estado: "debe",
      importe: "1234567890123456.77",
    });
  });
});
