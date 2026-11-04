import { describe, it, expect } from "vitest";
import type { TarifaConcepto } from "@prisma/client";

import {
  elegirCobros,
  elegirPagos,
  rangoCobro,
  rangoPago,
  whereValores,
  type ContextoCobro,
  type ContextoPago,
  type FilaValor,
} from "@/lib/tarifas/precedencia";

/**
 * SLT-52 T2.2 (R16-R22) — la precedencia del modelo nuevo como tabla de casos. Los rangos y
 * niveles esperados estan escritos a mano a partir de requirements.md (R16, R19, R20) y de la
 * decision P2; ninguno sale de las constantes del modulo probado.
 *
 * Esto prueba la REGLA en memoria. Que el WHERE trae las filas correctas de Postgres (y que no
 * trae las de otra empresa) lo prueba el test de integracion de T3.4.
 */

const T = "tienda-1";
const Z = "zona-1";
const G = "grupo-1";
const M = "mensajero-1";
const V = "vehiculo-1";

function fila(p: Partial<FilaValor> & { concepto: TarifaConcepto }): FilaValor & { id: string } {
  const base = { zonaId: null, grupoId: null, tiendaId: null, mensajeroId: null, vehiculoId: null };
  const f = { ...base, ...p };
  return { ...f, id: `${f.concepto}|${f.zonaId}|${f.grupoId}|${f.tiendaId}|${f.mensajeroId}|${f.vehiculoId}` };
}

const COBRO: ContextoCobro = { tiendaId: T, zonaId: Z, grupoId: G };
const PAGO: ContextoPago = { mensajeroId: M, zonaId: Z, grupoId: G, vehiculoId: V };
const FE = "tienda_flete_entregado" as const;
const ME = "mensajero_entregado" as const;
const SE = "satelite_entregado" as const;

describe("rangoCobro · tabla de casos (R16, R17, R18)", () => {
  const casos: Array<[string, FilaValor, ContextoCobro, number | null]> = [
    ["tienda en el grupo del distrito → 1", fila({ concepto: FE, tiendaId: T, zonaId: Z, grupoId: G }), COBRO, 1],
    ["tienda en la zona → 2", fila({ concepto: FE, tiendaId: T, zonaId: Z }), COBRO, 2],
    ["tienda en todas sus zonas → 3", fila({ concepto: FE, tiendaId: T }), COBRO, 3],
    ["grupo del distrito → 4", fila({ concepto: FE, zonaId: Z, grupoId: G }), COBRO, 4],
    ["valor base de la zona → 5", fila({ concepto: FE, zonaId: Z }), COBRO, 5],
    // R18: sin grupo en el contexto los niveles de grupo no aplican; los de zona si.
    ["orden sin grupo: tienda en el grupo → null", fila({ concepto: FE, tiendaId: T, zonaId: Z, grupoId: G }), { ...COBRO, grupoId: null }, null],
    ["orden sin grupo: grupo → null", fila({ concepto: FE, zonaId: Z, grupoId: G }), { ...COBRO, grupoId: null }, null],
    ["orden sin grupo: tienda en la zona sigue → 2", fila({ concepto: FE, tiendaId: T, zonaId: Z }), { ...COBRO, grupoId: null }, 2],
    ["orden sin grupo: zona sigue → 5", fila({ concepto: FE, zonaId: Z }), { ...COBRO, grupoId: null }, 5],
    // Señuelos: otra tienda, otra zona, otro grupo.
    ["otra tienda en la zona → null", fila({ concepto: FE, tiendaId: "tienda-2", zonaId: Z }), COBRO, null],
    ["otra tienda en todas sus zonas → null", fila({ concepto: FE, tiendaId: "tienda-2" }), COBRO, null],
    ["otra tienda en el grupo → null", fila({ concepto: FE, tiendaId: "tienda-2", zonaId: Z, grupoId: G }), COBRO, null],
    ["la tienda en OTRA zona → null", fila({ concepto: FE, tiendaId: T, zonaId: "zona-2" }), COBRO, null],
    ["la tienda en OTRO grupo de su zona → null", fila({ concepto: FE, tiendaId: T, zonaId: Z, grupoId: "grupo-2" }), COBRO, null],
    ["valor base de OTRA zona → null", fila({ concepto: FE, zonaId: "zona-2" }), COBRO, null],
    ["OTRO grupo de la zona → null", fila({ concepto: FE, zonaId: Z, grupoId: "grupo-2" }), COBRO, null],
    ["un concepto de pago nunca es un cobro → null", fila({ concepto: ME, zonaId: Z }), COBRO, null],
  ];

  it.each(casos)("%s", (_nombre, f, ctx, esperado) => {
    expect(rangoCobro(f, ctx)).toBe(esperado);
  });
});

describe("rangoPago · tabla de casos del mensajero (R19, R21, R22) y la satelite (R20)", () => {
  const casosMensajero: Array<[string, FilaValor, ContextoPago, number | null]> = [
    ["valor propio del mensajero → 1", fila({ concepto: ME, mensajeroId: M }), PAGO, 1],
    ["grupo para su vehiculo → 2", fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: V }), PAGO, 2],
    ["grupo para todos → 3", fila({ concepto: ME, zonaId: Z, grupoId: G }), PAGO, 3],
    ["zona para su vehiculo → 4", fila({ concepto: ME, zonaId: Z, vehiculoId: V }), PAGO, 4],
    ["zona para todos → 5", fila({ concepto: ME, zonaId: Z }), PAGO, 5],
    // R21: distrito sin grupo en la zona del mensajero → valores de la zona.
    ["sin grupo: grupo para su vehiculo → null", fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: V }), { ...PAGO, grupoId: null }, null],
    ["sin grupo: grupo → null", fila({ concepto: ME, zonaId: Z, grupoId: G }), { ...PAGO, grupoId: null }, null],
    ["sin grupo: zona sigue → 5", fila({ concepto: ME, zonaId: Z }), { ...PAGO, grupoId: null }, 5],
    // R22: mensajero sin vehiculo → se saltan los niveles por vehiculo.
    ["sin vehiculo: grupo+vehiculo → null", fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: V }), { ...PAGO, vehiculoId: null }, null],
    ["sin vehiculo: zona+vehiculo → null", fila({ concepto: ME, zonaId: Z, vehiculoId: V }), { ...PAGO, vehiculoId: null }, null],
    ["sin vehiculo: grupo sigue → 3", fila({ concepto: ME, zonaId: Z, grupoId: G }), { ...PAGO, vehiculoId: null }, 3],
    // Señuelos.
    ["otro mensajero → null", fila({ concepto: ME, mensajeroId: "mensajero-2" }), PAGO, null],
    ["otra zona → null", fila({ concepto: ME, zonaId: "zona-2" }), PAGO, null],
    ["otro grupo → null", fila({ concepto: ME, zonaId: Z, grupoId: "grupo-2" }), PAGO, null],
    ["otro vehiculo en la zona → null", fila({ concepto: ME, zonaId: Z, vehiculoId: "vehiculo-2" }), PAGO, null],
    ["otro vehiculo en el grupo → null", fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: "vehiculo-2" }), PAGO, null],
    ["un concepto de la satelite no paga al mensajero → null", fila({ concepto: SE, zonaId: Z }), PAGO, null],
    ["un cobro a la tienda no paga al mensajero → null", fila({ concepto: FE, zonaId: Z }), PAGO, null],
  ];

  it.each(casosMensajero)("mensajero: %s", (_nombre, f, ctx, esperado) => {
    expect(rangoPago(f, ctx, "mensajero")).toBe(esperado);
  });

  const casosSatelite: Array<[string, FilaValor, number | null]> = [
    ["grupo para su vehiculo → 2", fila({ concepto: SE, zonaId: Z, grupoId: G, vehiculoId: V }), 2],
    ["grupo para todos → 3", fila({ concepto: SE, zonaId: Z, grupoId: G }), 3],
    ["zona para su vehiculo → 4", fila({ concepto: SE, zonaId: Z, vehiculoId: V }), 4],
    ["zona para todos → 5", fila({ concepto: SE, zonaId: Z }), 5],
    ["sin el nivel del mensajero: una fila con mensajero → null", fila({ concepto: SE, mensajeroId: M }), null],
    ["un concepto del mensajero no paga a la satelite → null", fila({ concepto: ME, zonaId: Z }), null],
  ];

  it.each(casosSatelite)("satelite: %s", (_nombre, f, esperado) => {
    expect(rangoPago(f, PAGO, "satelite")).toBe(esperado);
  });
});

describe("elegirCobros · cada nivel gana al siguiente, concepto por concepto", () => {
  const niveles = [
    fila({ concepto: FE, tiendaId: T, zonaId: Z, grupoId: G }),
    fila({ concepto: FE, tiendaId: T, zonaId: Z }),
    fila({ concepto: FE, tiendaId: T }),
    fila({ concepto: FE, zonaId: Z, grupoId: G }),
    fila({ concepto: FE, zonaId: Z }),
  ];
  const esperados = ["tienda_grupo", "tienda_zona", "tienda_general", "grupo", "zona"];
  const ctx = new Map([["orden-1", COBRO]]);

  it.each(esperados.map((nivel, i) => [nivel, i] as const))(
    "quitando los niveles anteriores, gana %s",
    (nivel, i) => {
      // Las filas se pasan al reves para que el ganador no dependa del orden de entrada.
      const filas = niveles.slice(i).reverse();
      const elegido = elegirCobros(filas, ctx, [FE]).get("orden-1")?.get(FE);
      expect(elegido?.nivel).toBe(nivel);
      expect(elegido?.fila).toBe(niveles[i]);
    },
  );

  it("R17: la tienda sin pacto en el grupo pero con pacto en la zona usa su zona antes que el grupo", () => {
    const tiendaZona = fila({ concepto: FE, tiendaId: T, zonaId: Z });
    const filas = [fila({ concepto: FE, zonaId: Z, grupoId: G }), tiendaZona];
    const elegido = elegirCobros(filas, ctx, [FE]).get("orden-1")?.get(FE);
    expect(elegido?.fila).toBe(tiendaZona);
    expect(elegido?.nivel).toBe("tienda_zona");
  });

  it("R18: orden sin distrito (sin grupo) salta la tienda en el grupo y el grupo", () => {
    const filas = [
      fila({ concepto: FE, tiendaId: T, zonaId: Z, grupoId: G }),
      fila({ concepto: FE, zonaId: Z, grupoId: G }),
      fila({ concepto: FE, zonaId: Z }),
    ];
    const sinGrupo = new Map([["orden-1", { ...COBRO, grupoId: null }]]);
    expect(elegirCobros(filas, sinGrupo, [FE]).get("orden-1")?.get(FE)?.nivel).toBe("zona");
  });

  it("R16: la eleccion es independiente por concepto (la tienda pacta solo el flete por entregado)", () => {
    const FR = "tienda_flete_rechazo" as const;
    const filas = [fila({ concepto: FE, tiendaId: T, zonaId: Z }), fila({ concepto: FE, zonaId: Z }), fila({ concepto: FR, zonaId: Z })];
    const r = elegirCobros(filas, ctx, [FE, FR]).get("orden-1");
    expect(r?.get(FE)?.nivel).toBe("tienda_zona");
    expect(r?.get(FR)?.nivel).toBe("zona");
  });

  it("R23: un concepto sin fila en ningun nivel es `null` (sin tarifa); solo señuelos tambien", () => {
    const filas = [fila({ concepto: FE, zonaId: "zona-2" }), fila({ concepto: FE, tiendaId: "tienda-2" })];
    const r = elegirCobros(filas, ctx, [FE, "tienda_fulfillment"]).get("orden-1");
    expect(r?.get(FE)).toBeNull();
    expect(r?.get("tienda_fulfillment")).toBeNull();
  });

  it("varios contextos en una sola llamada eligen cada uno lo suyo", () => {
    const filas = [fila({ concepto: FE, zonaId: Z }), fila({ concepto: FE, tiendaId: "tienda-2", zonaId: Z })];
    const ctxs = new Map<string, ContextoCobro>([
      ["a", COBRO],
      ["b", { tiendaId: "tienda-2", zonaId: Z, grupoId: null }],
    ]);
    const r = elegirCobros(filas, ctxs, [FE]);
    expect(r.get("a")?.get(FE)?.nivel).toBe("zona");
    expect(r.get("b")?.get(FE)?.nivel).toBe("tienda_zona");
  });
});

describe("elegirPagos · cada nivel gana al siguiente; mensajero y satelite a la vez", () => {
  const niveles = [
    fila({ concepto: ME, mensajeroId: M }),
    fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: V }),
    fila({ concepto: ME, zonaId: Z, grupoId: G }),
    fila({ concepto: ME, zonaId: Z, vehiculoId: V }),
    fila({ concepto: ME, zonaId: Z }),
  ];
  const esperados = ["mensajero", "grupo_vehiculo", "grupo", "zona_vehiculo", "zona"];
  const ctx = new Map([["gestion-1", PAGO]]);

  it.each(esperados.map((nivel, i) => [nivel, i] as const))(
    "quitando los niveles anteriores, gana %s",
    (nivel, i) => {
      const filas = niveles.slice(i).reverse();
      const elegido = elegirPagos(filas, ctx, [ME]).get("gestion-1")?.get(ME);
      expect(elegido?.nivel).toBe(nivel);
      expect(elegido?.fila).toBe(niveles[i]);
    },
  );

  it("P2: el grupo para todos gana a la zona para su vehiculo", () => {
    const grupo = fila({ concepto: ME, zonaId: Z, grupoId: G });
    const filas = [fila({ concepto: ME, zonaId: Z, vehiculoId: V }), grupo];
    const elegido = elegirPagos(filas, ctx, [ME]).get("gestion-1")?.get(ME);
    // Se mira la FILA, no solo la etiqueta: con dos rangos invertidos la etiqueta del rango 3
    // seguiria diciendo «grupo» aunque ganara la fila de zona+vehiculo.
    expect(elegido?.fila).toBe(grupo);
    expect(elegido?.nivel).toBe("grupo");
  });

  it("R20/R32: la satelite elige con su propio concepto y varios resultados a la vez", () => {
    const SR = "satelite_rechazo" as const;
    const filas = [
      fila({ concepto: SE, zonaId: Z }),
      fila({ concepto: SE, zonaId: Z, grupoId: G, vehiculoId: V }),
      fila({ concepto: SR, zonaId: Z }),
      fila({ concepto: ME, zonaId: Z, grupoId: G }),
    ];
    const r = elegirPagos(filas, ctx, [ME, SE, SR]).get("gestion-1");
    expect(r?.get(ME)?.nivel).toBe("grupo");
    expect(r?.get(SE)?.nivel).toBe("grupo_vehiculo");
    expect(r?.get(SR)?.nivel).toBe("zona");
  });

  it("R22: sin vehiculo gana el grupo para todos aunque haya grupo+vehiculo", () => {
    const filas = [fila({ concepto: ME, zonaId: Z, grupoId: G, vehiculoId: V }), fila({ concepto: ME, zonaId: Z, grupoId: G })];
    const sinVehiculo = new Map([["gestion-1", { ...PAGO, vehiculoId: null }]]);
    expect(elegirPagos(filas, sinVehiculo, [ME]).get("gestion-1")?.get(ME)?.nivel).toBe("grupo");
  });

  it("R23: sin ninguna fila del concepto, `null`", () => {
    expect(elegirPagos([], ctx, [ME]).get("gestion-1")?.get(ME)).toBeNull();
  });
});

describe("whereValores · forma de la consulta unica del lote (R39)", () => {
  it("tres ramas (zona; tienda en todas sus zonas; mensajero) y los conceptos, sin repetidos", () => {
    expect(
      whereValores({
        zonas: ["zona-1", "zona-2", "zona-1"],
        tiendas: ["tienda-1", "tienda-1"],
        mensajeros: ["mensajero-1"],
        conceptos: ["tienda_flete_entregado", "tienda_comision_cod", "tienda_flete_entregado"],
      }),
    ).toEqual({
      concepto: { in: ["tienda_flete_entregado", "tienda_comision_cod"] },
      OR: [
        { zonaId: { in: ["zona-1", "zona-2"] } },
        { tiendaId: { in: ["tienda-1"] }, zonaId: null },
        { mensajeroId: { in: ["mensajero-1"] } },
      ],
    });
  });

  it("listas vacias se quedan vacias (no se inventa un filtro abierto)", () => {
    expect(whereValores({ zonas: [], tiendas: [], mensajeros: [], conceptos: [] })).toEqual({
      concepto: { in: [] },
      OR: [{ zonaId: { in: [] } }, { tiendaId: { in: [] }, zonaId: null }, { mensajeroId: { in: [] } }],
    });
  });
});
