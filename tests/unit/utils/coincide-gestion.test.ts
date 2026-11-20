import { describe, it, expect } from "vitest";

import { GESTIONES_POR_PAGINA, coincideGestion } from "@/components/private/cierres/fila/fila-gestion-vista";

// SLT-165 «PWA del mensajero: Cierre del día en tarjetas» (D2; R526, R527) — el buscador de «Gestiones»
// en el teléfono: guía, remisión o destinatario (P2 de SLT-156: sin teléfono), parcial e insensible a
// mayúsculas y acentos. Esperados a mano.

const g = { numGuia: 10187406, numRemision: "REM-0042", destinatario: "María José Ñúñez" };

describe("coincideGestion (R527)", () => {
  it("un término vacío o de espacios casa con todo", () => {
    expect(coincideGestion(g, "")).toBe(true);
    expect(coincideGestion(g, "   ")).toBe(true);
  });

  it("por guía, entera o en parte", () => {
    expect(coincideGestion(g, "10187406")).toBe(true);
    expect(coincideGestion(g, "8740")).toBe(true);
  });

  it("por remisión, sin distinguir mayúsculas", () => {
    expect(coincideGestion(g, "rem-0042")).toBe(true);
  });

  it("por destinatario, sin acentos ni mayúsculas y con espacios de más", () => {
    expect(coincideGestion(g, "maria jose")).toBe(true);
    expect(coincideGestion(g, "  NUÑEZ ")).toBe(true);
  });

  it("lo que no está no casa (tampoco el teléfono, que no se busca)", () => {
    expect(coincideGestion(g, "Pedro")).toBe(false);
    expect(coincideGestion({ ...g, telefonoDest: "88880000" } as typeof g, "88880000")).toBe(false);
  });

  it("sin guía, sigue casando por remisión y destinatario", () => {
    expect(coincideGestion({ ...g, numGuia: null }, "REM-0042")).toBe(true);
    expect(coincideGestion({ ...g, numGuia: null }, "null")).toBe(false);
  });
});

describe("GESTIONES_POR_PAGINA (R526)", () => {
  it("son 25", () => {
    expect(GESTIONES_POR_PAGINA).toBe(25);
  });
});
