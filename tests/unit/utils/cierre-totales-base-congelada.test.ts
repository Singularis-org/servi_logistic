import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { ConceptoCongeladoRow } from "@/lib/utils/cierre-detalle";
import {
  baseDelCobroCongelado,
  rebasarConElCobroCongelado,
  type CobroCongeladoDeOrden,
} from "@/lib/utils/cobro-congelado";
import type { TarifaPago, ValorPago } from "@/lib/types/tarifa-flexible";

// SLT-52 (T5.5, design §13, R28, R52-R55) — la base del % del pago es el flete SIN IVA que el cobro
// CONGELADO le cobra a la tienda por esa gestion. Todos los importes esperados estan escritos a mano
// (literales de contrato): ninguno se compara contra la propia funcion ni contra `derivarIngresoOrden`.

const D = (v: string) => new Prisma.Decimal(v);

function concepto(
  o: Partial<ConceptoCongeladoRow> & Pick<ConceptoCongeladoRow, "concepto">,
): ConceptoCongeladoRow {
  return { modo: "monto", valor: D("0"), ivaPct: D("13"), nivel: "tienda_zona", tarifaValorId: "tv", ...o };
}

const SIN_TARIFA_VIEJA = {
  tarifaId: null,
  tarifaValorFlete: null,
  tarifaValorFleteGam: null,
  tarifaValorFleteDevuelto: null,
  tarifaValorFleteDevueltoGam: null,
  tarifaComisionCod: null,
  tarifaIvaFlete: null,
  tarifaIvaComisionCod: null,
  tarifaEspecial: null,
  tarifaEspecialDevuelta: null,
} as const;

function cobroNuevo(
  conceptos: ConceptoCongeladoRow[],
  o: Partial<CobroCongeladoDeOrden> = {},
): CobroCongeladoDeOrden {
  return {
    ...SIN_TARIFA_VIEJA,
    tarifaModelo: "nuevo",
    montoCobrar: D("20000.00"),
    cobraComision: true,
    esCentral: false,
    esZonaEspecial: false,
    conceptos,
    ...o,
  };
}

function cobroViejo(o: Partial<CobroCongeladoDeOrden> = {}): CobroCongeladoDeOrden {
  return {
    tarifaModelo: "viejo",
    tarifaId: "tarifa-vieja",
    tarifaValorFlete: D("2500"),
    tarifaValorFleteGam: D("2200"),
    tarifaValorFleteDevuelto: D("1800"),
    tarifaValorFleteDevueltoGam: D("1600"),
    tarifaComisionCod: D("3"),
    tarifaIvaFlete: D("13"),
    tarifaIvaComisionCod: D("13"),
    tarifaEspecial: null,
    tarifaEspecialDevuelta: null,
    montoCobrar: D("20000.00"),
    cobraComision: true,
    esCentral: false,
    esZonaEspecial: false,
    conceptos: [],
    ...o,
  };
}

const FLETES_NUEVOS = [
  concepto({ concepto: "tienda_flete_entregado", valor: D("3000") }),
  concepto({ concepto: "tienda_flete_rechazo", valor: D("1200") }),
  concepto({ concepto: "tienda_comision_cod", modo: "porcentaje", valor: D("2") }),
];

describe("baseDelCobroCongelado (SLT-52 T5.5, R28/R52-R55)", () => {
  it("SLT-52 R52 — entregado: el flete por entregado congelado, sin IVA ni comision", () => {
    expect(baseDelCobroCongelado("entregado", cobroNuevo(FLETES_NUEVOS))).toBe("3000.00");
  });

  it("SLT-52 R52 — rechazo: el flete por rechazo congelado (ingreso_flete_devolucion)", () => {
    expect(baseDelCobroCongelado("devolucion_a_origen_por_rechazo", cobroNuevo(FLETES_NUEVOS))).toBe(
      "1200.00",
    );
  });

  it("SLT-52 R28 — concepto ausente al congelar: la tienda no paga nada por ese resultado y la base es 0.00", () => {
    const sinRechazo = cobroNuevo([concepto({ concepto: "tienda_flete_entregado", valor: D("3000") })]);
    expect(baseDelCobroCongelado("devolucion_a_origen_por_rechazo", sinRechazo)).toBe("0.00");
    expect(baseDelCobroCongelado("reprogramado", sinRechazo)).toBe("0.00");
  });

  it("SLT-52 R27/R52 — concepto en %: sobre el pedido CONGELADO del detalle (5% de 20000 = 1000)", () => {
    const enPct = cobroNuevo([
      concepto({ concepto: "tienda_flete_rechazo", modo: "porcentaje", valor: D("5") }),
    ]);
    expect(baseDelCobroCongelado("devolucion_a_origen_por_rechazo", enPct)).toBe("1000.00");
    // Otro pedido congelado, otra base: la base sigue al detalle, no a nada vivo.
    expect(
      baseDelCobroCongelado("devolucion_a_origen_por_rechazo", { ...enPct, montoCobrar: D("7000.00") }),
    ).toBe("350.00");
    expect(
      baseDelCobroCongelado("devolucion_a_origen_por_rechazo", { ...enPct, montoCobrar: null }),
    ).toBe("0.00");
  });

  it("SLT-52 R54 — cobro viejo congelado: rechazo = flete devuelto del viejo (normal y GAM); entregado = flete", () => {
    expect(baseDelCobroCongelado("devolucion_a_origen_por_rechazo", cobroViejo())).toBe("1800.00");
    expect(
      baseDelCobroCongelado("devolucion_a_origen_por_rechazo", cobroViejo({ esCentral: true })),
    ).toBe("1600.00");
    expect(baseDelCobroCongelado("entregado", cobroViejo())).toBe("2500.00");
    // En el viejo un `reprogramado` no le cobra nada a la tienda (ficha 301).
    expect(baseDelCobroCongelado("reprogramado", cobroViejo())).toBe("0.00");
  });

  it("SLT-52 R54 — viejo SIN tarifa congelada (`tarifa_id` NULL): la base es 0.00", () => {
    expect(
      baseDelCobroCongelado("devolucion_a_origen_por_rechazo", {
        ...cobroViejo(),
        ...SIN_TARIFA_VIEJA,
      }),
    ).toBe("0.00");
  });
});

describe("rebasarConElCobroCongelado (SLT-52 T5.5, design §13.2)", () => {
  const valor = (concepto: ValorPago["concepto"], modo: ValorPago["modo"], v: string): ValorPago => ({
    concepto,
    modo,
    valor: v,
    nivel: "zona",
    tarifaValorId: "tv-pago",
  });

  it("SLT-52 R52/R55 — sustituye la base del nuevo por la del cobro congelado; el viejo pasa tal cual", () => {
    const viejo: TarifaPago = {
      modelo: "viejo",
      tarifa: { cobroEntregado: "1500.00", cobroRechazado: "0.00" } as never,
    };
    const tarifas = new Map<string, TarifaPago | null>([
      [
        "g-nuevo",
        {
          modelo: "nuevo",
          mensajero: valor("mensajero_rechazo", "porcentaje", "50"),
          satelite: null,
          baseFlete: "9999.00", // la del resolver vivo: NO debe sobrevivir
        },
      ],
      ["g-viejo", viejo],
      ["g-sin", null],
    ]);
    const vistos: string[] = [];
    const out = rebasarConElCobroCongelado(
      [
        { gestionId: "g-nuevo", ordenId: "o-1", resultado: "devolucion_a_origen_por_rechazo" },
        { gestionId: "g-viejo", ordenId: "o-2", resultado: "entregado" },
        { gestionId: "g-sin", ordenId: "o-3", resultado: "entregado" },
      ],
      tarifas,
      (ordenId) => {
        vistos.push(ordenId);
        return cobroNuevo(FLETES_NUEVOS);
      },
    );
    expect(out.get("g-nuevo")).toEqual({
      modelo: "nuevo",
      mensajero: valor("mensajero_rechazo", "porcentaje", "50"),
      satelite: null,
      baseFlete: "1200.00",
    });
    expect(out.get("g-viejo")).toBe(viejo);
    expect(out.get("g-sin")).toBeNull();
    // Solo el nuevo lee el cobro: el viejo no tiene base (R36).
    expect(vistos).toEqual(["o-1"]);
  });
});
