// SLT-49 / R12, R13, R14 — la regla unica de alcance de etiquetas. Los valores esperados son
// LITERALES (el contrato), no se derivan de la funcion que se prueba.
import { describe, it, expect } from "vitest";
import { resolverAlcanceEtiquetasOrden } from "@/lib/services/alcance-etiquetas-orden";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

describe("resolverAlcanceEtiquetasOrden (SLT-49, R14)", () => {
  it("R14/R7: adminTienda -> propias, con su usuarioId como dueño", () => {
    const actor: Actor = { usuarioId: "tienda-A", rol: "adminTienda" };
    expect(resolverAlcanceEtiquetasOrden(actor)).toEqual({ alcance: "propias", ownerId: "tienda-A" });
  });

  it("R13: apiKey -> propias, con el dueño de la key (feature 136, sin cambio)", () => {
    const actor: Actor = { usuarioId: "tienda-K", rol: "apiKey" };
    expect(resolverAlcanceEtiquetasOrden(actor)).toEqual({ alcance: "propias", ownerId: "tienda-K" });
  });

  it("R11: maestro -> todas", () => {
    expect(resolverAlcanceEtiquetasOrden({ usuarioId: "u-m", rol: "maestro" })).toEqual({
      alcance: "todas",
    });
  });

  it("R11: admin -> todas", () => {
    expect(resolverAlcanceEtiquetasOrden({ usuarioId: "u-a", rol: "admin" })).toEqual({
      alcance: "todas",
    });
  });

  it("R12: mensajero -> todas (comportamiento actual; lo decide SLT-50)", () => {
    expect(resolverAlcanceEtiquetasOrden({ usuarioId: "u-msg", rol: "mensajero" })).toEqual({
      alcance: "todas",
    });
  });

  it("R12: adminSatelite -> todas (comportamiento actual; lo decide SLT-50)", () => {
    expect(resolverAlcanceEtiquetasOrden({ usuarioId: "u-sat", rol: "adminSatelite" })).toEqual({
      alcance: "todas",
    });
  });
});
