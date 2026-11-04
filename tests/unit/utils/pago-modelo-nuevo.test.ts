import { describe, it, expect } from "vitest";
import type { GestionResultado } from "@prisma/client";

import { pagoPorResultado } from "@/lib/utils/pago-mensajero";
import { ingresoBodegaPorResultado } from "@/lib/utils/ingreso-bodega";
import { derivarIngresoBodega, derivarPagos } from "@/lib/utils/cierre-totales";
import { fleteSinIvaDeGestion } from "@/lib/utils/ingreso-empresa";
import type { CierreGestionPendienteRow } from "@/lib/interfaces/repositories/ICierreDiaRepository";
import type { TarifaPago, ValorCobro, ValorPago, ValoresTienda } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 T4.2 (design §6; R28, R32, R34) — el pago al mensajero y a la satelite en el modelo
 * nuevo por las mismas funciones publicas que el viejo.
 *
 * TODOS LOS ESPERADOS ESTAN ESCRITOS A MANO. Ninguno lleva IVA (decision P4): si un camino le
 * sumara el 13 % al pago, 1250.50 pasaria a 1413.07 y estos literales caerian.
 */
function pago(concepto: ValorPago["concepto"], modo: ValorPago["modo"], valor: string): ValorPago {
  return { concepto, modo, valor, nivel: "zona", tarifaValorId: `tv-${concepto}` };
}

function nuevo(
  mensajero: ValorPago | null,
  satelite: ValorPago | null,
  baseFlete = "0.00",
): TarifaPago {
  return { modelo: "nuevo", mensajero, satelite, baseFlete };
}

const SUFIJO: Record<GestionResultado, string> = {
  entregado: "entregado",
  reprogramado: "reprogramado",
  novedad: "novedad",
  devolucion_a_origen_por_rechazo: "rechazo",
  incidente: "incidente",
};

describe("SLT-52 R32 — cada resultado paga su concepto al mensajero y a la satelite", () => {
  const casos: Array<[GestionResultado, string, string]> = [
    ["entregado", "1250.50", "300.25"],
    ["reprogramado", "400.00", "100.10"],
    ["novedad", "350.75", "90.00"],
    ["devolucion_a_origen_por_rechazo", "500.00", "450.50"],
    ["incidente", "0.00", "0.00"],
  ];

  it.each(casos)("%s: mensajero %s, satelite %s (el importe exacto, sin IVA)", (resultado, m, s) => {
    const sufijo = SUFIJO[resultado];
    const t = nuevo(
      pago(`mensajero_${sufijo}` as ValorPago["concepto"], "monto", m),
      pago(`satelite_${sufijo}` as ValorPago["concepto"], "monto", s),
    );
    expect(pagoPorResultado(resultado, t)).toBe(m);
    expect(ingresoBodegaPorResultado(resultado, t)).toBe(s);
  });

  it("un valor de OTRO resultado no se paga (concepto distinto -> 0.00)", () => {
    const t = nuevo(pago("mensajero_entregado", "monto", "1250.50"), pago("satelite_rechazo", "monto", "450.50"));
    expect(pagoPorResultado("reprogramado", t)).toBe("0.00");
    expect(ingresoBodegaPorResultado("entregado", t)).toBe("0.00");
  });

  it("sin valor resuelto -> 0.00 (R23/R24: el cierre cuenta 0 y se crea igual)", () => {
    const t = nuevo(null, null, "2750.55");
    expect(pagoPorResultado("entregado", t)).toBe("0.00");
    expect(ingresoBodegaPorResultado("devolucion_a_origen_por_rechazo", t)).toBe("0.00");
  });

  it("la satelite con varios conceptos a la vez: cada gestion paga el de su resultado", () => {
    // g1 entregado 300.00 · g2 rechazo 450.50 · g3 novedad 10 % de 1650.35 = 165.035 -> 165.04
    // total 300.00 + 450.50 + 165.04 = 915.54. Al mensajero no se le paga nada (sin valores).
    const tarifas = new Map<string, TarifaPago | null>([
      ["g1", nuevo(null, pago("satelite_entregado", "monto", "300.00"), "2750.55")],
      ["g2", nuevo(null, pago("satelite_rechazo", "monto", "450.50"), "1650.35")],
      ["g3", nuevo(null, pago("satelite_novedad", "porcentaje", "10.00"), "1650.35")],
    ]);
    const gestiones = [
      { gestionId: "g1", resultado: "entregado" },
      { gestionId: "g2", resultado: "devolucion_a_origen_por_rechazo" },
      { gestionId: "g3", resultado: "novedad" },
      // Una gestion sin entrada en el mapa no tiene tarifa: 0.00.
      { gestionId: "g4", resultado: "devolucion_a_origen_por_rechazo" },
    ] as CierreGestionPendienteRow[];
    expect(derivarIngresoBodega(gestiones, tarifas)).toStrictEqual({
      ingresoByGestionId: { g1: "300.00", g2: "450.50", g3: "165.04", g4: "0.00" },
      total: "915.54",
    });
    expect(derivarPagos(gestiones, tarifas)).toStrictEqual({
      pagoByGestionId: { g1: "0.00", g2: "0.00", g3: "0.00", g4: "0.00" },
      total: "0.00",
    });
  });
});

describe("SLT-52 R28 — el % del pago va sobre el flete sin IVA de ESA gestion", () => {
  it("20 % de la base 2750.55 = 550.11 (con IVA, 3108.12, daria 621.62)", () => {
    const t = nuevo(pago("mensajero_entregado", "porcentaje", "20.00"), pago("satelite_entregado", "porcentaje", "5.00"), "2750.55");
    expect(pagoPorResultado("entregado", t)).toBe("550.11");
    // 5 % de 2750.55 = 137.5275 -> 137.53
    expect(ingresoBodegaPorResultado("entregado", t)).toBe("137.53");
  });

  it("de punta a punta: la base es fleteSinIvaDeGestion, la misma que cobra a la tienda", () => {
    const cobro = (concepto: ValorCobro["concepto"], valor: string): ValorCobro => ({
      concepto,
      modo: "monto",
      valor,
      ivaPct: "13.00",
      nivel: "zona",
      tarifaValorId: `tv-${concepto}`,
    });
    const valores: ValoresTienda = {
      tienda_flete_entregado: cobro("tienda_flete_entregado", "2750.55"),
      tienda_flete_rechazo: cobro("tienda_flete_rechazo", "1650.35"),
    };
    const base = (r: GestionResultado) => fleteSinIvaDeGestion(r, valores, "14900.00").toFixed(2);
    expect(base("entregado")).toBe("2750.55");
    expect(base("devolucion_a_origen_por_rechazo")).toBe("1650.35");
    const t = nuevo(pago("mensajero_entregado", "porcentaje", "20.00"), null, base("entregado"));
    expect(pagoPorResultado("entregado", t)).toBe("550.11");
    // 30 % de 1650.35 = 495.105 -> 495.11
    const r = nuevo(null, pago("satelite_rechazo", "porcentaje", "30.00"), base("devolucion_a_origen_por_rechazo"));
    expect(ingresoBodegaPorResultado("devolucion_a_origen_por_rechazo", r)).toBe("495.11");
  });

  it("reprogramado sin flete a la tienda: base 0.00 y el pago en % da 0.00", () => {
    const valores: ValoresTienda = {};
    const base = fleteSinIvaDeGestion("reprogramado", valores, "14900.00").toFixed(2);
    expect(base).toBe("0.00");
    const t = nuevo(pago("mensajero_reprogramado", "porcentaje", "30.00"), pago("satelite_reprogramado", "porcentaje", "15.00"), base);
    expect(pagoPorResultado("reprogramado", t)).toBe("0.00");
    expect(ingresoBodegaPorResultado("reprogramado", t)).toBe("0.00");
  });

  it("un monto no depende de la base: reprogramado sin flete paga su monto igual", () => {
    const t = nuevo(pago("mensajero_reprogramado", "monto", "400.00"), null, "0.00");
    expect(pagoPorResultado("reprogramado", t)).toBe("400.00");
  });
});

describe("SLT-52 R34 — el pago es exactamente el importe, sin IVA", () => {
  it("monto 1250.50 se paga 1250.50, no 1413.07 (1250.50 + 13 %)", () => {
    const t = nuevo(pago("mensajero_entregado", "monto", "1250.50"), pago("satelite_entregado", "monto", "1250.50"), "2750.55");
    expect(pagoPorResultado("entregado", t)).toBe("1250.50");
    expect(ingresoBodegaPorResultado("entregado", t)).toBe("1250.50");
  });

  it("derivarPagos suma por gestion los importes tal cual (1250.50 + 400.00 = 1650.50)", () => {
    const tarifas = new Map<string, TarifaPago | null>([
      ["g1", nuevo(pago("mensajero_entregado", "monto", "1250.50"), null, "2750.55")],
      ["g2", nuevo(pago("mensajero_reprogramado", "monto", "400.00"), null, "0.00")],
      ["g3", null],
    ]);
    const gestiones = [
      { gestionId: "g1", resultado: "entregado" },
      { gestionId: "g2", resultado: "reprogramado" },
      { gestionId: "g3", resultado: "entregado" },
    ] as CierreGestionPendienteRow[];
    expect(derivarPagos(gestiones, tarifas)).toStrictEqual({
      pagoByGestionId: { g1: "1250.50", g2: "400.00", g3: "0.00" },
      total: "1650.50",
    });
  });
});
