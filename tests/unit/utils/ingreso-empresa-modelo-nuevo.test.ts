import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import type { GestionResultado } from "@prisma/client";

import {
  agregarIngresosPorConcepto,
  costoEnvioDeTarifa,
  costosListadoOrden,
  derivarIngresoOrden,
  desgloseCargaApi,
  fleteEntregadoSinTarifa,
  ganaLaTienda,
  ivaFulfillmentDeTarifa,
  montoFulfillmentDeTarifa,
  pagoTiendaEmpresa,
  partesPorTienda,
  tieneFulfillment,
  totalesIngresoEmpresa,
  type GestionDeTienda,
  type IngresoOrdenDerivado,
  type OrdenIngresoInput,
} from "@/lib/utils/ingreso-empresa";
import { computeTotales } from "@/lib/utils/cierre-totales";
import type { IngresoEmpresaDTO } from "@/lib/interfaces/services/ICierreDiaService";
import type { TarifaTienda, ValorCobro, ValoresTienda } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 T4.1 (design §6; R27, R29, R30, R31, R35) — el cobro a la tienda en el modelo NUEVO por
 * las mismas funciones publicas que el viejo.
 *
 * TODOS LOS ESPERADOS ESTAN ESCRITOS A MANO con la aritmetica anotada; ninguno sale de llamar a la
 * funcion probada. Valores de laboratorio (IVA 13 % salvo donde se dice):
 *   flete entregado    monto 2750.55 -> IVA 357.5715 -> 357.57
 *   flete reprogramado monto  800.00 -> IVA 104.00
 *   flete novedad      2.50 % del pedido; pedido 14900.00 -> 372.50 -> IVA 48.425 -> 48.43
 *   flete rechazo      monto 1650.35 -> IVA 214.5455 -> 214.55
 *   flete incidente    monto    0.00 (cero ESCRITO, no ausencia) -> IVA 0.00
 *   comision COD       3.50 %; pedido 14900.00 -> 521.50 -> IVA 67.795 -> 67.80
 *   fulfillment        monto  450.25
 */
function cobro(
  concepto: ValorCobro["concepto"],
  modo: ValorCobro["modo"],
  valor: string,
  ivaPct = "13.00",
): ValorCobro {
  return { concepto, modo, valor, ivaPct, nivel: "zona", tarifaValorId: `tv-${concepto}` };
}

const VALORES: ValoresTienda = {
  tienda_flete_entregado: cobro("tienda_flete_entregado", "monto", "2750.55"),
  tienda_flete_reprogramado: cobro("tienda_flete_reprogramado", "monto", "800.00"),
  tienda_flete_novedad: cobro("tienda_flete_novedad", "porcentaje", "2.50"),
  tienda_flete_rechazo: cobro("tienda_flete_rechazo", "monto", "1650.35"),
  tienda_flete_incidente: cobro("tienda_flete_incidente", "monto", "0.00"),
  tienda_comision_cod: cobro("tienda_comision_cod", "porcentaje", "3.50"),
  tienda_fulfillment: cobro("tienda_fulfillment", "monto", "450.25"),
};
const NUEVO: TarifaTienda = { modelo: "nuevo", valores: VALORES };

const ORDEN: Omit<OrdenIngresoInput, "resultado"> = {
  esCentral: false,
  esZonaEspecial: false,
  montoCobrar: "14900.00",
  cobraComision: true,
};

/** El derivado como texto, para comparar con literales. */
function texto(d: IngresoOrdenDerivado): Record<string, string> {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v!.toFixed(2)]));
}

describe("SLT-52 R29 — flete por cada resultado y su categoria (modelo nuevo)", () => {
  const casos: Array<[GestionResultado, Record<string, string>]> = [
    [
      "entregado",
      {
        ingreso_flete: "2750.55",
        ingreso_iva_flete: "357.57",
        ingreso_comision_cod: "521.50",
        ingreso_iva_comision_cod: "67.80",
      },
    ],
    // Un flete no entregado va a la categoria de devolucion: no sale de lo recaudado.
    ["reprogramado", { ingreso_flete_devolucion: "800.00", ingreso_iva_flete_devolucion: "104.00" }],
    ["novedad", { ingreso_flete_devolucion: "372.50", ingreso_iva_flete_devolucion: "48.43" }],
    [
      "devolucion_a_origen_por_rechazo",
      { ingreso_flete_devolucion: "1650.35", ingreso_iva_flete_devolucion: "214.55" },
    ],
    // R23: un 0 escrito vale 0 y aparece; no es «sin tarifa».
    ["incidente", { ingreso_flete_devolucion: "0.00", ingreso_iva_flete_devolucion: "0.00" }],
  ];

  it.each(casos)("%s cobra su concepto en su categoria", (resultado, esperado) => {
    expect(texto(derivarIngresoOrden({ ...ORDEN, resultado }, NUEVO))).toStrictEqual(esperado);
  });

  it("un resultado sin su concepto no aporta nada (R23: ausencia = sin tarifa)", () => {
    const sinReprogramado: ValoresTienda = { ...VALORES };
    delete sinReprogramado.tienda_flete_reprogramado;
    expect(
      derivarIngresoOrden({ ...ORDEN, resultado: "reprogramado" }, { modelo: "nuevo", valores: sinReprogramado }),
    ).toStrictEqual({});
  });

  it("una empresa en el nuevo sin ningun concepto de la tienda no cobra nada", () => {
    expect(derivarIngresoOrden({ ...ORDEN, resultado: "entregado" }, { modelo: "nuevo", valores: {} })).toStrictEqual({});
  });
});

describe("SLT-52 R30 — comision COD solo en entregado y con cobraComision", () => {
  it("entregado sin cobraComision: solo el flete", () => {
    expect(
      texto(derivarIngresoOrden({ ...ORDEN, resultado: "entregado", cobraComision: false }, NUEVO)),
    ).toStrictEqual({ ingreso_flete: "2750.55", ingreso_iva_flete: "357.57" });
  });

  it.each<GestionResultado>(["reprogramado", "novedad", "devolucion_a_origen_por_rechazo", "incidente"])(
    "%s con cobraComision no cobra comision",
    (resultado) => {
      const d = derivarIngresoOrden({ ...ORDEN, resultado, cobraComision: true }, NUEVO);
      expect(d.ingreso_comision_cod).toBeUndefined();
      expect(d.ingreso_iva_comision_cod).toBeUndefined();
    },
  );

  it("comision en monto: el importe tal cual, con su IVA (250.00 -> IVA 32.50)", () => {
    const valores: ValoresTienda = {
      ...VALORES,
      tienda_comision_cod: cobro("tienda_comision_cod", "monto", "250.00"),
    };
    const d = derivarIngresoOrden({ ...ORDEN, resultado: "entregado" }, { modelo: "nuevo", valores });
    expect(d.ingreso_comision_cod?.toFixed(2)).toBe("250.00");
    expect(d.ingreso_iva_comision_cod?.toFixed(2)).toBe("32.50");
  });
});

describe("SLT-52 R27 — el % del cobro va sobre el valor del pedido", () => {
  it("2.50 % de 14900.00 = 372.50; de 16618.40 = 415.46 (415.46); sin valor = 0.00", () => {
    const novedad = (montoCobrar: string | null) =>
      texto(derivarIngresoOrden({ ...ORDEN, resultado: "novedad", montoCobrar }, NUEVO));
    expect(novedad("14900.00")).toStrictEqual({
      ingreso_flete_devolucion: "372.50",
      ingreso_iva_flete_devolucion: "48.43",
    });
    // 16618.40 * 2.5 / 100 = 415.46; IVA 13 % = 54.0098 -> 54.01
    expect(novedad("16618.40")).toStrictEqual({
      ingreso_flete_devolucion: "415.46",
      ingreso_iva_flete_devolucion: "54.01",
    });
    expect(novedad(null)).toStrictEqual({
      ingreso_flete_devolucion: "0.00",
      ingreso_iva_flete_devolucion: "0.00",
    });
  });

  it("204: comision 3.50 % de 16618.40 -> 581.644 -> 581.64; IVA 75.6132 -> 75.61", () => {
    const d = derivarIngresoOrden({ ...ORDEN, resultado: "entregado", montoCobrar: "16618.40" }, NUEVO);
    expect(d.ingreso_comision_cod?.toFixed(2)).toBe("581.64");
    expect(d.ingreso_iva_comision_cod?.toFixed(2)).toBe("75.61");
  });

  it("el IVA de cada concepto es el suyo, no uno comun (flete 0 %, comision 13 %)", () => {
    const valores: ValoresTienda = {
      ...VALORES,
      tienda_flete_entregado: cobro("tienda_flete_entregado", "monto", "2750.55", "0.00"),
    };
    expect(
      texto(derivarIngresoOrden({ ...ORDEN, resultado: "entregado" }, { modelo: "nuevo", valores })),
    ).toStrictEqual({
      ingreso_flete: "2750.55",
      ingreso_iva_flete: "0.00",
      ingreso_comision_cod: "521.50",
      ingreso_iva_comision_cod: "67.80",
    });
  });
});

describe("SLT-52 R35 — esCentral y esZonaEspecial no cambian nada en el nuevo", () => {
  const marcas: Array<[boolean, boolean]> = [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ];
  it.each(marcas)("esCentral=%s esZonaEspecial=%s: mismo cobro, listado y costo API", (esCentral, esZonaEspecial) => {
    expect(
      texto(derivarIngresoOrden({ ...ORDEN, resultado: "entregado", esCentral, esZonaEspecial }, NUEVO)),
    ).toStrictEqual({
      ingreso_flete: "2750.55",
      ingreso_iva_flete: "357.57",
      ingreso_comision_cod: "521.50",
      ingreso_iva_comision_cod: "67.80",
    });
    expect(
      texto(
        derivarIngresoOrden(
          { ...ORDEN, resultado: "devolucion_a_origen_por_rechazo", esCentral, esZonaEspecial },
          NUEVO,
        ),
      ),
    ).toStrictEqual({ ingreso_flete_devolucion: "1650.35", ingreso_iva_flete_devolucion: "214.55" });
    // 2750.55 + 357.57 = 3108.12; 521.50 + 67.80 = 589.30. Origen siempre `normal`: el
    // «especial sin pacto» no existe en el nuevo.
    expect(costosListadoOrden(NUEVO, { esCentral, esZonaEspecial, montoCobrar: "14900.00", cobraComision: true })).toStrictEqual({
      fleteConIva: "3108.12",
      comisionConIva: "589.30",
      fleteOrigen: "normal",
    });
    expect(costoEnvioDeTarifa(NUEVO, esCentral, esZonaEspecial, "14900.00")).toBe("3108.12");
  });
});

describe("SLT-52 R31 — fulfillment: en el costo de la API, fuera de la liquidacion", () => {
  // SLT-52 R46 (2026-11-02): el fulfillment lleva su IVA. 450.25 al 13 % = 58.5325 -> 58.53, y
  // `costoEnvio` = 3108.12 + 450.25 + 58.53 = 3616.90. Antes de R46 este caso daba 3558.37.
  it("desgloseCargaApi: flete + IVA + fulfillment + su IVA (3108.12 + 450.25 + 58.53 = 3616.90)", () => {
    expect(desgloseCargaApi(NUEVO, false, false, "14900.00")).toStrictEqual({
      costoEnvio: "3616.90",
      fulfillment: "450.25",
    });
  });

  it("fulfillment en %: 1.00 % de 14900.00 = 149.00; sin valor del pedido = 0.00", () => {
    const valores: ValoresTienda = {
      ...VALORES,
      tienda_fulfillment: cobro("tienda_fulfillment", "porcentaje", "1.00"),
    };
    const t: TarifaTienda = { modelo: "nuevo", valores };
    expect(montoFulfillmentDeTarifa(t, "14900.00").toFixed(2)).toBe("149.00");
    expect(montoFulfillmentDeTarifa(t, null).toFixed(2)).toBe("0.00");
    // Hace fulfillment aunque el pedido valga 0: decide DONDE nace la orden.
    expect(tieneFulfillment(t)).toBe(true);
  });

  it("sin concepto de fulfillment, o con 0 escrito: no hace fulfillment y suma 0.00", () => {
    const sin: ValoresTienda = { ...VALORES };
    delete sin.tienda_fulfillment;
    const cero: ValoresTienda = { ...VALORES, tienda_fulfillment: cobro("tienda_fulfillment", "monto", "0.00") };
    for (const valores of [sin, cero]) {
      const t: TarifaTienda = { modelo: "nuevo", valores };
      expect(tieneFulfillment(t)).toBe(false);
      expect(desgloseCargaApi(t, false, false, "14900.00")).toStrictEqual({
        costoEnvio: "3108.12",
        fulfillment: "0.00",
      });
    }
  });

  it("agregarIngresosPorConcepto no emite el fulfillment (ni en monto ni en ninguna categoria)", () => {
    const gestiones = [
      { input: { ...ORDEN, resultado: "entregado" as const }, tarifa: NUEVO },
      { input: { ...ORDEN, resultado: "reprogramado" as const }, tarifa: NUEVO },
    ];
    // flete 2750.55; dev 800.00; comision 521.50; IVA flete 357.57; IVA dev 104.00; IVA com 67.80.
    // Ningun importe es 450.25 ni lo suma.
    expect(agregarIngresosPorConcepto(gestiones)).toStrictEqual([
      { categoria: "ingreso_flete", monto: "2750.55" },
      { categoria: "ingreso_flete_devolucion", monto: "800.00" },
      { categoria: "ingreso_comision_cod", monto: "521.50" },
      { categoria: "ingreso_iva_flete", monto: "357.57" },
      { categoria: "ingreso_iva_flete_devolucion", monto: "104.00" },
      { categoria: "ingreso_iva_comision_cod", monto: "67.80" },
    ]);
  });
});

/**
 * SLT-52 R46/R47 (design §12.1) — el fulfillment es un cobro a la tienda con su IVA. Esperados a
 * mano (flete entregado + IVA = 3108.12 en todos los casos del nuevo):
 *   monto 500.00 al 13 %            -> IVA 65.00   -> costoEnvio 3108.12 + 500.00 + 65.00 = 3673.12
 *   2.50 % de 14900.00 = 372.50     -> IVA 48.425  -> HALF_UP 48.43 (HALF_EVEN daria 48.42)
 *                                   -> costoEnvio 3108.12 + 372.50 + 48.43 = 3529.05
 */
describe("SLT-52 R46 — fulfillment con IVA", () => {
  const conFulfillment = (valor: ValorCobro): TarifaTienda => ({
    modelo: "nuevo",
    valores: { ...VALORES, tienda_fulfillment: valor },
  });

  it("monto 500.00 al 13 %: IVA 65.00 y costoEnvio con los dos (3673.12)", () => {
    const t = conFulfillment(cobro("tienda_fulfillment", "monto", "500.00"));
    expect(ivaFulfillmentDeTarifa(t, "14900.00").toFixed(2)).toBe("65.00");
    expect(desgloseCargaApi(t, false, false, "14900.00")).toStrictEqual({
      costoEnvio: "3673.12",
      fulfillment: "500.00",
    });
  });

  it("fulfillment en % sobre el pedido: 2.50 % de 14900.00 = 372.50, IVA 48.425 -> 48.43 (HALF_UP)", () => {
    const t = conFulfillment(cobro("tienda_fulfillment", "porcentaje", "2.50"));
    expect(ivaFulfillmentDeTarifa(t, "14900.00").toFixed(2)).toBe("48.43");
    expect(desgloseCargaApi(t, false, false, "14900.00")).toStrictEqual({
      costoEnvio: "3529.05",
      fulfillment: "372.50",
    });
    // Sin valor del pedido la base es 0: ni importe ni IVA.
    expect(ivaFulfillmentDeTarifa(t, null).toFixed(2)).toBe("0.00");
  });

  it("concepto ausente -> IVA 0.00; IVA 0 % -> 0.00", () => {
    const sin: ValoresTienda = { ...VALORES };
    delete sin.tienda_fulfillment;
    expect(ivaFulfillmentDeTarifa({ modelo: "nuevo", valores: sin }, "14900.00").toFixed(2)).toBe("0.00");
    const sinIva = conFulfillment(cobro("tienda_fulfillment", "monto", "500.00", "0.00"));
    expect(ivaFulfillmentDeTarifa(sinIva, "14900.00").toFixed(2)).toBe("0.00");
    expect(desgloseCargaApi(sinIva, false, false, "14900.00").costoEnvio).toBe("3608.12");
    expect(ivaFulfillmentDeTarifa(null, "14900.00").toFixed(2)).toBe("0.00");
  });

  it("agregarIngresosPorConcepto sigue sin emitir el fulfillment ni su IVA (R31)", () => {
    const t = conFulfillment(cobro("tienda_fulfillment", "monto", "500.00"));
    const gestiones = [
      { input: { ...ORDEN, resultado: "entregado" as const }, tarifa: t },
      { input: { ...ORDEN, resultado: "devolucion_a_origen_por_rechazo" as const }, tarifa: t },
    ];
    // Ni 500.00 ni 65.00 aparecen, ni sumados a otra categoria: solo flete, rechazo, comision y IVAs.
    expect(agregarIngresosPorConcepto(gestiones)).toStrictEqual([
      { categoria: "ingreso_flete", monto: "2750.55" },
      { categoria: "ingreso_flete_devolucion", monto: "1650.35" },
      { categoria: "ingreso_comision_cod", monto: "521.50" },
      { categoria: "ingreso_iva_flete", monto: "357.57" },
      { categoria: "ingreso_iva_flete_devolucion", monto: "214.55" },
      { categoria: "ingreso_iva_comision_cod", monto: "67.80" },
    ]);
  });

  /**
   * R47: `tarifas` no tiene % de IVA de fulfillment. Tarifa vieja: flete 2500.00 al 13 % = 2825.00
   * y fulfillment 1000.00 -> costoEnvio 3825.00, exactamente lo de antes de esta ficha.
   */
  it("SLT-52 R47 — el viejo no calcula IVA de fulfillment", () => {
    const viejo = {
      modelo: "viejo" as const,
      tarifa: {
        valorFlete: "2500.00",
        valorFleteGam: "2500.00",
        valorFleteDevuelto: "1000.00",
        valorFleteDevueltoGam: "1000.00",
        comisionCod: "3.50",
        ivaFlete: "13.00",
        ivaComisionCod: "13.00",
        tarifaEspecial: null,
        tarifaEspecialDevuelta: null,
        tarifaId: "t-viejo",
        fulfillment: "1000.00",
      },
    };
    expect(ivaFulfillmentDeTarifa(viejo, "14900.00").toFixed(2)).toBe("0.00");
    // SLT-52 (T5.3): la forma suelta de `ivaFulfillmentDeTarifa` se retiro (el congelado ya llega
    // envuelto); la vieja se pregunta siempre en su sobre, que es la linea de arriba.
    expect(desgloseCargaApi(viejo, false, false, "14900.00")).toStrictEqual({
      costoEnvio: "3825.00",
      fulfillment: "1000.00",
    });
  });
});

describe("SLT-52 R25 — fleteEntregadoSinTarifa decide el 409", () => {
  it("viejo: solo `null` es sin tarifa", () => {
    expect(fleteEntregadoSinTarifa(null)).toBe(true);
    expect(
      fleteEntregadoSinTarifa({
        modelo: "viejo",
        tarifa: {
          valorFlete: "1.00",
          valorFleteGam: "1.00",
          valorFleteDevuelto: "1.00",
          valorFleteDevueltoGam: "1.00",
          comisionCod: "0.00",
          ivaFlete: "0.00",
          ivaComisionCod: "0.00",
          tarifaEspecial: null,
          tarifaEspecialDevuelta: null,
          tarifaId: "t1",
          fulfillment: "0.00",
        },
      }),
    ).toBe(false);
  });

  it("nuevo: falta el concepto de flete por entregado, aunque haya otros", () => {
    const sinEntregado: ValoresTienda = { ...VALORES };
    delete sinEntregado.tienda_flete_entregado;
    expect(fleteEntregadoSinTarifa({ modelo: "nuevo", valores: sinEntregado })).toBe(true);
    expect(fleteEntregadoSinTarifa({ modelo: "nuevo", valores: {} })).toBe(true);
    expect(fleteEntregadoSinTarifa(NUEVO)).toBe(false);
    // Un 0 escrito es tarifa (R23): no da 409.
    expect(
      fleteEntregadoSinTarifa({
        modelo: "nuevo",
        valores: { tienda_flete_entregado: cobro("tienda_flete_entregado", "monto", "0.00") },
      }),
    ).toBe(false);
  });
});

describe("SLT-52 R29 — las cuatro identidades de partesPorTienda con fletes de reprogramado", () => {
  /** Plomeria: el derivado a la forma del DTO que lee `totalesIngresoEmpresa` (no es dinero nuevo). */
  function dto(input: OrdenIngresoInput): IngresoEmpresaDTO {
    const d = derivarIngresoOrden(input, NUEVO);
    const s = (v?: Prisma.Decimal) => (v === undefined ? null : v.toFixed(2));
    const par = (a?: Prisma.Decimal, b?: Prisma.Decimal) =>
      a === undefined && b === undefined ? null : new Prisma.Decimal(a ?? 0).plus(b ?? 0).toFixed(2);
    const total = Object.values(d).reduce<Prisma.Decimal>((acc, v) => acc.plus(v!), new Prisma.Decimal(0));
    return {
      montoCobrar: input.montoCobrar,
      cobraComision: input.cobraComision,
      esCentral: input.esCentral,
      esZonaEspecial: input.esZonaEspecial,
      fleteOrigen: "normal",
      fleteDevolucionOrigen: "normal",
      flete: s(d.ingreso_flete),
      ivaFlete: s(d.ingreso_iva_flete),
      fleteDevolucion: s(d.ingreso_flete_devolucion),
      ivaFleteDevolucion: s(d.ingreso_iva_flete_devolucion),
      comisionCod: s(d.ingreso_comision_cod),
      ivaComisionCod: s(d.ingreso_iva_comision_cod),
      fleteConIva: par(d.ingreso_flete, d.ingreso_iva_flete),
      fleteDevolucionConIva: par(d.ingreso_flete_devolucion, d.ingreso_iva_flete_devolucion),
      comisionConIva: par(d.ingreso_comision_cod, d.ingreso_iva_comision_cod),
      total: total.toFixed(2),
      fulfillment: "0.00", // SLT-52 (R46): el fulfillment congelado y su IVA, fuera del total
      ivaFulfillment: "0.00",
      tarifa: null,
    };
  }

  function gestion(
    tiendaId: string,
    resultado: GestionResultado,
    montoCobrar: string,
    cobraComision: boolean,
  ): GestionDeTienda {
    const input: OrdenIngresoInput = { resultado, esCentral: false, esZonaEspecial: false, montoCobrar, cobraComision };
    return {
      tiendaId,
      tiendaNombre: tiendaId,
      resultado,
      pagos: resultado === "entregado" ? [{ metodo: "efectivo", monto: montoCobrar }] : [],
      ingresoEmpresa: dto(input),
    };
  }

  // A: entregada COD 14900 con comision (3108.12 + 589.30) + reprogramada (904.00).
  // B: entregada COD 10000 sin comision (3108.12) + rechazada (1650.35 + 214.55 = 1864.90).
  const GESTIONES = [
    gestion("A", "entregado", "14900.00", true),
    gestion("A", "reprogramado", "14900.00", true),
    gestion("B", "entregado", "10000.00", false),
    gestion("B", "devolucion_a_origen_por_rechazo", "10000.00", false),
  ];

  it("cifras por tienda escritas a mano", () => {
    // A: pago 14900 - 3108.12 - 589.30 = 11202.58; gana 14900 - (3108.12+589.30+904.00) = 10298.58
    // B: pago 10000 - 3108.12 = 6891.88; gana 10000 - (3108.12+1864.90) = 5026.98
    expect(partesPorTienda(GESTIONES)).toStrictEqual([
      { tiendaId: "A", tiendaNombre: "A", recaudado: "14900.00", pagoTienda: "11202.58", ganaLaTienda: "10298.58" },
      { tiendaId: "B", tiendaNombre: "B", recaudado: "10000.00", pagoTienda: "6891.88", ganaLaTienda: "5026.98" },
    ]);
  });

  it("R10/R11/R12 + la cuarta (pagoTienda - ganaLaTienda = flete no descontable + IVA de esa tienda)", () => {
    const partes = partesPorTienda(GESTIONES);
    const todas = totalesIngresoEmpresa(GESTIONES);
    const general = computeTotales(GESTIONES).general;
    const suma = (k: "pagoTienda" | "ganaLaTienda" | "recaudado") =>
      partes.reduce((acc, p) => acc.plus(p[k]), new Prisma.Decimal(0)).toFixed(2);
    // Literales de las identidades: general 24900.00; fleteConIva 6216.24; comisionConIva 589.30;
    // total 9574.44.
    expect(general).toBe("24900.00");
    expect(todas.fleteConIva).toBe("6216.24");
    expect(todas.comisionConIva).toBe("589.30");
    expect(todas.total).toBe("9574.44");
    expect(pagoTiendaEmpresa(general, todas.fleteConIva, todas.comisionConIva)).toBe("18094.46");
    expect(ganaLaTienda(general, todas.total)).toBe("15325.56");
    expect(suma("pagoTienda")).toBe("18094.46"); // 11202.58 + 6891.88
    expect(suma("ganaLaTienda")).toBe("15325.56"); // 10298.58 + 5026.98
    expect(suma("recaudado")).toBe("24900.00"); // 14900.00 + 10000.00
    // Cuarta: A 11202.58 - 10298.58 = 904.00 (reprogramado); B 6891.88 - 5026.98 = 1864.90.
    expect(totalesIngresoEmpresa(GESTIONES.slice(0, 2)).fleteDevolucionConIva).toBe("904.00");
    expect(totalesIngresoEmpresa(GESTIONES.slice(2)).fleteDevolucionConIva).toBe("1864.90");
  });
});
