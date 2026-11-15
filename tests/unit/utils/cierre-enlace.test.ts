import { describe, expect, it } from "vitest";
import { hrefDetalleCierre, hrefDetalleCierreBodega } from "@/lib/utils/cierre-enlace";

describe("cierre-enlace (SLT-114 R237)", () => {
  it("R237 — el enlace al cierre de bodega va a /cierres-admin con cierreBodega=<id>", () => {
    expect(hrefDetalleCierreBodega("cb-7f3a9e21")).toBe("/cierres-admin?cierreBodega=cb-7f3a9e21");
  });

  it("R237 — codifica un id que no controla (no inyecta otros parámetros)", () => {
    expect(hrefDetalleCierreBodega("a&cierre=x y/z")).toBe(
      "/cierres-admin?cierreBodega=a%26cierre%3Dx%20y%2Fz",
    );
  });

  it("el enlace al cierre del día sigue con su parámetro de siempre", () => {
    expect(hrefDetalleCierre("c-1")).toBe("/cierres-admin?cierre=c-1");
  });
});
