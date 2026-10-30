import { describe, it, expect } from "vitest";

import { ajustarPagoMensajeroGestionSchema } from "@/lib/types/cierres-admin";

// SLT-56 / T4 (R7, R8, R16) — el borde del ajuste del pago al mensajero. Los importes viajan como
// TEXTO y se validan como texto: nada aqui pasa por `number`.

const GESTION = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const VALIDO = { gestionId: GESTION, pagoAnterior: "0.00", pagoNuevo: "1500.00", motivo: "rechazo con traslado largo" };

function erroresDe(entrada: unknown): Record<string, string[] | undefined> {
  const r = ajustarPagoMensajeroGestionSchema.safeParse(entrada);
  if (r.success) return {};
  const campos: Record<string, string[]> = {};
  for (const issue of r.error.issues) {
    const clave = issue.path.length > 0 ? String(issue.path[0]) : "_raiz";
    (campos[clave] ??= []).push(issue.message);
  }
  return campos;
}

describe("SLT-56 — ajustarPagoMensajeroGestionSchema", () => {
  it("acepta un ajuste valido, con los importes como STRING intactos", () => {
    const r = ajustarPagoMensajeroGestionSchema.parse(VALIDO);
    expect(r).toEqual(VALIDO);
    expect(typeof r.pagoNuevo).toBe("string");
  });

  it("R8 — acepta 0, enteros sin decimales y un decimal, y el maximo de Decimal(12,2)", () => {
    for (const pagoNuevo of ["0", "0.00", "1500", "1500.5", "9999999999.99"]) {
      expect(ajustarPagoMensajeroGestionSchema.safeParse({ ...VALIDO, pagoNuevo }).success, pagoNuevo).toBe(true);
    }
  });

  it("R8 — un importe negativo es error en `pagoNuevo`", () => {
    expect(erroresDe({ ...VALIDO, pagoNuevo: "-1.00" }).pagoNuevo).toBeDefined();
  });

  it("R8 — tres decimales es error en `pagoNuevo`", () => {
    expect(erroresDe({ ...VALIDO, pagoNuevo: "1500.001" }).pagoNuevo).toBeDefined();
  });

  it("R8 — once cifras enteras (no caben en Decimal(12,2)) es error en `pagoNuevo`", () => {
    expect(erroresDe({ ...VALIDO, pagoNuevo: "10000000000.00" }).pagoNuevo).toBeDefined();
  });

  it("R16 — un `number` no entra: el importe tiene que ser texto", () => {
    expect(erroresDe({ ...VALIDO, pagoNuevo: 1500 }).pagoNuevo).toBeDefined();
    expect(erroresDe({ ...VALIDO, pagoAnterior: 0 }).pagoAnterior).toBeDefined();
  });

  it("R8 — coma decimal, vacio o texto no son importes", () => {
    for (const pagoNuevo of ["1500,00", "", "mil", " 1500"]) {
      expect(erroresDe({ ...VALIDO, pagoNuevo }).pagoNuevo, JSON.stringify(pagoNuevo)).toBeDefined();
    }
  });

  it("R9 — `pagoAnterior` tiene la misma forma: obligatorio y no negativo", () => {
    const { pagoAnterior: _omitido, ...sinAnterior } = VALIDO;
    void _omitido;
    expect(erroresDe(sinAnterior).pagoAnterior).toBeDefined();
    expect(erroresDe({ ...VALIDO, pagoAnterior: "-5" }).pagoAnterior).toBeDefined();
  });

  it("R7 — motivo vacio o solo espacios es error en `motivo`", () => {
    expect(erroresDe({ ...VALIDO, motivo: "" }).motivo).toBeDefined();
    expect(erroresDe({ ...VALIDO, motivo: "   \t " }).motivo).toBeDefined();
  });

  it("R7 — el motivo llega recortado", () => {
    expect(ajustarPagoMensajeroGestionSchema.parse({ ...VALIDO, motivo: "  traslado largo  " }).motivo).toBe(
      "traslado largo",
    );
  });

  it("una clave ajena (`.strict()`) es error, no se descarta en silencio", () => {
    const r = ajustarPagoMensajeroGestionSchema.safeParse({ ...VALIDO, cierreId: GESTION });
    expect(r.success).toBe(false);
  });

  it("un `gestionId` que no es uuid es error en `gestionId`", () => {
    expect(erroresDe({ ...VALIDO, gestionId: "g-1" }).gestionId).toBeDefined();
  });
});
