import { describe, it, expect } from "vitest";

import { lineaUbicacion } from "@/app/(app)/mis-asignaciones/_components/pos-card/pos-format";

// SLT-192 (R888): la ubicación de una línea «{cantón} · {distrito} — {dirección}» que comparten la
// fila Detalle y la hoja de la parada del mapa. Literales a mano: el formato ES el contrato.

describe("SLT-192 R888 — lineaUbicacion", () => {
  it("con las tres partes", () => {
    expect(
      lineaUbicacion({ cantonNombre: "Central", distritoNombre: "Carmen", direccion: "Calle 1" }),
    ).toBe("Central · Carmen — Calle 1");
  });

  it("sin distrito: sin «·» sobrante", () => {
    expect(
      lineaUbicacion({ cantonNombre: "Central", distritoNombre: null, direccion: "Calle 1" }),
    ).toBe("Central — Calle 1");
  });

  it("cantón vacío: sin «·» sobrante", () => {
    expect(
      lineaUbicacion({ cantonNombre: "", distritoNombre: "Carmen", direccion: "Calle 1" }),
    ).toBe("Carmen — Calle 1");
  });

  it("cantón vacío y sin distrito: solo la dirección, sin «—»", () => {
    expect(
      lineaUbicacion({ cantonNombre: "", distritoNombre: null, direccion: "Calle 1" }),
    ).toBe("Calle 1");
  });

  it("sin dirección: solo «Cantón · Distrito», sin «—»", () => {
    expect(
      lineaUbicacion({ cantonNombre: "Central", distritoNombre: "Carmen", direccion: null }),
    ).toBe("Central · Carmen");
  });

  it("sin ninguna (cantón vacío): cadena vacía (quien pinta pone «Sin dirección»)", () => {
    expect(lineaUbicacion({ cantonNombre: "", distritoNombre: null, direccion: null })).toBe("");
  });
});
