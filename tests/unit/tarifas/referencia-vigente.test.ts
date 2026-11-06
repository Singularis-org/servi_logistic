import { describe, expect, it } from "vitest";

import type { TarifaVigenteResuelta } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import {
  referenciaDeCobro,
  referenciaDePago,
  referenciaDeZona,
  type EntradaReferenciaZona,
} from "@/lib/tarifas/referencia-vigente";

// SLT-54 T2.2 (design §6, R21-R23) — la tabla de la referencia «Hoy rige». Los esperados son LITERALES
// calculados a mano sobre la tarifa de abajo: compararlos con las funciones que los generan siempre daria
// verde. Una tarifa con cada columna distinta, para que elegir la equivocada se vea en el numero.

const TARIFA: TarifaVigenteResuelta = {
  tarifaId: "t",
  fulfillment: "150.00",
  valorFlete: "2800.00",
  valorFleteGam: "2500.00",
  valorFleteDevuelto: "1400.00",
  valorFleteDevueltoGam: "1250.00",
  comisionCod: "3.50",
  ivaFlete: "13.00",
  ivaComisionCod: "2.00",
  tarifaEspecial: "4100.00",
  tarifaEspecialDevuelta: "3900.00",
};

const SIN_PACTO: TarifaVigenteResuelta = { ...TARIFA, tarifaEspecial: null, tarifaEspecialDevuelta: null };

const NORMAL = { esCentral: false, esZonaEspecial: false };
const CENTRAL = { esCentral: true, esZonaEspecial: false };
const ESPECIAL = { esCentral: false, esZonaEspecial: true };
const ESPECIAL_CENTRAL = { esCentral: true, esZonaEspecial: true };

describe("SLT-54 R21, R22 — el flete de un cobro a la tienda", () => {
  it.each([
    ["normal, entregado", "tienda_flete_entregado", TARIFA, NORMAL, "2800.00"],
    ["bodega principal, entregado", "tienda_flete_entregado", TARIFA, CENTRAL, "2500.00"],
    ["normal, devolución", "tienda_flete_rechazo", TARIFA, NORMAL, "1400.00"],
    ["bodega principal, devolución", "tienda_flete_rechazo", TARIFA, CENTRAL, "1250.00"],
    ["pacto, entregado", "tienda_flete_entregado", TARIFA, ESPECIAL, "4100.00"],
    ["pacto, devolución", "tienda_flete_rechazo", TARIFA, ESPECIAL, "3900.00"],
    ["el pacto ignora la bodega principal", "tienda_flete_entregado", TARIFA, ESPECIAL_CENTRAL, "4100.00"],
    ["especial sin pacto cae al flete normal", "tienda_flete_entregado", SIN_PACTO, ESPECIAL, "2800.00"],
    ["especial sin pacto en bodega principal", "tienda_flete_rechazo", SIN_PACTO, ESPECIAL_CENTRAL, "1250.00"],
  ] as const)("%s", (_caso, concepto, tarifa, variante, importe) => {
    expect(referenciaDeCobro(concepto, tarifa, [variante])).toEqual({
      tipo: "monto",
      valor: importe,
      ivaPct: "13.00",
    });
  });

  it("un flete configurado en 0 es un importe en 0, no «No cobra»", () => {
    const cero = { ...TARIFA, valorFlete: "0.00" };
    expect(referenciaDeCobro("tienda_flete_entregado", cero, [NORMAL])).toEqual({
      tipo: "monto",
      valor: "0.00",
      ivaPct: "13.00",
    });
  });

  it.each(["tienda_flete_reprogramado", "tienda_flete_novedad", "tienda_flete_incidente"] as const)(
    "%s: el modelo viejo no lo cobra sea cual sea la tarifa",
    (concepto) => {
      expect(referenciaDeCobro(concepto, TARIFA, [NORMAL])).toEqual({ tipo: "no_cobra" });
    },
  );

  it("sin fila, «Sin tarifa», también en lo que el viejo nunca cobra", () => {
    expect(referenciaDeCobro("tienda_flete_entregado", null, [NORMAL])).toEqual({ tipo: "sin_tarifa" });
    expect(referenciaDeCobro("tienda_flete_novedad", null, [NORMAL])).toEqual({ tipo: "sin_tarifa" });
    expect(referenciaDeCobro("tienda_fulfillment", null, [NORMAL])).toEqual({ tipo: "sin_tarifa" });
    expect(referenciaDeCobro("tienda_comision_cod", null, [NORMAL])).toEqual({ tipo: "sin_tarifa" });
  });
});

describe("SLT-54 R22 — fulfillment y comisión", () => {
  it("fulfillment: su importe, sin IVA en el modelo viejo", () => {
    expect(referenciaDeCobro("tienda_fulfillment", TARIFA, [NORMAL])).toEqual({
      tipo: "monto",
      valor: "150.00",
      ivaPct: null,
    });
  });

  it("comisión: el porcentaje con su IVA propio, sin calcular importe", () => {
    expect(referenciaDeCobro("tienda_comision_cod", TARIFA, [NORMAL])).toEqual({
      tipo: "porcentaje",
      valor: "3.50",
      ivaPct: "2.00",
    });
  });
});

const PAGO: PagoTarifa = { cobroEntregado: "900.00", cobroRechazado: "450.00" };

describe("SLT-54 R21, R22 — el pago", () => {
  it("mensajero por entregado: su importe, sin IVA", () => {
    expect(referenciaDePago("mensajero_entregado", [PAGO])).toEqual({ tipo: "monto", valor: "900.00", ivaPct: null });
  });

  it("satélite por devolución: el cobro por rechazo", () => {
    expect(referenciaDePago("satelite_rechazo", [PAGO])).toEqual({ tipo: "monto", valor: "450.00", ivaPct: null });
  });

  it.each([
    "mensajero_rechazo",
    "mensajero_reprogramado",
    "mensajero_novedad",
    "mensajero_incidente",
    "satelite_entregado",
    "satelite_reprogramado",
    "satelite_novedad",
    "satelite_incidente",
  ] as const)("%s: «No paga» sea cual sea la tarifa", (concepto) => {
    expect(referenciaDePago(concepto, [PAGO])).toEqual({ tipo: "no_paga" });
  });

  it("un 0 configurado es un importe en 0, no «No paga»", () => {
    const cero: PagoTarifa = { cobroEntregado: "0.00", cobroRechazado: "0.00" };
    expect(referenciaDePago("mensajero_entregado", [cero])).toEqual({ tipo: "monto", valor: "0.00", ivaPct: null });
    expect(referenciaDePago("satelite_rechazo", [cero])).toEqual({ tipo: "monto", valor: "0.00", ivaPct: null });
  });

  it("sin fila, «Sin tarifa», también en lo que el viejo nunca paga", () => {
    expect(referenciaDePago("mensajero_entregado", [null])).toEqual({ tipo: "sin_tarifa" });
    expect(referenciaDePago("mensajero_rechazo", [null, null])).toEqual({ tipo: "sin_tarifa" });
    expect(referenciaDePago("satelite_entregado", [])).toEqual({ tipo: "sin_tarifa" });
  });
});

describe("SLT-54 R23 — Varía", () => {
  it("dos variantes con importes distintos: el menor y el mayor", () => {
    expect(referenciaDeCobro("tienda_flete_entregado", TARIFA, [ESPECIAL, NORMAL])).toEqual({
      tipo: "varia",
      desde: "2800.00",
      hasta: "4100.00",
    });
  });

  it("el orden es numérico: 900 es menor que 10000 aunque como texto no lo sea", () => {
    const pagos: PagoTarifa[] = [
      { cobroEntregado: "10000.00", cobroRechazado: "0.00" },
      { cobroEntregado: "900.00", cobroRechazado: "0.00" },
    ];
    expect(referenciaDePago("mensajero_entregado", pagos)).toEqual({
      tipo: "varia",
      desde: "900.00",
      hasta: "10000.00",
    });
  });

  it("dos variantes con el mismo importe no varían: especial sin pacto y distrito sin marca", () => {
    expect(referenciaDeCobro("tienda_flete_entregado", SIN_PACTO, [ESPECIAL, NORMAL])).toEqual({
      tipo: "monto",
      valor: "2800.00",
      ivaPct: "13.00",
    });
  });

  it("vehículos con el mismo pago no varían, y uno sin fila no cuenta", () => {
    expect(referenciaDePago("mensajero_entregado", [PAGO, null, { ...PAGO }])).toEqual({
      tipo: "monto",
      valor: "900.00",
      ivaPct: null,
    });
  });
});

function entrada(cambios: Partial<EntradaReferenciaZona> = {}): EntradaReferenciaZona {
  return {
    esCentral: false,
    distritos: [],
    grupoIds: [],
    cobroZona: TARIFA,
    pagoGeneral: PAGO,
    pagosPorVehiculo: new Map(),
    tienda: null,
    ...cambios,
  };
}

describe("SLT-54 R21, R23 — la referencia de una zona por nivel", () => {
  it("sin distritos, la zona se lee como un distrito sin marca", () => {
    expect(referenciaDeZona(entrada()).zona.tienda_flete_entregado).toEqual({
      tipo: "monto",
      valor: "2800.00",
      ivaPct: "13.00",
    });
  });

  it("en la bodega principal la zona lee su variante", () => {
    expect(referenciaDeZona(entrada({ esCentral: true })).zona.tienda_flete_entregado).toEqual({
      tipo: "monto",
      valor: "2500.00",
      ivaPct: "13.00",
    });
  });

  it("cada grupo varía según las marcas de SUS distritos, y la zona según todos", () => {
    const r = referenciaDeZona(
      entrada({
        grupoIds: ["todos-especiales", "mezcla", "ninguno", "vacio"],
        distritos: [
          { zonaEspecial: true, grupoId: "todos-especiales" },
          { zonaEspecial: true, grupoId: "todos-especiales" },
          { zonaEspecial: true, grupoId: "mezcla" },
          { zonaEspecial: false, grupoId: "mezcla" },
          { zonaEspecial: false, grupoId: "ninguno" },
        ],
      }),
    );
    expect(r.grupos["todos-especiales"].tienda_flete_entregado).toEqual({
      tipo: "monto",
      valor: "4100.00",
      ivaPct: "13.00",
    });
    expect(r.grupos.mezcla.tienda_flete_entregado).toEqual({ tipo: "varia", desde: "2800.00", hasta: "4100.00" });
    expect(r.grupos.ninguno.tienda_flete_entregado).toEqual({ tipo: "monto", valor: "2800.00", ivaPct: "13.00" });
    expect(r.grupos.vacio.tienda_flete_entregado).toEqual({ tipo: "monto", valor: "2800.00", ivaPct: "13.00" });
    expect(r.zona.tienda_flete_entregado).toEqual({ tipo: "varia", desde: "2800.00", hasta: "4100.00" });
  });

  it("«Todos los vehículos» varía entre lo que resuelve cada uno y cada vehículo se lee solo", () => {
    const r = referenciaDeZona(
      entrada({
        pagosPorVehiculo: new Map<string, PagoTarifa | null>([
          ["moto", { cobroEntregado: "700.00", cobroRechazado: "300.00" }],
          ["carro", PAGO],
        ]),
      }),
    );
    expect(r.zona.mensajero_entregado).toEqual({ tipo: "varia", desde: "700.00", hasta: "900.00" });
    expect(r.zona.satelite_rechazo).toEqual({ tipo: "varia", desde: "300.00", hasta: "450.00" });
    expect(r.vehiculos.moto.mensajero_entregado).toEqual({ tipo: "monto", valor: "700.00", ivaPct: null });
    expect(r.vehiculos.carro.mensajero_entregado).toEqual({ tipo: "monto", valor: "900.00", ivaPct: null });
    expect(r.vehiculos.moto.mensajero_rechazo).toEqual({ tipo: "no_paga" });
  });

  it("sin tienda pedida no hay referencia de tienda", () => {
    expect(referenciaDeZona(entrada()).tienda).toBeNull();
  });

  it("una tienda en todas sus zonas varía entre la bodega principal y las demás", () => {
    const r = referenciaDeZona(entrada({ tienda: { cobroEnZona: null, cobroEnTodasSusZonas: TARIFA } }));
    expect(r.tienda?.enTodasSusZonas.tienda_flete_entregado).toEqual({
      tipo: "varia",
      desde: "2500.00",
      hasta: "2800.00",
    });
    expect(r.tienda?.enTodasSusZonas.tienda_flete_rechazo).toEqual({
      tipo: "varia",
      desde: "1250.00",
      hasta: "1400.00",
    });
  });

  it("una tienda en la zona lee su fila, y en cada grupo con las marcas del grupo", () => {
    const propia = { ...TARIFA, valorFlete: "3333.00", tarifaEspecial: "5555.00" };
    const r = referenciaDeZona(
      entrada({
        grupoIds: ["g"],
        distritos: [{ zonaEspecial: true, grupoId: "g" }],
        tienda: { cobroEnZona: propia, cobroEnTodasSusZonas: null },
      }),
    );
    expect(r.tienda?.enZona.tienda_flete_entregado).toEqual({ tipo: "monto", valor: "5555.00", ivaPct: "13.00" });
    expect(r.tienda?.enGrupos.g.tienda_flete_entregado).toEqual({ tipo: "monto", valor: "5555.00", ivaPct: "13.00" });
    expect(r.tienda?.enTodasSusZonas.tienda_flete_entregado).toEqual({ tipo: "sin_tarifa" });
  });
});
