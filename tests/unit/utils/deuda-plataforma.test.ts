import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { derivarDeudaPlataforma } from "@/lib/utils/deuda-plataforma";

// SL-40 (design §11.3, R26) — la deuda con la plataforma: Σ cargo − Σ reverso, como texto con dos
// decimales y sin pasar por `number`.

const cargo = (monto: string) => ({ tipo: "cargo" as const, monto });
const reverso = (monto: string) => ({ tipo: "reverso" as const, monto });

describe("SL-40 — derivarDeudaPlataforma (R26)", () => {
  it("resta los reversos de los cargos", () => {
    expect(derivarDeudaPlataforma([cargo("2100.00"), reverso("1000.00")])).toBe("1100.00");
  });

  it("sin reversos, la deuda es la suma de los cargos", () => {
    expect(derivarDeudaPlataforma([cargo("1500.00")])).toBe("1500.00");
  });

  it("sin movimientos, la deuda es 0.00", () => {
    expect(derivarDeudaPlataforma([])).toBe("0.00");
  });

  it("todo revertido deja la deuda en 0.00", () => {
    expect(derivarDeudaPlataforma([reverso("500.00"), cargo("500.00")])).toBe("0.00");
  });

  it("devuelve siempre dos decimales, aunque la suma llegue con menos", () => {
    expect(derivarDeudaPlataforma([cargo("600"), reverso("0.5")])).toBe("599.50");
  });

  it("conserva los céntimos donde un number ya no los guarda", () => {
    // 1234567890123456.78 no cabe exacto en un double (paso de 0.25): con `Number` la resta da
    // 1234567890123456.75.
    expect(derivarDeudaPlataforma([cargo("1234567890123456.78"), reverso("0.01")])).toBe("1234567890123456.77");
  });

  it("la fuente no convierte importes a number", () => {
    const fuente = readFileSync(path.resolve(__dirname, "../../../lib/utils/deuda-plataforma.ts"), "utf8");
    const codigo = fuente.replace(/\/\/[^\n]*/g, "");
    expect(codigo).not.toMatch(/\bNumber\s*\(|parseFloat|parseInt|\+\s*s\.monto|\.toNumber\s*\(/);
  });
});
