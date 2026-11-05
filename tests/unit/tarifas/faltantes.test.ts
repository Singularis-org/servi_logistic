import { describe, expect, it } from "vitest";
import type { TarifaConcepto } from "@prisma/client";

import { CONCEPTOS_ESENCIALES, faltantesDeZona, zonasCompletas, type ValorDeNivel } from "@/lib/tarifas/faltantes";

// SLT-54 T2.1 (design §5, R13-R17) — la tabla de casos de lo que falta. Los esperados son literales: el
// numero de faltantes y su concepto se cuentan a mano en cada caso.

const ZONA = { id: "z1" };
const G1 = { id: "g1", nombre: "Especial" };
const MOTO = { id: "moto" };
const CARRO = { id: "carro" };

function valor(concepto: TarifaConcepto, nivel: Partial<ValorDeNivel> = {}): ValorDeNivel {
  return { concepto, zonaId: "z1", grupoId: null, tiendaId: null, mensajeroId: null, vehiculoId: null, ...nivel };
}

/** Los tres esenciales a nivel zona. */
const ZONA_COMPLETA = [
  valor("tienda_flete_entregado"),
  valor("tienda_flete_rechazo"),
  valor("mensajero_entregado"),
];

function juzgar(valores: ValorDeNivel[], extra: Partial<Parameters<typeof faltantesDeZona>[0]> = {}) {
  return faltantesDeZona({ zona: ZONA, grupos: [], valores, vehiculosActivos: [MOTO, CARRO], ...extra });
}

const nombres = (r: ReturnType<typeof juzgar>) => r.faltantes.map((f) => f.concepto);

describe("SLT-54 R13 — los esenciales", () => {
  it("son exactamente tres: flete por entregado, flete por devolución a origen y pago al mensajero por entregado", () => {
    expect(CONCEPTOS_ESENCIALES).toEqual(["tienda_flete_entregado", "tienda_flete_rechazo", "mensajero_entregado"]);
  });

  it("los demás conceptos no cuentan: sin comisión ni fulfillment, la zona está completa", () => {
    expect(juzgar(ZONA_COMPLETA)).toEqual({ estado: "completa", faltantes: [], usaZona: [] });
  });

  it("los demás conceptos no suplen a un esencial", () => {
    const r = juzgar([
      valor("tienda_comision_cod"),
      valor("tienda_fulfillment"),
      valor("tienda_flete_reprogramado"),
      valor("mensajero_rechazo"),
      valor("satelite_entregado"),
    ]);
    expect(nombres(r)).toEqual(["tienda_flete_entregado", "tienda_flete_rechazo", "mensajero_entregado"]);
  });
});

describe("SLT-54 R14 — qué resuelve a una zona", () => {
  it("un 0 escrito no es un faltante: la fila existe, el importe no se mira", () => {
    // `valor` no lleva importe a proposito: la regla es que la fila exista. Sin esto, un filtro por
    // importe mayor que 0 solo se podria escribir si la entrada lo trajera.
    expect(juzgar(ZONA_COMPLETA).estado).toBe("completa");
  });

  it("un precio de tienda no cubre a la zona, ni en la zona ni en un grupo", () => {
    const r = juzgar(
      [
        valor("tienda_flete_entregado", { tiendaId: "t1" }),
        valor("tienda_flete_rechazo", { tiendaId: "t1", grupoId: "g1" }),
        valor("mensajero_entregado"),
      ],
      { grupos: [G1] },
    );
    expect(nombres(r)).toEqual(["tienda_flete_entregado", "tienda_flete_rechazo"]);
    expect(r.estado).toBe("faltan");
  });

  it("un valor propio del mensajero no cubre a la zona", () => {
    const r = juzgar([
      valor("tienda_flete_entregado"),
      valor("tienda_flete_rechazo"),
      valor("mensajero_entregado", { zonaId: null, mensajeroId: "m1" }),
    ]);
    expect(nombres(r)).toEqual(["mensajero_entregado"]);
  });

  it("los valores de otra zona no cuentan", () => {
    const r = juzgar(ZONA_COMPLETA.map((v) => ({ ...v, zonaId: "otra" })));
    expect(r.faltantes).toHaveLength(3);
    expect(r.estado).toBe("sin_empezar");
  });

  it("zona con solo grupos: un esencial que solo tiene el grupo falta en la zona, una sola vez", () => {
    const r = juzgar(
      [
        valor("tienda_flete_entregado", { grupoId: "g1" }),
        valor("tienda_flete_entregado", { grupoId: "g2" }),
        valor("tienda_flete_rechazo"),
        valor("mensajero_entregado"),
      ],
      { grupos: [G1, { id: "g2", nombre: "Otra" }] },
    );
    expect(r.faltantes).toEqual([{ concepto: "tienda_flete_entregado" }]);
    expect(r.estado).toBe("faltan");
  });

  it("un esencial que falta en la zona y en sus dos grupos sigue siendo un solo faltante", () => {
    const r = juzgar(
      [valor("tienda_flete_rechazo"), valor("mensajero_entregado")],
      { grupos: [G1, { id: "g2", nombre: "Otra" }] },
    );
    expect(r.faltantes).toEqual([{ concepto: "tienda_flete_entregado" }]);
  });
});

describe("SLT-54 R15 — el pago al mensajero por entregado", () => {
  const COBROS = [valor("tienda_flete_entregado"), valor("tienda_flete_rechazo")];

  it("cubierto con el valor para todos los vehículos", () => {
    expect(juzgar([...COBROS, valor("mensajero_entregado")]).estado).toBe("completa");
  });

  it("cubierto con un valor por cada vehículo activo", () => {
    const r = juzgar([
      ...COBROS,
      valor("mensajero_entregado", { vehiculoId: "moto" }),
      valor("mensajero_entregado", { vehiculoId: "carro" }),
    ]);
    expect(r.estado).toBe("completa");
  });

  it("le falta si queda un vehículo activo sin valor", () => {
    const r = juzgar([...COBROS, valor("mensajero_entregado", { vehiculoId: "moto" })]);
    expect(nombres(r)).toEqual(["mensajero_entregado"]);
  });

  it("un vehículo inactivo no se exige: basta con los activos", () => {
    const r = juzgar([...COBROS, valor("mensajero_entregado", { vehiculoId: "moto" })], { vehiculosActivos: [MOTO] });
    expect(r.estado).toBe("completa");
  });

  it("el valor de un vehículo inactivo no suple al de uno activo", () => {
    const r = juzgar([...COBROS, valor("mensajero_entregado", { vehiculoId: "inactivo" })], {
      vehiculosActivos: [MOTO],
    });
    expect(nombres(r)).toEqual(["mensajero_entregado"]);
  });

  it("sin vehículos activos en el catálogo, solo lo cubre el valor para todos", () => {
    const sinCatalogo = { vehiculosActivos: [] };
    expect(nombres(juzgar(COBROS, sinCatalogo))).toEqual(["mensajero_entregado"]);
    expect(juzgar([...COBROS, valor("mensajero_entregado")], sinCatalogo).estado).toBe("completa");
  });

  it("los valores por vehículo de un grupo no cubren a la zona", () => {
    const r = juzgar(
      [
        ...COBROS,
        valor("mensajero_entregado", { grupoId: "g1", vehiculoId: "moto" }),
        valor("mensajero_entregado", { grupoId: "g1", vehiculoId: "carro" }),
      ],
      { grupos: [G1] },
    );
    expect(nombres(r)).toEqual(["mensajero_entregado"]);
  });
});

describe("SLT-54 R16 — un grupo sin valor propio usa el de la zona", () => {
  it("no suma faltante y se informa, un aviso por esencial", () => {
    const r = juzgar(ZONA_COMPLETA, { grupos: [G1] });
    expect(r.estado).toBe("completa");
    expect(r.faltantes).toEqual([]);
    expect(r.usaZona).toEqual([
      { grupoId: "g1", grupoNombre: "Especial", concepto: "tienda_flete_entregado" },
      { grupoId: "g1", grupoNombre: "Especial", concepto: "tienda_flete_rechazo" },
      { grupoId: "g1", grupoNombre: "Especial", concepto: "mensajero_entregado" },
    ]);
  });

  it("un grupo con valor propio no se informa", () => {
    const r = juzgar(
      [
        ...ZONA_COMPLETA,
        valor("tienda_flete_entregado", { grupoId: "g1" }),
        valor("mensajero_entregado", { grupoId: "g1", vehiculoId: "moto" }),
        valor("mensajero_entregado", { grupoId: "g1", vehiculoId: "carro" }),
      ],
      { grupos: [G1] },
    );
    expect(r.usaZona).toEqual([{ grupoId: "g1", grupoNombre: "Especial", concepto: "tienda_flete_rechazo" }]);
  });

  it("un esencial que falta en la zona no se informa como «usa el valor de la zona»: no hay valor que usar", () => {
    const r = juzgar([valor("tienda_flete_rechazo"), valor("mensajero_entregado")], { grupos: [G1] });
    expect(r.usaZona.map((a) => a.concepto)).toEqual(["tienda_flete_rechazo", "mensajero_entregado"]);
  });
});

describe("SLT-54 R17 — estados", () => {
  it("Sin empezar: ningún valor de nivel zona o grupo, con sus tres faltantes", () => {
    const r = juzgar([]);
    expect(r.estado).toBe("sin_empezar");
    expect(r.faltantes).toHaveLength(3);
  });

  it("un precio de tienda no saca a la zona de «Sin empezar»", () => {
    expect(juzgar([valor("tienda_flete_entregado", { tiendaId: "t1" })]).estado).toBe("sin_empezar");
  });

  it("Faltan: un valor que no es esencial ya la saca de «Sin empezar»", () => {
    const r = juzgar([valor("tienda_comision_cod")]);
    expect(r.estado).toBe("faltan");
    expect(r.faltantes).toHaveLength(3);
  });

  it("Faltan: un valor solo de grupo ya la saca de «Sin empezar»", () => {
    expect(juzgar([valor("satelite_rechazo", { grupoId: "g1" })], { grupos: [G1] }).estado).toBe("faltan");
  });

  it("M de T: cuenta solo las completas", () => {
    expect(
      zonasCompletas([{ estado: "completa" }, { estado: "faltan" }, { estado: "sin_empezar" }, { estado: "completa" }]),
    ).toBe(2);
  });
});
