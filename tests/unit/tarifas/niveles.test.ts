import { describe, it, expect } from "vitest";
import type { TarifaConcepto } from "@prisma/client";

import { MSG_FULFILLMENT_SOLO_TIENDA, nivelDeValor, type ColumnasDeNivel } from "@/lib/tarifas/niveles";

/**
 * SLT-94 T3.1 (R10, D6) — el fulfillment SOLO como precio propio de la tienda («tienda en todas sus
 * zonas»). Los niveles y campos esperados van escritos a mano desde requirements.md; ninguno sale de
 * las constantes del modulo probado, salvo el texto del rechazo, que es un contrato aparte.
 */

const FUL: TarifaConcepto = "tienda_fulfillment";
const FLETE: TarifaConcepto = "tienda_flete_entregado";

function cols(p: Partial<ColumnasDeNivel> = {}): ColumnasDeNivel {
  return { zonaId: null, grupoId: null, tiendaId: null, mensajeroId: null, vehiculoId: null, ...p };
}

describe("SLT-94 R10 — nivelDeValor: el fulfillment solo en «tienda en todas sus zonas»", () => {
  it("SLT-94 R10: tienda en todas sus zonas → nivel tienda_general", () => {
    expect(nivelDeValor(FUL, cols({ tiendaId: "t-1" }))).toEqual({ ok: true, nivel: "tienda_general" });
  });

  it.each([
    ["zona", cols({ zonaId: "z-1" }), "zonaId"],
    ["grupo", cols({ zonaId: "z-1", grupoId: "g-1" }), "grupoId"],
    ["tienda en una zona", cols({ tiendaId: "t-1", zonaId: "z-1" }), "zonaId"],
    ["tienda en un grupo", cols({ tiendaId: "t-1", zonaId: "z-1", grupoId: "g-1" }), "grupoId"],
  ] as const)("SLT-94 R10: %s → rechazo sobre %s con el texto del fulfillment", (_caso, c, campo) => {
    expect(nivelDeValor(FUL, c)).toEqual({ ok: false, campo, mensaje: MSG_FULFILLMENT_SOLO_TIENDA });
  });

  it("el texto dice qué hacer, no un código", () => {
    expect(MSG_FULFILLMENT_SOLO_TIENDA).toBe("El fulfillment solo se configura como precio propio de la tienda.");
  });

  it("los rechazos generales del cobro siguen ganando (vehículo, mensajero, grupo sin zona)", () => {
    expect(nivelDeValor(FUL, cols({ tiendaId: "t-1", vehiculoId: "v-1" }))).toMatchObject({ ok: false, campo: "vehiculoId" });
    expect(nivelDeValor(FUL, cols({ tiendaId: "t-1", mensajeroId: "m-1" }))).toMatchObject({ ok: false, campo: "mensajeroId" });
    expect(nivelDeValor(FUL, cols({ grupoId: "g-1" }))).toMatchObject({ ok: false, campo: "grupoId" });
  });

  it("control: los demás cobros a la tienda siguen admitiendo zona, grupo y tienda en zona/grupo", () => {
    expect(nivelDeValor(FLETE, cols({ zonaId: "z-1" }))).toEqual({ ok: true, nivel: "zona" });
    expect(nivelDeValor(FLETE, cols({ zonaId: "z-1", grupoId: "g-1" }))).toEqual({ ok: true, nivel: "grupo" });
    expect(nivelDeValor(FLETE, cols({ tiendaId: "t-1", zonaId: "z-1" }))).toEqual({ ok: true, nivel: "tienda_zona" });
    expect(nivelDeValor(FLETE, cols({ tiendaId: "t-1", zonaId: "z-1", grupoId: "g-1" }))).toEqual({
      ok: true,
      nivel: "tienda_grupo",
    });
  });
});
