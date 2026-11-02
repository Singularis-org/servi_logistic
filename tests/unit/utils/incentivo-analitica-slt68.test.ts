import { describe, it, expect } from "vitest";

import { getMetrica } from "@/lib/analytics/metrics";
import { PAGO_MENSAJERO_MOVIMIENTO_CATEGORIA_SEED } from "@/lib/types/wallet-mensajero";
import { FUENTE_MENSAJERO } from "@/lib/utils/aporte-por-orden";

// SLT-68 (R20, design §5) — la analitica nombra el incentivo y su contraasiento, y el aporte por orden
// los clasifica como movimientos que no nacen de un cierre (como el premio del ranking).

describe("SLT-68 R20 — el incentivo en la analitica", () => {
  it("el catalogo de `cuenta_por_pagar_mensajero` nombra `incentivo` y `reverso_incentivo`, y cubre TODAS las categorias del libro", () => {
    const metrica = getMetrica("cuenta_por_pagar_mensajero");
    expect(metrica, "la metrica no existe").toBeDefined();
    const categorias = (metrica?.definicion as { categorias?: readonly string[] } | undefined)?.categorias ?? [];
    expect(categorias).toEqual(expect.arrayContaining(["incentivo", "reverso_incentivo"]));
    expect([...categorias].sort()).toEqual([...PAGO_MENSAJERO_MOVIMIENTO_CATEGORIA_SEED].sort());
  });

  it("FUENTE_MENSAJERO: el incentivo y su anulacion no tienen reparto por orden porque no nacen de un cierre", () => {
    expect(FUENTE_MENSAJERO.incentivo).toEqual({ tipo: "sin_reparto", motivo: "no_nace_de_un_cierre" });
    expect(FUENTE_MENSAJERO.reverso_incentivo).toEqual({ tipo: "sin_reparto", motivo: "no_nace_de_un_cierre" });
  });
});
